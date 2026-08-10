import { createClient } from '@supabase/supabase-js'
import { t } from '../i18n'

const url = import.meta.env.VITE_SUPABASE_URL?.trim()
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim()

export const isSupabaseConfigured = Boolean(url && anonKey && url.startsWith('http'))

export const supabase = isSupabaseConfigured
  ? createClient(url, anonKey, {
      auth: {
        // сессия нужна постоянно: по ней RLS пускает к данным, а /api/ai — к ключу OpenRouter
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null

export function requireSupabase() {
  if (!supabase) throw new Error(t('errors.supabaseMissing'))
  return supabase
}

/** Токен текущей сессии — им авторизуются запросы к /api/ai. */
export async function accessToken() {
  const { data } = await requireSupabase().auth.getSession()
  return data?.session?.access_token ?? null
}
