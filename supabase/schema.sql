-- =============================================================
--  Skill Dossier — схема базы для Supabase
--  Открой Supabase → SQL Editor → New query → вставь всё это → Run
-- =============================================================

create extension if not exists "pgcrypto";

-- ------------------------------------------------------------------
-- Вакансии (то, что ты вставляешь копипастой)
-- ------------------------------------------------------------------
create table if not exists public.vacancies (
  id            uuid primary key default gen_random_uuid(),
  title         text not null default 'Без названия',
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
-- Требования / технологии — единый справочник без дублей
-- ------------------------------------------------------------------
create table if not exists public.skills (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  slug        text not null unique,              -- нормализованный ключ для дедупликации
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

create index if not exists skills_slug_idx     on public.skills (slug);
create index if not exists skills_category_idx on public.skills (category);
create index if not exists skills_learned_idx  on public.skills (learned);

-- ------------------------------------------------------------------
-- Связка «вакансия ↔ требование»
-- ------------------------------------------------------------------
create table if not exists public.vacancy_skills (
  vacancy_id uuid not null references public.vacancies (id) on delete cascade,
  skill_id   uuid not null references public.skills (id)    on delete cascade,
  importance text not null default 'nice' check (importance in ('must', 'nice')),
  context    text,                                 -- цитата из вакансии
  created_at timestamptz not null default now(),
  primary key (vacancy_id, skill_id)
);

create index if not exists vacancy_skills_skill_idx on public.vacancy_skills (skill_id);

-- ------------------------------------------------------------------
-- История чата с ИИ
-- ------------------------------------------------------------------
create table if not exists public.chat_messages (
  id         uuid primary key default gen_random_uuid(),
  role       text not null check (role in ('user', 'assistant')),
  content    text not null,
  created_at timestamptz not null default now()
);

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
returns trigger language plpgsql as $$
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
--  Доступ: данные видит только владелец, вошедший через Supabase Auth.
--
--  ЕДИНСТВЕННОЕ МЕСТО, ГДЕ МЕНЯЕТСЯ ВЛАДЕЛЕЦ — функция is_owner ниже.
--  Впиши туда свой email (тот же, которым входишь в приложение).
--  Анонимный доступ закрыт полностью: даже зная URL и anon-ключ,
--  посторонний не прочитает и не удалит ни строки.
-- ==================================================================

create or replace function public.is_owner()
returns boolean
language sql
stable
as $$
  select lower(coalesce(auth.jwt() ->> 'email', '')) = any (array[
    'fotoromario@gmail.com',
    'roman.merkulov@dynamicalabs.com'
  ])
$$;

alter table public.vacancies      enable row level security;
alter table public.skills         enable row level security;
alter table public.vacancy_skills enable row level security;
alter table public.chat_messages  enable row level security;

do $$
declare t text;
begin
  foreach t in array array['vacancies', 'skills', 'vacancy_skills', 'chat_messages'] loop
    -- сносим политику из первой версии схемы, если она осталась
    execute format('drop policy if exists "personal_full_access" on public.%I', t);
    execute format('drop policy if exists "owner_full_access" on public.%I', t);
    execute format(
      'create policy "owner_full_access" on public.%I for all to authenticated using (public.is_owner()) with check (public.is_owner())',
      t);
  end loop;
end $$;

-- ------------------------------------------------------------------
-- Представление skills_overview из первой версии схемы больше не нужно:
-- приложение его не запрашивало, а представления читаются с правами
-- владельца и в обход RLS — то есть были бы дыркой для анонимов.
-- ------------------------------------------------------------------
drop view if exists public.skills_overview;
