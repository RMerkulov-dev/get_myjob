/**
 * Чистая логика планировщика: метрики, календарная сетка, суммы.
 * Без обращений к базе и React — так её легко проверить и переиспользовать.
 */

/** Пять метрик ритма поиска работы. Порядок = порядок в интерфейсе. */
export const PLAN_METRICS = ['posts', 'applications', 'responses', 'interviews', 'stages']

/** Цвет метрики в календаре: те же три акцента, что и во всём приложении. */
export const METRIC_TONE = {
  posts: 'accent',
  applications: 'ink',
  responses: 'amber',
  interviews: 'green',
  stages: 'green',
}

export const POST_STATUSES = ['idea', 'draft', 'scheduled', 'published']

export const planKey = (metric) => `plan_${metric}`
export const factKey = (metric) => `fact_${metric}`
export const goalKey = (metric) => `goal_${metric}`

/** Локальная дата в ISO без сдвига часового пояса (toISOString() уводит на день назад). */
export function toISODate(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function fromISODate(iso) {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export const startOfMonth = (date) => new Date(date.getFullYear(), date.getMonth(), 1)
export const addMonths = (date, n) => new Date(date.getFullYear(), date.getMonth() + n, 1)
export const addDays = (date, n) => new Date(date.getFullYear(), date.getMonth(), date.getDate() + n)

/** Ключ месяца для таблицы целей — всегда первое число. */
export const monthKey = (date) => toISODate(startOfMonth(date))

/** Понедельник недели, в которую попадает дата. */
export function startOfWeek(date) {
  const shift = (date.getDay() + 6) % 7 // вс = 0 → 6, пн = 1 → 0
  return addDays(date, -shift)
}

/**
 * Сетка месяца: недели по 7 дней, с «хвостами» соседних месяцев,
 * чтобы каждая строка была полной. Неделя начинается с понедельника.
 *
 * @returns {Array<{start: string, days: Array<{iso: string, date: Date, dayNum: number, inMonth: boolean, isToday: boolean, isWeekend: boolean}>}>}
 */
export function monthGrid(monthDate, today = new Date()) {
  const first = startOfMonth(monthDate)
  const month = first.getMonth()
  const todayIso = toISODate(today)

  const last = new Date(first.getFullYear(), month + 1, 0)
  const gridStart = startOfWeek(first)
  const gridEnd = addDays(startOfWeek(last), 6)

  const weeks = []
  let cursor = gridStart
  while (cursor <= gridEnd) {
    const days = []
    for (let i = 0; i < 7; i++) {
      const date = addDays(cursor, i)
      const iso = toISODate(date)
      days.push({
        iso,
        date,
        dayNum: date.getDate(),
        inMonth: date.getMonth() === month,
        isToday: iso === todayIso,
        isWeekend: date.getDay() === 0 || date.getDay() === 6,
      })
    }
    weeks.push({ start: days[0].iso, days })
    cursor = addDays(cursor, 7)
  }
  return weeks
}

/** Границы сетки — то, что нужно запросить из базы одним диапазоном. */
export function gridRange(weeks) {
  const flat = weeks.flatMap((w) => w.days)
  return { from: flat[0].iso, to: flat[flat.length - 1].iso }
}

/** Пустая строка дня: с ней форма и календарь работают одинаково, есть запись или нет. */
export function emptyDay(iso) {
  const row = { day: iso, note: '' }
  for (const m of PLAN_METRICS) {
    row[planKey(m)] = 0
    row[factKey(m)] = 0
  }
  return row
}

export function emptyGoal(month) {
  const row = { month }
  for (const m of PLAN_METRICS) row[goalKey(m)] = 0
  return row
}

/** День пуст, если ни плана, ни факта, ни заметки — такую строку в базе не держим. */
export function isDayEmpty(row) {
  if (row.note?.trim()) return false
  return PLAN_METRICS.every((m) => !Number(row[planKey(m)]) && !Number(row[factKey(m)]))
}

/** Индекс «ISO дня → строка» для быстрой отрисовки календаря. */
export function indexByDay(rows) {
  const map = new Map()
  for (const row of rows) map.set(row.day, row)
  return map
}

/** Группировка постов по дню. */
export function groupPostsByDay(posts) {
  const map = new Map()
  for (const post of posts) {
    const list = map.get(post.day)
    if (list) list.push(post)
    else map.set(post.day, [post])
  }
  return map
}

/** Сумма плана и факта по каждой метрике на переданном наборе дней. */
export function totals(rows) {
  const acc = {}
  for (const m of PLAN_METRICS) acc[m] = { plan: 0, fact: 0 }
  for (const row of rows) {
    for (const m of PLAN_METRICS) {
      acc[m].plan += Number(row[planKey(m)]) || 0
      acc[m].fact += Number(row[factKey(m)]) || 0
    }
  }
  return acc
}

/** Доля выполнения в процентах; знаменатель 0 — прогресса нет, а не 100%. */
export function ratio(fact, target) {
  if (!target) return 0
  return Math.min(100, Math.round((fact / target) * 100))
}

export function clampCount(value, max = 999) {
  const n = Math.round(Number(value))
  if (!Number.isFinite(n)) return 0
  return Math.max(0, Math.min(max, n))
}
