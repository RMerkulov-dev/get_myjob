/**
 * Настроек в интерфейсе нет: ключ и модель приходят из окружения.
 *
 * Локально — из .env (VITE_OPENROUTER_API_KEY, VITE_OPENROUTER_MODEL).
 * На проде ключа в бандле нет вовсе: запросы идут через /api/ai,
 * где ключ берётся из серверной переменной OPENROUTER_API_KEY.
 */

export const AI = {
  apiKey: import.meta.env.VITE_OPENROUTER_API_KEY?.trim() || '',
  model: import.meta.env.VITE_OPENROUTER_MODEL?.trim() || 'anthropic/claude-sonnet-4.5',
}
