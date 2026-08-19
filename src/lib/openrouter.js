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
  let finishReason = null

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

      let chunk = null
      try {
        chunk = JSON.parse(payload)
      } catch {
        continue /* keep-alive комментарии и обрывки игнорируем */
      }

      // ошибка может прийти внутри уже открытого стрима: раньше её глотал
      // catch выше, и наверх уходило бесполезное «пустой ответ модели»
      if (chunk.error) throw new Error(`OpenRouter: ${chunk.error.message || JSON.stringify(chunk.error)}`)

      const choice = chunk.choices?.[0]
      if (choice?.finish_reason) finishReason = choice.finish_reason
      const delta = choice?.delta?.content
      if (delta) {
        full += delta
        onDelta?.(delta)
      }
    }
  }

  // у рассуждающих моделей reasoning тратит тот же лимит: если он кончился
  // до первого слова ответа, content приходит пустым, и это не «нет ответа»
  if (!full && finishReason === 'length') throw new Error(t('errors.thoughtTooLong'))
  if (json && full && finishReason === 'length' && !/\}\s*$/.test(full.trim())) {
    throw new Error(t('errors.answerCut'))
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
9. context — a short quote from the job description (up to 90 characters) the requirement came from, in the original language.
10. description — ONE short sentence in ${language}: why this matters in this role. No more than 12 words.
11. summary — 2 short sentences in ${language} about the vacancy.
12. Be economical: no repetition, no filler, nothing outside the schema.

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
  // список известных названий уходит в каждый запрос — держим его коротким
  const known = existingNames.slice(0, 180)
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
    maxTokens: 2200,
    signal,
    messages: [
      { role: 'system', content: parseSystem(lang) },
      {
        role: 'user',
        content: `Position I am considering this vacancy for: ${positionType}. ${positionHint}${knownBlock}\n\nJOB DESCRIPTION:\n"""\n${text.slice(0, 14000)}\n"""`,
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
    maxTokens: 550,
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
export async function generateExplanation({ apiKey, model, skill, lang = 'en', web = false, signal }, onDelta) {
  const language = LANG_NAMES_LESSON[lang] ?? 'English'

  return streamComplete(
    {
      apiKey,
      model,
      web,
      temperature: 0.35,
      maxTokens: 1000,
      signal,
      messages: [
        {
          role: 'system',
          content: `You are a mentor for a Project Manager / Business Analyst. Explain ONE requirement so it can be read in three minutes. Write in ${language}.

Be compact: aim for 250-350 words total. Cover, in this order and with these exact markdown headings:

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

Plain markdown only — no JSON, no preamble, no closing summary. Do not pad: short sentences, no repetition. If web results are available, keep facts and terminology current and end with a "## Sources" list of markdown links.`,
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
    maxTokens: 800,
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

/* ============================================================ CV Check
 *
 * Разбор резюме, сопроводительного письма и профиля LinkedIn по чек-листу.
 *
 * Здесь стриминговый JSON, а не markdown: правки нужны структурой —
 * «пункт → проблема → цитата → замена», иначе их неудобно применять.
 * Стрим нужен по той же причине, что и в уроках: длинный ответ через
 * функцию на Vercel без первых байтов успевает упереться в таймаут.
 * ================================================================== */

const REVIEW_LANG_NAMES = { en: 'English', uk: 'Ukrainian', ru: 'Russian' }

const DOC_KINDS = {
  cv: {
    what: 'CV / resume',
    who: 'a senior technical recruiter and CV editor who hires Project Managers and Business Analysts',
    extra:
      'Assume the CV is screened by an ATS first and read by a human for 20 seconds after that. Judge it as a hiring document, not as an autobiography.',
    axes: 'Keyword coverage; Achievements and numbers; Structure and readability; Wording quality; Fit to the target role',
  },
  vacancy: {
    what: 'job advertisement the candidate is considering applying to',
    who: 'a career advisor for Project Managers and Business Analysts who has read thousands of job ads and knows what they hide',
    extra:
      'You are NOT editing this document — it belongs to the employer. You are telling the candidate whether this vacancy is worth their time, what would sink their application, and what the ad does not say out loud. Be the person who talks them out of a bad fit.',
    // здесь «оценка» — это соответствие кандидата, а не качество текста
    scoreRule:
      '"score" is 0-100: how well this candidate fits this vacancy right now, based on the target role context provided. Without that context, judge how clear and realistic the vacancy itself is and say in the verdict that the profile was not available.',
    afterRule:
      '"after" is NOT a rewrite of the ad. Put there a ready-to-use sentence the candidate can paste into their CV, cover letter or interview answer to cover this exact requirement — in the language of the vacancy. Use null when nothing can be said honestly.',
    findingsRule:
      'Findings are the candidate\'s risks and gaps against this vacancy, plus red flags in the ad itself — not writing defects.',
    afterHint: 'a sentence the candidate can use to cover this requirement, or null',
    atsRule:
      '"ats_score" must be null and "ats" must be null: an employer\'s job ad does not go through an ATS.',
    axes:
      'Coverage of the must-have requirements; Clarity of the role and seniority; Transparency of the conditions; Absence of red flags; Growth potential for this candidate',
  },
  cover: {
    what: 'cover letter',
    who: 'a hiring manager who reads hundreds of cover letters for Project Manager and Business Analyst roles',
    extra:
      'A cover letter earns an interview only if it is short, specific about the company and adds facts the CV does not already state.',
    axes: 'Specificity about the company; Proof and numbers; Length and structure; Tone and language; Fit to the vacancy',
  },
  linkedin: {
    what: 'LinkedIn profile text (headline, About section, experience entries)',
    who: 'a sourcer who finds Project Managers and Business Analysts through LinkedIn Recruiter search',
    extra:
      'Judge both readability for a human and findability in recruiter search: keywords, titles, skills, completeness of the profile.',
    axes:
      'Headline and About hook; Achievements in experience; Search visibility; Profile completeness; Consistency with the CV',
  },
}

function reviewSystem({ docType, lang, criteria }) {
  const doc = DOC_KINDS[docType] ?? DOC_KINDS.cv
  const language = REVIEW_LANG_NAMES[lang] ?? 'English'

  return `You are ${doc.who}. You review ONE document: a ${doc.what}. ${doc.extra}

Review it strictly against the checklist below. The checklist is written by the user and may be in any language — follow its meaning, not its wording.

CHECKLIST:
"""
${criteria}
"""

RULES:
1. Judge only what the document actually contains. Never invent experience, numbers, employers or dates that are not in the text. If a number is missing, ask for it with a placeholder like [N] or [X%] instead of making one up.
2. One finding = one concrete problem in one place. No general advice that would fit any document.
3. "before" must be an EXACT quote from the document, copied character for character, up to 240 characters. Use null only when the problem is something absent from the document.
4. ${doc.afterRule ?? '"after" must be ready to paste in place of "before" — final wording, not instructions. Keep it in the language the document itself is written in, even if this review is in another language. Preserve every fact from the original; where a fact is missing, leave a bracketed placeholder.'}
5. Order findings by impact: severity "high" first. Between 5 and 12 findings — pick the ones that change the outcome, drop nitpicks. ${doc.findingsRule ?? ''}
6. ${doc.scoreRule ?? '"score" is 0-100: how likely this document is to get an interview for the target role as it stands now. Be honest and strict; 85+ only for genuinely strong documents.'}
6c. In "metrics" score these axes, in this exact order, each 0-100 where higher is always better: ${doc.axes}. Translate the axis names into ${language} but keep the order and the meaning. "comment" is one short sentence naming what drove the number — a fact from the document, not a restatement of the score.
6b. ${
    doc.atsRule ??
    'In "ats" give the practical part: "missing_keywords" — terms from the target vacancy that a screening filter looks for and that are absent from the document, written exactly as the vacancy writes them, at most 12, and only ones this person can honestly claim from their experience; "fixes" — 3 to 6 concrete changes that raise the machine-readability of the document (section headings, layout, dates, spelled-out abbreviations, file structure). No generic advice: name the section and what to put there.'
  }
6a. ${
    doc.atsRule ??
    '"ats_score" is a separate 0-100 number: how well this document passes automated screening and matches a specific job. Combine two things — how literally the target vacancy\'s terms appear in the text (keyword coverage), and how machine-readable it is (single column, standard section headings, parseable dates, no tables or graphics carrying text). Judge keyword coverage against the target role context when it is provided; without it, judge machine-readability and generic role terms only.'
  }
7. Analysis, explanations, strengths, missing and next_steps: write in ${language}. Quotes in "before" stay in the original language.
8. If a summary of the user's target vacancies and skills is provided, use it: check the document against those exact requirements and say what to add for them. That summary is internal data — never let its notation (mention counts, level markers, must/nice labels) leak into "after" text.
9. Be economical. No preamble, no repetition, nothing outside the schema.

Reply with ONLY valid JSON, no markdown wrapper:
{
  "document_language": "en | uk | ru | other",
  "score": 0,
  "ats_score": 0,
  "metrics": [
    { "name": "axis name in ${language}", "score": 0, "comment": "one sentence in ${language}: why this number" }
  ],
  "ats": {
    "missing_keywords": ["term from the target vacancy that is absent from the document, in its original wording"],
    "fixes": ["one concrete change that raises the ATS score, in ${language}"]
  },
  "verdict": "2-3 sentences in ${language}: what this document does well and what holds it back",
  "strengths": ["short line in ${language}"],
  "findings": [
    {
      "item": "which checklist point this belongs to, short title in ${language}",
      "severity": "high | medium | low",
      "problem": "what exactly is wrong, in ${language}, one or two sentences",
      "fix": "what to do about it, in ${language}, one sentence",
      "before": "exact quote from the document or null",
      "after": "${doc.afterHint ?? "replacement text in the document's own language or null"}"
    }
  ],
  "missing": ["something the document lacks entirely, in ${language}"],
  "next_steps": ["concrete action, in ${language}"]
}`
}

const SEVERITIES = ['high', 'medium', 'low']

const asLines = (value, limit) =>
  (Array.isArray(value) ? value : [])
    .filter((x) => typeof x === 'string' && x.trim())
    .map((x) => x.trim())
    .slice(0, limit)

/**
 * Разбирает документ по чек-листу. context — необязательная выжимка из базы
 * (частые требования, целевая вакансия), onProgress получает длину ответа,
 * чтобы интерфейс показывал, что генерация идёт, а не висит.
 */
export async function reviewDocument(
  { apiKey, model, docType, text, criteria, lang = 'en', context = '', signal },
  onProgress,
) {
  const contextBlock = context ? `\n\nTARGET ROLE CONTEXT (from the user's own database):\n${context}` : ''

  const raw = await streamComplete(
    {
      apiKey,
      model,
      json: true,
      temperature: 0.25,
      // с запасом: у рассуждающих моделей reasoning-токены тоже идут в этот
      // лимит, и на 8000 разбор большого резюме обрывался ещё в рассуждениях
      maxTokens: 16000,
      signal,
      messages: [
        { role: 'system', content: reviewSystem({ docType, lang, criteria }) },
        {
          role: 'user',
          content: `DOCUMENT (${DOC_KINDS[docType]?.what ?? 'document'}):\n"""\n${text.slice(0, 24000)}\n"""${contextBlock}`,
        },
      ],
    },
    (delta) => onProgress?.(delta),
  )

  const parsed = extractJson(raw)
  const clamp = (value) => {
    const n = Number(value)
    return Number.isFinite(n) ? Math.max(0, Math.min(100, Math.round(n))) : null
  }

  // Объявление работодателя через ATS не проходит, поэтому этих метрик у него
  // нет. Модель об этом просят, но проверять надёжнее у себя: она возвращала
  // ats_score: 0, и полоса рисовалась пустой вместо того, чтобы исчезнуть.
  const hasAts = docType !== 'vacancy'

  return {
    documentLanguage: typeof parsed.document_language === 'string' ? parsed.document_language.trim() : null,
    score: clamp(parsed.score),
    atsScore: hasAts ? clamp(parsed.ats_score) : null,
    metrics: (Array.isArray(parsed.metrics) ? parsed.metrics : [])
      .filter((m) => m && typeof m.name === 'string' && m.name.trim())
      .slice(0, 6)
      .map((m) => ({
        name: m.name.trim(),
        score: clamp(m.score),
        comment: typeof m.comment === 'string' ? m.comment.trim() : '',
      }))
      .filter((m) => m.score !== null),
    ats:
      hasAts && parsed.ats
        ? {
            missingKeywords: asLines(parsed.ats.missing_keywords, 12),
            fixes: asLines(parsed.ats.fixes, 6),
          }
        : null,
    verdict: typeof parsed.verdict === 'string' ? parsed.verdict.trim() : '',
    strengths: asLines(parsed.strengths, 6),
    missing: asLines(parsed.missing, 8),
    nextSteps: asLines(parsed.next_steps, 6),
    findings: (Array.isArray(parsed.findings) ? parsed.findings : [])
      .filter((f) => f && (typeof f.problem === 'string' || typeof f.item === 'string'))
      .slice(0, 14)
      .map((f, i) => ({
        id: i,
        item: typeof f.item === 'string' ? f.item.trim() : '',
        severity: SEVERITIES.includes(f.severity) ? f.severity : 'medium',
        problem: typeof f.problem === 'string' ? f.problem.trim() : '',
        fix: typeof f.fix === 'string' ? f.fix.trim() : '',
        before: typeof f.before === 'string' && f.before.trim() ? f.before.trim() : null,
        after: typeof f.after === 'string' && f.after.trim() ? f.after.trim() : null,
      })),
  }
}
