/**
 * Проверка, что запрос пришёл от залогиненного владельца.
 * Файлы с префиксом «_» Vercel не превращает в эндпоинты — это общий модуль.
 */

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
const SUPABASE_ANON = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY

/** Через запятую. Если пусто — пускаем любого залогиненного (RLS всё равно закрывает данные). */
const ALLOWED = (process.env.ALLOWED_EMAILS || '')
  .split(',')
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean)

export function fail(status, message) {
  return new Response(JSON.stringify({ error: { message } }), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  })
}

export async function requireUser(request) {
  if (!SUPABASE_URL || !SUPABASE_ANON) {
    return { error: fail(500, 'На сервере не заданы VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY') }
  }

  const header = request.headers.get('authorization') || ''
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : ''
  if (!token) return { error: fail(401, 'Нужно войти в приложение') }

  const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { Authorization: `Bearer ${token}`, apikey: SUPABASE_ANON },
  })
  if (!res.ok) return { error: fail(401, 'Сессия истекла — войди заново') }

  const user = await res.json()
  const email = String(user?.email || '').toLowerCase()
  if (ALLOWED.length && !ALLOWED.includes(email)) {
    return { error: fail(403, 'Этому аккаунту доступ не разрешён') }
  }

  return { user, email }
}
