/**
 * Проверка, что запрос к ИИ пришёл от залогиненного пользователя.
 * Файлы с префиксом «_» Vercel не превращает в эндпоинты — это общий модуль.
 *
 * Регистрация открытая, поэтому белого списка нет: достаточно валидной сессии
 * Supabase. Анонимные запросы к ключу OpenRouter при этом невозможны.
 */

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
const SUPABASE_ANON = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY

export function fail(status, message) {
  return new Response(JSON.stringify({ error: { message } }), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  })
}

export async function requireUser(request) {
  if (!SUPABASE_URL || !SUPABASE_ANON) {
    return { error: fail(500, 'Server is missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY') }
  }

  const header = request.headers.get('authorization') || ''
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : ''
  if (!token) return { error: fail(401, 'Sign in to use the AI') }

  const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { Authorization: `Bearer ${token}`, apikey: SUPABASE_ANON },
  })
  if (!res.ok) return { error: fail(401, 'Session expired — sign in again') }

  const user = await res.json()
  if (!user?.id) return { error: fail(401, 'Invalid session') }

  return { user, email: String(user.email || '').toLowerCase() }
}
