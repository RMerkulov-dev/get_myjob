import { requireSupabase } from './supabase'
import { localeOf, t } from '../i18n'
import { canonicalName, findExistingSkill, prettifyName, toSlug } from './normalize'
import { positionTags } from './constants'

function unwrap({ data, error }) {
  if (error) throw new Error(error.message ?? t('errors.supabaseGeneric'))
  return data
}

const uniq = (arr) => [...new Set(arr.filter(Boolean))]

// ---------------------------------------------------------------- навыки

export async function fetchSkills() {
  const sb = requireSupabase()
  return unwrap(await sb.from('skills').select('*').order('created_at', { ascending: false })) ?? []
}

export async function updateSkill(id, patch) {
  const sb = requireSupabase()
  const rows = unwrap(await sb.from('skills').update(patch).eq('id', id).select())
  return rows?.[0]
}

export async function deleteSkill(id) {
  const sb = requireSupabase()
  unwrap(await sb.from('skills').delete().eq('id', id))
}

export async function createSkillManually({ name, category = 'other', positions = ['PM'], level = 0 }) {
  const sb = requireSupabase()
  const clean = canonicalName(name)
  const raw = prettifyName(name)
  const rows = unwrap(
    await sb
      .from('skills')
      .insert({
        name: clean,
        slug: toSlug(clean),
        aliases: raw === clean ? [] : [raw],
        category,
        positions,
        level,
        learned: level >= 4,
        importance: 'nice',
      })
      .select(),
  )
  return rows?.[0]
}

// ---------------------------------------------------------------- вакансии

export async function fetchVacancies() {
  const sb = requireSupabase()
  return (
    unwrap(
      await sb
        .from('vacancies')
        .select('*, vacancy_skills(skill_id, importance, context, skills(id, name, category, level, learned))')
        .order('created_at', { ascending: false }),
    ) ?? []
  )
}

export async function deleteVacancy(id) {
  const sb = requireSupabase()
  unwrap(await sb.from('vacancies').delete().eq('id', id))
}

// ---------------------------------------------------------------- разбор → база

/**
 * Сопоставляет разобранные требования с уже существующими в базе.
 * Возвращает элементы для экрана подтверждения: status = 'new' | 'existing'.
 */
export function reconcileRequirements(requirements, existingSkills) {
  const seenSlugs = new Map() // slug → индекс в результате, чтобы схлопнуть дубли внутри одной вакансии
  const items = []

  for (const req of requirements) {
    const slug = toSlug(req.name)
    if (!slug) continue

    if (seenSlugs.has(slug)) {
      const prev = items[seenSlugs.get(slug)]
      if (req.importance === 'must') prev.importance = 'must'
      prev.aliases = uniq([...prev.aliases, ...req.aliases])
      continue
    }

    const match = findExistingSkill(req.name, existingSkills)
    const display = match ? match.name : canonicalName(req.name)
    // формулировку из вакансии сохраняем алиасом, если она отличается от канонической
    const aliases = uniq([...req.aliases, req.name !== display ? req.name : null])

    seenSlugs.set(slug, items.length)
    items.push({
      ...req,
      slug,
      aliases,
      name: display,
      status: match ? 'existing' : 'new',
      existing: match ?? null,
      include: true,
      level: match?.level ?? 0,
    })
  }

  // сначала новое, внутри — обязательное выше желательного
  return items.sort((a, b) => {
    if (a.status !== b.status) return a.status === 'new' ? -1 : 1
    if (a.importance !== b.importance) return a.importance === 'must' ? -1 : 1
    return a.name.localeCompare(b.name, localeOf())
  })
}

/**
 * Сохраняет вакансию, добавляет только новые требования,
 * а существующим дополняет позиции/алиасы/важность.
 *
 * @returns {{vacancyId: string, created: number, updated: number}}
 */
export async function saveParsedVacancy({ rawText, positionType, vacancy, items, existingSkills }) {
  const sb = requireSupabase()
  const chosen = items.filter((i) => i.include)
  const tags = positionTags(positionType)

  const vacancyRow = unwrap(
    await sb
      .from('vacancies')
      .insert({
        title: vacancy.title || 'Untitled',
        company: vacancy.company || null,
        position_type: positionType,
        seniority: vacancy.seniority || null,
        location: vacancy.location || null,
        salary: vacancy.salary || null,
        summary: vacancy.summary || null,
        raw_text: rawText,
      })
      .select()
      .single(),
  )

  const newItems = chosen.filter((i) => i.status === 'new')
  const oldItems = chosen.filter((i) => i.status === 'existing' && i.existing)

  // 1. Новые требования.
  //    Уникальность — (user_id, slug): у каждого пользователя свой набор требований.
  //    ignoreDuplicates: true — если такой slug уже появился (другая вкладка,
  //    устаревший снапшот, повторный импорт), существующую запись НЕ перезатираем:
  //    иначе выставленный уровень и отметка «выучено» обнулились бы.
  let createdRows = []
  if (newItems.length) {
    createdRows =
      unwrap(
        await sb
          .from('skills')
          .upsert(
            newItems.map((i) => ({
              name: i.name,
              slug: i.slug,
              aliases: uniq(i.aliases),
              category: i.category,
              description: i.description,
              importance: i.importance,
              positions: tags,
              level: i.level ?? 0,
              learned: (i.level ?? 0) >= 4,
            })),
            { onConflict: 'user_id,slug', ignoreDuplicates: true },
          )
          .select(),
      ) ?? []
  }

  // 2. Существующие — дополняем контекстом из новой вакансии
  for (const item of oldItems) {
    const prev = item.existing
    const patch = {
      positions: uniq([...(prev.positions ?? []), ...tags]),
      aliases: uniq([...(prev.aliases ?? []), ...item.aliases]),
    }
    // «желательно» апгрейдится до «обязательно», обратно — нет
    if (item.importance === 'must' && prev.importance !== 'must') patch.importance = 'must'
    if (!prev.description && item.description) patch.description = item.description
    await sb.from('skills').update(patch).eq('id', prev.id)
  }

  // 3. Связи вакансия ↔ требования (триггер сам пересчитает mentions).
  //    id берём из базы по slug: так ссылка не потеряется, даже если запись
  //    создалась не этим вызовом (см. ignoreDuplicates выше).
  const slugs = chosen.map((i) => i.slug)
  const slugToId = new Map([
    ...(existingSkills ?? []).map((s) => [s.slug, s.id]),
    ...createdRows.map((s) => [s.slug, s.id]),
  ])

  const missing = slugs.filter((s) => !slugToId.has(s))
  if (missing.length) {
    const rows = unwrap(await sb.from('skills').select('id, slug').in('slug', missing)) ?? []
    for (const r of rows) slugToId.set(r.slug, r.id)
  }

  const links = chosen
    .map((i) => {
      const skillId = i.existing?.id ?? slugToId.get(i.slug)
      return skillId ? { vacancy_id: vacancyRow.id, skill_id: skillId, importance: i.importance, context: i.context } : null
    })
    .filter(Boolean)

  if (links.length) {
    unwrap(await sb.from('vacancy_skills').upsert(links, { onConflict: 'vacancy_id,skill_id' }))
  }

  return { vacancyId: vacancyRow.id, created: createdRows.length, updated: oldItems.length }
}

// ---------------------------------------------------------------- чат

export async function fetchChatMessages() {
  const sb = requireSupabase()
  return unwrap(await sb.from('chat_messages').select('*').order('created_at', { ascending: true })) ?? []
}

export async function saveChatMessage({ role, content }) {
  const sb = requireSupabase()
  const rows = unwrap(await sb.from('chat_messages').insert({ role, content }).select())
  return rows?.[0]
}

export async function clearChat() {
  const sb = requireSupabase()
  unwrap(await sb.from('chat_messages').delete().neq('id', '00000000-0000-0000-0000-000000000000'))
}
