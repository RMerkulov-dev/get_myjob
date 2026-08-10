-- =============================================================
--  Skill Dossier — схема базы для Supabase
--  Открой Supabase → SQL Editor → New query → вставь всё это → Run
--
--  Скрипт идемпотентный: его можно прогонять повторно.
--  Если база уже была создана в однопользовательской версии, он сам
--  добавит user_id, привяжет существующие строки к первому аккаунту
--  и заменит политики. Данные не теряются.
-- =============================================================

create extension if not exists "pgcrypto";

-- ------------------------------------------------------------------
-- Вакансии (то, что ты вставляешь копипастой)
-- ------------------------------------------------------------------
create table if not exists public.vacancies (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title         text not null default 'Untitled',
  company       text,
  position_type text not null default 'PM' check (position_type in ('PM', 'BA', 'PM/BA')),
  seniority     text,
  location      text,
  salary        text,
  source_url    text,
  summary       text,
  raw_text      text not null,
  created_at    timestamptz not null default now()
);

-- ------------------------------------------------------------------
-- Требования / технологии — справочник без дублей, свой у каждого
-- ------------------------------------------------------------------
create table if not exists public.skills (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name        text not null,
  slug        text not null,                     -- нормализованный ключ для дедупликации
  aliases     text[] not null default '{}',      -- варианты написания, встреченные в вакансиях
  category    text not null default 'other',
  description text,
  level       smallint not null default 0 check (level between 0 and 5),
  learned     boolean not null default false,
  importance  text not null default 'nice' check (importance in ('must', 'nice')),
  positions   text[] not null default '{}',      -- {PM}, {BA} или {PM,BA}
  mentions    integer not null default 0,        -- в скольких вакансиях встретилось (считает триггер)
  notes       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ------------------------------------------------------------------
-- Связка «вакансия ↔ требование»
-- ------------------------------------------------------------------
create table if not exists public.vacancy_skills (
  vacancy_id uuid not null references public.vacancies (id) on delete cascade,
  skill_id   uuid not null references public.skills (id)    on delete cascade,
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  importance text not null default 'nice' check (importance in ('must', 'nice')),
  context    text,
  created_at timestamptz not null default now(),
  primary key (vacancy_id, skill_id)
);

-- ------------------------------------------------------------------
-- История чата с ИИ
-- ------------------------------------------------------------------
create table if not exists public.chat_messages (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  role       text not null check (role in ('user', 'assistant')),
  content    text not null,
  created_at timestamptz not null default now()
);

-- ==================================================================
--  Миграция с однопользовательской версии
-- ==================================================================

-- 1. Добавляем user_id тем, у кого его ещё нет
alter table public.vacancies      add column if not exists user_id uuid references auth.users (id) on delete cascade;
alter table public.skills         add column if not exists user_id uuid references auth.users (id) on delete cascade;
alter table public.vacancy_skills add column if not exists user_id uuid references auth.users (id) on delete cascade;
alter table public.chat_messages  add column if not exists user_id uuid references auth.users (id) on delete cascade;

-- 2. Привязываем осиротевшие строки к первому созданному аккаунту (это владелец базы)
do $$
declare owner_id uuid;
begin
  select id into owner_id from auth.users order by created_at limit 1;
  if owner_id is not null then
    update public.vacancies      set user_id = owner_id where user_id is null;
    update public.skills         set user_id = owner_id where user_id is null;
    update public.vacancy_skills set user_id = owner_id where user_id is null;
    update public.chat_messages  set user_id = owner_id where user_id is null;
  end if;
end $$;

-- 3. Теперь можно требовать заполненность и подставлять автора автоматически
do $$
declare t text;
begin
  foreach t in array array['vacancies', 'skills', 'vacancy_skills', 'chat_messages'] loop
    execute format('alter table public.%I alter column user_id set default auth.uid()', t);
    -- not null включаем только если пустых строк не осталось
    if (select count(*) from public.skills where user_id is null) = 0 then
      execute format('alter table public.%I alter column user_id set not null', t);
    end if;
  end loop;
end $$;

-- 4. Уникальность slug теперь в пределах пользователя:
--    «Jira» может быть у каждого своя, а внутри одного аккаунта — одна.
alter table public.skills drop constraint if exists skills_slug_key;
drop index if exists public.skills_user_slug_idx;
create unique index skills_user_slug_idx on public.skills (user_id, slug);

create index if not exists skills_user_idx        on public.skills (user_id);
create index if not exists skills_category_idx    on public.skills (category);
create index if not exists skills_learned_idx     on public.skills (learned);
create index if not exists vacancies_user_idx     on public.vacancies (user_id);
create index if not exists vacancy_skills_skill_idx on public.vacancy_skills (skill_id);
create index if not exists chat_messages_user_idx on public.chat_messages (user_id, created_at);

-- ------------------------------------------------------------------
-- updated_at сам себя обновляет
-- ------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists skills_touch_updated_at on public.skills;
create trigger skills_touch_updated_at
  before update on public.skills
  for each row execute function public.touch_updated_at();

-- ------------------------------------------------------------------
-- mentions пересчитывается автоматически (в т.ч. при удалении вакансии)
-- ------------------------------------------------------------------
create or replace function public.sync_skill_mentions()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  target uuid := coalesce(new.skill_id, old.skill_id);
begin
  update public.skills s
     set mentions = (select count(*) from public.vacancy_skills vs where vs.skill_id = target)
   where s.id = target;
  return null;
end $$;

drop trigger if exists vacancy_skills_sync_mentions on public.vacancy_skills;
create trigger vacancy_skills_sync_mentions
  after insert or delete on public.vacancy_skills
  for each row execute function public.sync_skill_mentions();

-- ==================================================================
--  Доступ: каждый видит и правит ТОЛЬКО свои строки.
--  Анонимный доступ закрыт полностью.
--
--  Аккаунты создаются вручную: Supabase → Authentication → Users →
--  Add user (с включённым «Auto Confirm User»). Самостоятельную
--  регистрацию лучше выключить: Authentication → Providers → Email →
--  «Allow new users to sign up» → off.
-- ==================================================================

drop function if exists public.is_owner();

alter table public.vacancies      enable row level security;
alter table public.skills         enable row level security;
alter table public.vacancy_skills enable row level security;
alter table public.chat_messages  enable row level security;

do $$
declare t text;
begin
  foreach t in array array['vacancies', 'skills', 'vacancy_skills', 'chat_messages'] loop
    -- политики прежних версий схемы
    execute format('drop policy if exists "personal_full_access" on public.%I', t);
    execute format('drop policy if exists "owner_full_access" on public.%I', t);
    execute format('drop policy if exists "own_rows" on public.%I', t);
    execute format(
      'create policy "own_rows" on public.%I for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid())',
      t);
  end loop;
end $$;

-- Связки — отдельная, более строгая политика: FK не проверяет владельца,
-- поэтому без этого можно было бы привязаться к чужой вакансии или требованию
-- и накрутить чужой счётчик упоминаний.
drop policy if exists "own_rows" on public.vacancy_skills;
create policy "own_rows" on public.vacancy_skills
  for all to authenticated
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and exists (select 1 from public.vacancies v where v.id = vacancy_id and v.user_id = auth.uid())
    and exists (select 1 from public.skills   s where s.id = skill_id   and s.user_id = auth.uid())
  );

-- Представление из первой версии схемы: читалось в обход RLS, поэтому убрано.
drop view if exists public.skills_overview;
