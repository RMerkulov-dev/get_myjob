/**
 * Настроек в интерфейсе нет: ключ и модели приходят из окружения.
 *
 * Локально — из .env (VITE_OPENROUTER_API_KEY и модели ниже).
 * На проде ключа в бандле нет вовсе: запросы идут через /api/ai,
 * где ключ берётся из серверной переменной OPENROUTER_API_KEY.
 *
 * Две модели вместо одной — ради стоимости. Дорогая модель нужна там, где
 * важен связный текст и точность извлечения; для коротких структурированных
 * JSON-ответов (вопросы рекрутера, квиз) хватает самой дешёвой.
 * Цены за 1M токенов на момент настройки:
 *   google/gemini-2.5-flash        $0.30 вход / $2.50 выход
 *   google/gemini-2.5-flash-lite   $0.10 вход / $0.40 выход
 *   anthropic/claude-sonnet-4.5    $3.00 вход / $15.00 выход  ← был по умолчанию
 */

export const AI = {
  apiKey: import.meta.env.VITE_OPENROUTER_API_KEY?.trim() || '',

  /** Объяснения, чат, разбор вакансий — там, где нужно качество. */
  model: import.meta.env.VITE_OPENROUTER_MODEL?.trim() || 'google/gemini-2.5-flash',

  /** Короткие JSON-ответы: вопросы рекрутера, квиз. */
  fastModel: import.meta.env.VITE_OPENROUTER_MODEL_FAST?.trim() || 'google/gemini-2.5-flash-lite',
}
