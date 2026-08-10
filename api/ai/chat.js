import { fail, requireUser } from '../_guard.js'

export const config = { runtime: 'edge' }

const KEY = process.env.OPENROUTER_API_KEY

/**
 * Прокси к OpenRouter. Ключ живёт только здесь, в браузер не попадает.
 * Поток от модели пробрасывается как есть — стриминг чата работает без изменений.
 */
export default async function handler(request) {
  if (request.method !== 'POST') return fail(405, 'Только POST')

  const { error } = await requireUser(request)
  if (error) return error

  if (!KEY) return fail(500, 'На сервере не задан OPENROUTER_API_KEY')

  const upstream = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${KEY}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': new URL(request.url).origin,
      'X-Title': 'Skill Dossier',
    },
    body: await request.text(),
  })

  return new Response(upstream.body, {
    status: upstream.status,
    headers: {
      'Content-Type': upstream.headers.get('content-type') || 'application/json',
      'Cache-Control': 'no-store',
    },
  })
}
