import { CATEGORY_IDS } from './constants'
import { accessToken } from './supabase'
import { t } from '../i18n'

const BASE = 'https://openrouter.ai/api/v1'

/**
 * Куда обращаться за ИИ.
 *
 * Локально с ключом в .env — напрямую в OpenRouter, чтобы `npm run dev`
 * работал без Vercel CLI. На проде ключа в бандле нет, поэтому идём через
 * серверный прокси /api/ai, который авторизует по сессии Supabase.
 */
export function usesProxy(apiKey) {
  return !(import.meta.env.DEV && apiKey)
}

async function endpoint(apiKey, path) {
  if (!usesProxy(apiKey)) {
    return {
      url: `${BASE}${path}`,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': window.location.origin,
        'X-Title': 'Skill Dossier',
      },
    }
  }

  const token = await accessToken()
  if (!token) throw new Error(t('errors.sessionExpired'))

  return {
    url: '/api/ai/chat',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  }
}

async function readError(res) {
  let detail = ''
  try {
    const data = await res.json()
    detail = data?.error?.message || data?.message || JSON.stringify(data)
  } catch {
    detail = await res.text().catch(() => '')
  }
  const hints = { 401: 'hint401', 402: 'hint402', 403: 'hint403', 404: 'hint404', 429: 'hint429' }
  const hint = hints[res.status] ? t(`errors.${hints[res.status]}`) : ''
  return new Error(`OpenRouter ${res.status}${hint}${detail ? `: ${detail.slice(0, 400)}` : ''}`)
}

/** Обычный запрос без стрима. */
export async function complete({ apiKey, model, messages, temperature = 0.2, json = false, web = false, signal }) {
  const { url, headers } = await endpoint(apiKey, '/chat/completions')

  const send = (withJsonFormat, withWeb) =>
    fetch(url, {
      method: 'POST',
      headers,
      signal,
      body: JSON.stringify({
        model,
        messages,
        temperature,
        ...(withJsonFormat ? { response_format: { type: 'json_object' } } : {}),
        // веб-поиск OpenRouter: модель дополняет ответ свежими источниками
        ...(withWeb ? { plugins: [{ id: 'web', max_results: 4 }] } : {}),
      }),
    })

  let res = await send(json, web)
  // не все модели поддерживают response_format / плагины — тихо повторяем без них
  if (!res.ok && web && (res.status === 400 || res.status === 404 || res.status === 422)) res = await send(json, false)
  if (!res.ok && json && (res.status === 400 || res.status === 422)) res = await send(false, false)
  if (!res.ok) throw await readError(res)

  const data = await res.json()
  return data.choices?.[0]?.message?.content ?? ''
}

/**
 * Стриминг: onDelta получает куски текста по мере генерации.
 *
 * Стрим используется не только для чата, но и для долгих запросов с
 * веб-поиском: на Vercel у функции ограничено время до ПЕРВОГО байта, и
 * запрос, который ждёт целый JSON минуту, просто обрывается. Со стримом
 * байты идут сразу, а JSON собирается на клиенте.
 */
export async function streamComplete(
  { apiKey, model, messages, temperature = 0.4, json = false, web = false, maxTokens, signal },
  onDelta,
) {
  const { url, headers } = await endpoint(apiKey, '/chat/completions')

  const send = (withJson, withWeb) =>
    fetch(url, {
      method: 'POST',
      headers,
      signal,
      body: JSON.stringify({
        model,
        messages,
        temperature,
        stream: true,
        ...(maxTokens ? { max_tokens: maxTokens } : {}),
        ...(withJson ? { response_format: { type: 'json_object' } } : {}),
        // 2 результата вместо 4: поиск — самая долгая часть запроса
        ...(withWeb ? { plugins: [{ id: 'web', max_results: 2 }] } : {}),
      }),
    })

  let res = await send(json, web)
  // не все модели поддерживают плагины / response_format — тихо повторяем без них
  if (!res.ok && web && (res.status === 400 || res.status === 404 || res.status === 422)) res = await send(json, false)
  if (!res.ok && json && (res.status === 400 || res.status === 422)) res = await send(false, false)
  if (!res.ok) throw await readError(res)
  if (!res.body) throw new Error(t('errors.emptyStream'))

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let full = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })

    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed.startsWith('data:')) continue
      const payload = trimmed.slice(5).trim()
      if (!payload || payload === '[DONE]') continue
      try {
        const chunk = JSON.parse(payload)
        const delta = chunk.choices?.[0]?.delta?.content
        if (delta) {
          full += delta
          onDelta?.(delta)
        }
      } catch {
        /* keep-alive комментарии и обрывки игнорируем */
      }
    }
  }

  return full
}

/** Достаёт JSON из ответа модели, даже если он завёрнут в ```json или текст. */
export function extractJson(raw) {
  if (!raw) throw new Error(t('errors.emptyModelReply'))
  const cleaned = String(raw)
    .replace(/^\s*```(?:json)?/i, '')
    .replace(/```\s*$/, '')
    .trim()

  try {
    return JSON.parse(cleaned)
  } catch {
    /* пробуем вырезать первый объект */
  }

  const start = cleaned.indexOf('{')
  const end = cleaned.lastIndexOf('}')
  if (start !== -1 && end > start) {
    try {
      return JSON.parse(cleaned.slice(start, end + 1))
    } catch {
      /* ниже */
    }
  }
  throw new Error(t('errors.badJson'))
}

const LANG_NAMES = { en: 'English', uk: 'Ukrainian' }

/**
 * Промпт всегда на английском — модели так стабильнее следуют инструкциям,
 * а вакансия может быть на любом языке. Язык влияет только на то, на чём
 * писать описания и названия навыков без общепринятого английского термина.
 */
function parseSystem(lang) {
  const language = LANG_NAMES[lang] ?? 'English'

  return `You extract requirements, technologies, tools and skills from job descriptions for Project Manager and Business Analyst roles. The job description may be in any language.

RULES:
1. Extract ONLY requirements for the candidate: technologies, tools, methodologies, skills, certifications, languages, domains. Do NOT extract responsibilities, working conditions, benefits, company description or salary.
2. One requirement = one atomic entity. "Experience with Jira and Confluence" → two requirements: "Jira" and "Confluence".
3. The name must be short and canonical, WITHOUT wrappers like "experience with", "knowledge of", "confident command of", without brackets or explanations. Good: "Jira", "BPMN", "Stakeholder management", "English B2". Bad: "Experience with Jira (required)".
4. For established technologies and methodologies always use the accepted English name (Jira, Confluence, Scrum, Kanban, BPMN, UML, SQL, REST API, Power BI), whatever language the job ad is in. For soft skills and processes that have a common English term, use that English term too; only fall back to ${language} when no established English term exists.
5. If you are given a list of ALREADY KNOWN requirements and the vacancy mentions the same thing in meaning, reuse EXACTLY that name, character for character. This is critical for deduplication.
6. Never invent requirements that are not in the text. Fewer but accurate is better.
7. category — strictly one of: ${CATEGORY_IDS.join(', ')}.
8. importance: "must" if the requirement is in the required/core section, "nice" if it is desirable / a plus.
9. context — a short quote from the job description (up to 160 characters) the requirement came from, in the original language.
10. description — one sentence in ${language}: why this matters in this role.
11. summary — 2-3 sentences in ${language} about the vacancy.

Reply with ONLY valid JSON, no markdown wrapper, matching this schema:
{
  "vacancy": {
    "title": "position title",
    "company": "company or null",
    "seniority": "junior | middle | senior | lead | null",
    "location": "location / work format or null",
    "salary": "range or null",
    "summary": "2-3 sentences in ${language}"
  },
  "requirements": [
    {
      "name": "Jira",
      "aliases": ["exactly as written in the vacancy"],
      "category": "tool",
      "importance": "must",
      "description": "One sentence in ${language}.",
      "context": "quote from the vacancy"
    }
  ]
}`
}

/**
 * Разбирает текст вакансии. existingNames — названия уже сохранённых требований,
 * чтобы модель переиспользовала их вместо создания дублей.
 */
export async function parseVacancy({
  apiKey,
  model,
  text,
  positionType,
  existingNames = [],
  lang = 'en',
  signal,
}) {
  const known = existingNames.slice(0, 400)
  const knownBlock = known.length
    ? `\n\nALREADY KNOWN REQUIREMENTS (reuse these names character for character when you meet the same thing in meaning):\n${known.join(', ')}`
    : ''

  const positionHint =
    positionType === 'PM/BA'
      ? 'Hybrid Project Manager / Business Analyst role.'
      : positionType === 'BA'
        ? 'Business Analyst role — pay attention to analytical artefacts and requirements work.'
        : 'Project Manager role — pay attention to management, planning and communication.'

  const content = await complete({
    apiKey,
    model,
    json: true,
    temperature: 0.1,
    signal,
    messages: [
      { role: 'system', content: parseSystem(lang) },
      {
        role: 'user',
        content: `Position I am considering this vacancy for: ${positionType}. ${positionHint}${knownBlock}\n\nJOB DESCRIPTION:\n"""\n${text.slice(0, 24000)}\n"""`,
      },
    ],
  })

  const parsed = extractJson(content)
  const requirements = Array.isArray(parsed.requirements) ? parsed.requirements : []

  return {
    vacancy: {
      title: parsed.vacancy?.title || 'Untitled',
      company: parsed.vacancy?.company || null,
      seniority: parsed.vacancy?.seniority || null,
      location: parsed.vacancy?.location || null,
      salary: parsed.vacancy?.salary || null,
      summary: parsed.vacancy?.summary || null,
    },
    requirements: requirements
      .filter((r) => r && typeof r.name === 'string' && r.name.trim())
      .map((r) => ({
        name: r.name.trim(),
        aliases: Array.isArray(r.aliases) ? r.aliases.filter((a) => typeof a === 'string' && a.trim()) : [],
        category: CATEGORY_IDS.includes(r.category) ? r.category : 'other',
        importance: r.importance === 'must' ? 'must' : 'nice',
        description: typeof r.description === 'string' ? r.description.trim() : null,
        context: typeof r.context === 'string' ? r.context.trim().slice(0, 300) : null,
      })),
  }
}

/* =================================================================== урок
 *
 * Урок собирается ТРЕМЯ независимыми запросами, которые идут параллельно:
 *
 *   1. вопросы рекрутера — маленький JSON без веб-поиска, приходит первым;
 *   2. объяснение — обычный markdown стримом, читается по мере генерации;
 *   3. квиз — небольшой JSON.
 *
 * Раньше это был один запрос, который ждал целый JSON с веб-поиском внутри:
 * пользователь минуту смотрел на спиннер, а функция на Vercel успевала
 * упереться в лимит времени. Теперь каждая часть появляется, как только готова.
 * ================================================================== */

const LANG_NAMES_LESSON = { en: 'English', uk: 'Ukrainian' }

function skillFacts(skill) {
  return [
    `Requirement: "${skill.name}".`,
    `Category: ${skill.category}.`,
    skill.description ? `How a job ad described it: ${skill.description}` : '',
    `Relevant roles: ${(skill.positions ?? []).join(', ') || 'PM'}.`,
    `Candidate self-assessment: ${skill.level ?? 0} of 5${skill.learned ? ' (marked as learned)' : ''}.`,
  ]
    .filter(Boolean)
    .join('\n')
}

/** 1. Вопросы рекрутера. Быстрый запрос без веб-поиска. */
export async function generateRecruiterQuestions({ apiKey, model, skill, lang = 'en', signal }) {
  const language = LANG_NAMES_LESSON[lang] ?? 'English'

  const content = await streamComplete({
    apiKey,
    model,
    json: true,
    temperature: 0.4,
    maxTokens: 900,
    signal,
    messages: [
      {
        role: 'system',
        content: `You prepare a Project Manager / Business Analyst for interviews. Write in ${language}.

Give exactly 3 questions a real recruiter or hiring manager would ask about the requirement — their actual wording, from an easy screening question to a deeper or situational one. Be concise.

Reply with ONLY valid JSON:
{"questions":[{"question":"…","checks":"what they are really assessing, one sentence","answer":"how to answer well: structure and what to mention, 2 sentences"}]}`,
      },
      { role: 'user', content: skillFacts(skill) },
    ],
  })

  const parsed = extractJson(content)
  return (Array.isArray(parsed.questions) ? parsed.questions : [])
    .filter((q) => q && typeof q.question === 'string' && q.question.trim())
    .slice(0, 4)
    .map((q) => ({
      question: q.question.trim(),
      checks: typeof q.checks === 'string' ? q.checks.trim() : '',
      answer: typeof q.answer === 'string' ? q.answer.trim() : '',
    }))
}

/**
 * 2. Объяснение. Обычный markdown стримом — onDelta отдаёт текст по кускам,
 * поэтому он появляется на экране сразу, как ответ в чате.
 */
export async function generateExplanation({ apiKey, model, skill, lang = 'en', web = true, signal }, onDelta) {
  const language = LANG_NAMES_LESSON[lang] ?? 'English'

  return streamComplete(
    {
      apiKey,
      model,
      web,
      temperature: 0.35,
      maxTokens: 1300,
      signal,
      messages: [
        {
          role: 'system',
          content: `You are a mentor for a Project Manager / Business Analyst. Explain ONE requirement so it can be read in three minutes. Write in ${language}.

Cover, in this order and with these exact markdown headings:

## What it is
Two or three sentences, no fluff.

## How it works
The key concepts, steps or artefacts a PM/BA actually touches. Short bullets.

## What employers expect
What "good" looks like on the job and at an interview.

## Common mistakes
Two or three bullets.

## Start here
The first two concrete steps to begin using it.

Plain markdown only — no JSON, no preamble, no closing summary. If web results are available, keep facts and terminology current and end with a "## Sources" list of markdown links.`,
        },
        { role: 'user', content: skillFacts(skill) },
      ],
    },
    onDelta,
  )
}

/** 3. Квиз из 5 вопросов. Небольшой JSON без веб-поиска. */
export async function generateQuiz({ apiKey, model, skill, lang = 'en', signal }) {
  const language = LANG_NAMES_LESSON[lang] ?? 'English'

  const content = await streamComplete({
    apiKey,
    model,
    json: true,
    temperature: 0.4,
    maxTokens: 1200,
    signal,
    messages: [
      {
        role: 'system',
        content: `Write a quiz for a Project Manager / Business Analyst on ONE requirement. Write in ${language}.

EXACTLY 5 questions that test real understanding rather than memorised definitions. Each has exactly 4 options, exactly one correct, and a one-sentence explanation. Keep questions short.

Reply with ONLY valid JSON:
{"quiz":[{"question":"…","options":["…","…","…","…"],"correct":0,"explanation":"why this option is correct"}]}`,
      },
      { role: 'user', content: skillFacts(skill) },
    ],
  })

  const parsed = extractJson(content)
  return (Array.isArray(parsed.quiz) ? parsed.quiz : [])
    .filter((q) => q && typeof q.question === 'string' && Array.isArray(q.options) && q.options.length >= 2)
    .slice(0, 5)
    .map((q) => {
      const options = q.options.slice(0, 4).map((o) => String(o))
      return {
        question: q.question.trim(),
        options,
        correct: Number.isInteger(q.correct) && q.correct >= 0 && q.correct < options.length ? q.correct : 0,
        explanation: typeof q.explanation === 'string' ? q.explanation.trim() : '',
      }
    })
}
