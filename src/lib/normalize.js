/**
 * Нормализация названий требований — сердце дедупликации.
 * «Знание Jira (обязательно)», «JIRA», «Джира» → один и тот же slug.
 */

/** Мусорные обёртки, которыми HR любят украшать требование. */
const NOISE_PREFIXES = [
  'опыт работы с',
  'опыт работы в',
  'опыт использования',
  'опыт применения',
  'опыт ведения',
  'опыт',
  'знание основ',
  'знание',
  'уверенное владение',
  'владение',
  'понимание принципов',
  'понимание',
  'навыки работы с',
  'навыки',
  'умение работать с',
  'умение',
  'работа с',
  'уверенный',
  'глубокое',
  'базовое',
  // украинский
  'досвід роботи з',
  'досвід роботи в',
  'досвід використання',
  'досвід',
  'знання основ',
  'знання',
  'впевнене володіння',
  'володіння',
  'розуміння принципів',
  'розуміння',
  'навички роботи з',
  'навички',
  'вміння працювати з',
  'вміння',
  'робота з',
  'глибоке',
  'базове',
  // английский
  'experience with',
  'experience in',
  'knowledge of',
  'strong knowledge of',
  'understanding of',
  'hands-on experience with',
  'proficiency in',
  'familiarity with',
  'ability to',
]

const NOISE_SUFFIXES = [
  'обязательно',
  'желательно',
  'как плюс',
  'будет плюсом',
  'плюсом',
  'обов’язково',
  'обовязково',
  'бажано',
  'як плюс',
  'буде плюсом',
  'is a plus',
  'nice to have',
  'required',
  'preferred',
]

/** Синонимы: нормализованный вариант → канонический slug. */
const SYNONYMS = {
  // трекеры и инструменты
  джира: 'jira',
  'jira software': 'jira',
  'atlassian jira': 'jira',
  'jira service desk': 'jira',
  конфлюенс: 'confluence',
  'atlassian confluence': 'confluence',
  'ms project': 'microsoft project',
  msproject: 'microsoft project',
  'microsoft project': 'microsoft project',
  'ms excel': 'excel',
  'microsoft excel': 'excel',
  эксель: 'excel',
  'google sheets': 'google sheets',
  'гугл таблицы': 'google sheets',
  'ms office': 'microsoft office',
  'microsoft office': 'microsoft office',
  'ms visio': 'visio',
  'microsoft visio': 'visio',
  'draw io': 'draw.io',
  drawio: 'draw.io',
  diagrams: 'draw.io',
  'diagrams net': 'draw.io',
  миро: 'miro',
  фигма: 'figma',
  'figma design': 'figma',
  ноушн: 'notion',
  'youtrack jetbrains': 'youtrack',
  'azure devops': 'azure devops',
  ado: 'azure devops',
  тфс: 'azure devops',
  tfs: 'azure devops',
  'monday com': 'monday.com',
  'monday': 'monday.com',
  'ms teams': 'microsoft teams',
  'microsoft teams': 'microsoft teams',

  // методологии
  'scrum framework': 'scrum',
  скрам: 'scrum',
  'agile scrum': 'scrum',
  канбан: 'kanban',
  agile: 'agile',
  'agile methodologies': 'agile',
  'agile methodology': 'agile',
  'agile методологии': 'agile',
  'agile подход': 'agile',
  'гибкие методологии': 'agile',
  'гибкие методологии разработки': 'agile',
  'agile практики': 'agile',
  водопад: 'waterfall',
  'каскадная модель': 'waterfall',
  'safe framework': 'safe',
  'scaled agile framework': 'safe',
  'less framework': 'less',
  'pmbok guide': 'pmbok',
  'prince 2': 'prince2',
  'управление проектами': 'project management',
  'project management': 'project management',
  'управление продуктом': 'product management',
  'управление рисками': 'risk management',
  'risk management': 'risk management',
  'управление изменениями': 'change management',
  'управление бэклогом': 'backlog management',
  'ведение бэклога': 'backlog management',
  'backlog grooming': 'backlog management',
  'grooming': 'backlog management',
  'управление стейкхолдерами': 'stakeholder management',
  'stakeholder management': 'stakeholder management',
  'работа со стейкхолдерами': 'stakeholder management',
  'управление командой': 'team management',
  'ресурсное планирование': 'resource planning',
  'спринт планирование': 'sprint planning',
  'sprint planning': 'sprint planning',
  ретроспектива: 'retrospective',
  ретро: 'retrospective',
  'daily standup': 'daily standup',
  дейли: 'daily standup',
  'story points': 'estimation',
  'оценка задач': 'estimation',
  'оценка трудозатрат': 'estimation',
  эстимация: 'estimation',

  // аналитика
  'сбор требований': 'requirements gathering',
  'выявление требований': 'requirements gathering',
  'requirements elicitation': 'requirements gathering',
  'requirements gathering': 'requirements gathering',
  'анализ требований': 'requirements analysis',
  'requirements analysis': 'requirements analysis',
  'документирование требований': 'requirements documentation',
  'user story': 'user stories',
  'пользовательские истории': 'user stories',
  'юзер стори': 'user stories',
  'use case': 'use cases',
  'сценарии использования': 'use cases',
  'бизнес процессы': 'business processes',
  'моделирование бизнес процессов': 'bpmn',
  'нотация bpmn': 'bpmn',
  'bpmn 2 0': 'bpmn',
  'uml диаграммы': 'uml',
  'блок схемы': 'flowcharts',
  'customer journey map': 'cjm',
  cjm: 'cjm',
  'user flow': 'user flow',
  'функциональные требования': 'functional requirements',
  'нефункциональные требования': 'non-functional requirements',
  'техническое задание': 'srs',
  тз: 'srs',
  srs: 'srs',
  'software requirements specification': 'srs',
  'acceptance criteria': 'acceptance criteria',
  'критерии приемки': 'acceptance criteria',
  'definition of done': 'definition of done',
  dod: 'definition of done',
  'gap анализ': 'gap analysis',
  'as is to be': 'as-is to-be',

  // технические
  'rest api': 'rest api',
  restful: 'rest api',
  'rest apis': 'rest api',
  api: 'api',
  'api интеграции': 'api',
  'интеграции': 'integrations',
  json: 'json',
  xml: 'xml',
  swagger: 'openapi',
  openapi: 'openapi',
  'swagger openapi': 'openapi',
  postman: 'postman',
  sql: 'sql',
  'sql запросы': 'sql',
  'базы данных': 'databases',
  'реляционные базы данных': 'databases',
  postgres: 'postgresql',
  postgresql: 'postgresql',
  'ci cd': 'ci/cd',
  cicd: 'ci/cd',
  'микросервисы': 'microservices',
  'микросервисная архитектура': 'microservices',
  'системная архитектура': 'system architecture',
  git: 'git',
  'системы контроля версий': 'git',
  'основы qa': 'qa',
  тестирование: 'qa',
  'ручное тестирование': 'qa',

  // данные
  'аналитика данных': 'data analytics',
  'data analysis': 'data analytics',
  'продуктовая аналитика': 'product analytics',
  'power bi': 'power bi',
  powerbi: 'power bi',
  tableau: 'tableau',
  'google analytics': 'google analytics',
  ga4: 'google analytics',
  'амплитуда': 'amplitude',
  метрики: 'metrics',
  kpi: 'kpi',
  'unit экономика': 'unit economics',
  'юнит экономика': 'unit economics',

  // софт-скиллы
  'коммуникативные навыки': 'communication',
  коммуникация: 'communication',
  'навыки коммуникации': 'communication',
  communication: 'communication',
  'презентационные навыки': 'presentation skills',
  'навыки презентации': 'presentation skills',
  'ведение переговоров': 'negotiation',
  переговоры: 'negotiation',
  'лидерские качества': 'leadership',
  лидерство: 'leadership',
  'работа в команде': 'teamwork',
  'командная работа': 'teamwork',
  'критическое мышление': 'critical thinking',
  'системное мышление': 'systems thinking',
  'решение проблем': 'problem solving',
  'управление конфликтами': 'conflict management',
  'фасилитация': 'facilitation',
  'фасилитация встреч': 'facilitation',
  'тайм менеджмент': 'time management',
  'многозадачность': 'multitasking',
  'самостоятельность': 'self-management',
  'проактивность': 'proactivity',

  // языки
  'английский язык': 'english',
  английский: 'english',
  'english language': 'english',
  'разговорный английский': 'english',
  'английский b2': 'english',
  'английский c1': 'english',
  'upper intermediate': 'english',
  'немецкий язык': 'german',
  немецкий: 'german',

  // сертификаты
  'pmp сертификация': 'pmp',
  'pmi pmp': 'pmp',
  psm: 'psm',
  'psm i': 'psm',
  'professional scrum master': 'psm',
  csm: 'csm',
  cbap: 'cbap',
  'iiba cbap': 'cbap',
  ecba: 'ecba',
  'ba сертификация': 'cbap',
  'итил': 'itil',

  // --- украинские варианты -------------------------------------------------
  'джіра': 'jira',
  'конфлюенс': 'confluence',
  'гнучкі методології': 'agile',
  'гнучкі методології розробки': 'agile',
  'agile методології': 'agile',
  'скрам': 'scrum',
  'канбан': 'kanban',
  'каскадна модель': 'waterfall',
  'управління проєктами': 'project management',
  'управління проектами': 'project management',
  'управління продуктом': 'product management',
  'управління ризиками': 'risk management',
  'управління змінами': 'change management',
  'управління стейкхолдерами': 'stakeholder management',
  'робота зі стейкхолдерами': 'stakeholder management',
  'управління командою': 'team management',
  'управління беклогом': 'backlog management',
  'ведення беклогу': 'backlog management',
  'оцінка задач': 'estimation',
  'оцінка трудовитрат': 'estimation',
  'ретроспектива': 'retrospective',
  'збір вимог': 'requirements gathering',
  'виявлення вимог': 'requirements gathering',
  'аналіз вимог': 'requirements analysis',
  'документування вимог': 'requirements documentation',
  'користувацькі історії': 'user stories',
  'сценарії використання': 'use cases',
  'бізнес процеси': 'business processes',
  'моделювання бізнес процесів': 'bpmn',
  'функціональні вимоги': 'functional requirements',
  'нефункціональні вимоги': 'non-functional requirements',
  'технічне завдання': 'srs',
  'критерії приймання': 'acceptance criteria',
  'бази даних': 'databases',
  'системи контролю версій': 'git',
  'тестування': 'qa',
  'ручне тестування': 'qa',
  'аналітика даних': 'data analytics',
  'продуктова аналітика': 'product analytics',
  'метрики': 'metrics',
  'комунікативні навички': 'communication',
  'комунікація': 'communication',
  'презентаційні навички': 'presentation skills',
  'ведення переговорів': 'negotiation',
  'переговори': 'negotiation',
  'лідерські якості': 'leadership',
  'лідерство': 'leadership',
  'робота в команді': 'teamwork',
  'командна робота': 'teamwork',
  'критичне мислення': 'critical thinking',
  'системне мислення': 'systems thinking',
  'вирішення проблем': 'problem solving',
  'управління конфліктами': 'conflict management',
  'фасилітація': 'facilitation',
  'фасилітація зустрічей': 'facilitation',
  'багатозадачність': 'multitasking',
  'самостійність': 'self-management',
  'проактивність': 'proactivity',
  'англійська мова': 'english',
  'англійська': 'english',
  'німецька мова': 'german',
  'німецька': 'german',
}

/** Уровни владения и прочие маркеры, которые не влияют на суть требования. */
const LEVEL_MARKERS = new Set([
  'a1', 'a2', 'b1', 'b2', 'c1', 'c2',
  'elementary', 'basic', 'pre', 'intermediate', 'upper', 'advanced', 'fluent', 'proficient', 'native',
  'разговорный', 'письменный', 'свободный', 'технический',
  'розмовн', 'письмов', 'вільн', 'технічн',
  'middle', 'senior', 'junior', 'lead',
])

/** Хвостовые слова-пустышки: «Agile методологии» → «agile», «Fintech домен» → «fintech». */
const TAIL_NOISE = new Set([
  'методологи', 'методологий', 'нотаци', 'фреймворк', 'язык', 'инструмент', 'практик', 'домен', 'сфер', 'отрасл',
  'методолог', 'нотац', 'мов', 'інструмент', 'галуз',
])

/** Предлоги, остающиеся после срезания префикса: «опыт в e-commerce» → «e-commerce». */
const LEADING_STOPWORDS = new Set([
  'в', 'во', 'с', 'со', 'на', 'по', 'для', 'из', 'и', 'к', 'о', 'об', 'при',
  'у', 'з', 'зі', 'та', 'із',
  'the', 'of', 'in', 'with',
])

/**
 * Кириллические двойники латиницы. В описаниях вакансий регулярно встречается
 * «МS Project» или «Jirа» со случайной русской буквой — без этого шага дубль неизбежен.
 */
const HOMOGLYPHS = { а: 'a', в: 'b', е: 'e', і: 'i', к: 'k', м: 'm', н: 'h', о: 'o', р: 'p', с: 'c', т: 't', у: 'y', х: 'x' }

function fixHomoglyphs(text) {
  return text
    .split(' ')
    .map((word) => {
      // правим только слова, где латиница уже есть — русские слова не трогаем
      if (!/[a-z]/.test(word) || !/[а-яіїєґ]/.test(word)) return word
      return word.replace(/[а-яіїєґ]/g, (ch) => HOMOGLYPHS[ch] ?? ch)
    })
    .join(' ')
}

/** Грубая лемматизация: «методологиями» → «методологи». Только целиком русские слова. */
function lemma(word) {
  if (word.length < 5 || !/^[а-яіїєґ]+$/.test(word)) return word
  // окончания русского и украинского вместе: «методологиями», «методологіями»
  return word.replace(/(ами|ями|иями|іями|ов|ів|ей|ий|ії|ые|ых|их|ой|ом|ам|ям|ы|у|ю|а|я|и|і|е|є|ь)$/u, '')
}

/** Приводит строку к сравнимому виду: регистр, двойники, пунктуация, шум, окончания. */
export function normalizeName(raw) {
  if (!raw) return ''
  let s = String(raw)
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[«»""''’ʼ`]/g, '')
    .replace(/\([^)]*\)/g, ' ') // выкидываем всё в скобках
    .replace(/[.,;:!?/\\|+*_—–-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  s = fixHomoglyphs(s)

  // срезаем шумные префиксы (их может быть несколько подряд)
  let changed = true
  while (changed) {
    changed = false
    for (const p of NOISE_PREFIXES) {
      if (s.startsWith(p + ' ')) {
        s = s.slice(p.length + 1).trim()
        changed = true
      }
    }
  }
  for (const suffix of NOISE_SUFFIXES) {
    if (s.endsWith(' ' + suffix)) s = s.slice(0, -(suffix.length + 1)).trim()
  }

  let tokens = s.split(' ').filter(Boolean)
  if (tokens.length > 1) tokens = tokens.filter((t) => !LEVEL_MARKERS.has(t))
  while (tokens.length > 1 && LEADING_STOPWORDS.has(tokens[0])) tokens.shift()
  tokens = tokens.map(lemma)
  while (tokens.length > 1 && TAIL_NOISE.has(tokens[tokens.length - 1])) tokens.pop()

  return tokens.join(' ').trim()
}

/**
 * Индекс синонимов, построенный по нормализованным ключам.
 * Благодаря этому запись в SYNONYMS можно делать в естественной форме
 * («управление стейкхолдерами»), а совпадёт она и с «управлением стейкхолдеров».
 */
const SYNONYM_INDEX = new Map()
for (const [key, value] of Object.entries(SYNONYMS)) {
  SYNONYM_INDEX.set(key, value)
  const normalized = normalizeName(key)
  if (normalized) SYNONYM_INDEX.set(normalized, value)
}

/** Языки плодят бесконечные варианты («английский B2», «English upper-intermediate»). */
const LANGUAGE_RULES = [
  [/^(английск|англійськ|english|англ)/, 'english'],
  [/^(немецк|німецьк|german|deutsch)/, 'german'],
  [/^(французск|французьк|french)/, 'french'],
  [/^(испанск|іспанськ|spanish)/, 'spanish'],
]

/** Финальный ключ дедупликации: нормализация + синонимы. */
export function toSlug(raw) {
  const base = normalizeName(raw)
  if (!base) return ''

  const canonical = SYNONYM_INDEX.get(base)
  if (canonical) return canonical.replace(/\s+/g, '-')

  for (const [re, slug] of LANGUAGE_RULES) {
    if (re.test(base)) return slug
  }

  return base.replace(/\s+/g, '-')
}

/** Совсем жёсткое сжатие — только буквы и цифры. Ловит «CI/CD» = «cicd». */
function squash(raw) {
  return normalizeName(raw).replace(/[^a-z0-9а-яіїєґ]/gi, '')
}

/**
 * Ищет требование среди уже сохранённых.
 * @param {string} name
 * @param {Array<{id:string,name:string,slug:string,aliases?:string[]}>} skills
 */
export function findExistingSkill(name, skills) {
  const slug = toSlug(name)
  if (!slug) return null

  const bySlug = skills.find((s) => s.slug === slug)
  if (bySlug) return bySlug

  const byAlias = skills.find((s) => (s.aliases ?? []).some((a) => toSlug(a) === slug))
  if (byAlias) return byAlias

  const squashed = squash(name)
  if (squashed.length >= 3) {
    const bySquash = skills.find(
      (s) => squash(s.name) === squashed || (s.aliases ?? []).some((a) => squash(a) === squashed),
    )
    if (bySquash) return bySquash
  }

  return null
}

/** Аккуратный тайтл-кейс для новых записей, без ломания аббревиатур. */
export function prettifyName(raw) {
  const s = String(raw ?? '').trim().replace(/\s+/g, ' ')
  if (!s) return ''
  if (s === s.toUpperCase() && s.length <= 6) return s // API, SQL, BPMN
  return s.charAt(0).toUpperCase() + s.slice(1)
}

/** Написание, которое нельзя вывести из slug автоматически. */
const DISPLAY_OVERRIDES = {
  api: 'API',
  'rest-api': 'REST API',
  sql: 'SQL',
  nosql: 'NoSQL',
  'ci/cd': 'CI/CD',
  bpmn: 'BPMN',
  uml: 'UML',
  cjm: 'CJM',
  srs: 'SRS',
  kpi: 'KPI',
  qa: 'QA',
  pmp: 'PMP',
  psm: 'PSM',
  csm: 'CSM',
  cbap: 'CBAP',
  ecba: 'ECBA',
  itil: 'ITIL',
  pmbok: 'PMBOK',
  prince2: 'PRINCE2',
  safe: 'SAFe',
  less: 'LeSS',
  json: 'JSON',
  xml: 'XML',
  openapi: 'OpenAPI',
  'power-bi': 'Power BI',
  'google-analytics': 'Google Analytics',
  'google-sheets': 'Google Sheets',
  'azure-devops': 'Azure DevOps',
  'microsoft-project': 'MS Project',
  'microsoft-office': 'MS Office',
  'microsoft-teams': 'MS Teams',
  'draw.io': 'draw.io',
  'monday.com': 'monday.com',
  'as-is-to-be': 'As-Is / To-Be',
  'definition-of-done': 'Definition of Done',
  'unit-economics': 'Unit-экономика',
  postgresql: 'PostgreSQL',
  youtrack: 'YouTrack',
  visio: 'Visio',
  english: 'English',
  german: 'German',
  french: 'French',
  spanish: 'Spanish',
}

const LOWERCASE_WORDS = new Set(['of', 'to', 'the', 'and', 'in', 'as', 'is', 'be'])

/**
 * Название для новой записи в базе.
 * Если сработала карта синонимов («гибкие методологии разработки» → agile),
 * показываем канонический термин, а не формулировку из вакансии.
 */
export function canonicalName(raw) {
  const slug = toSlug(raw)
  if (!slug) return prettifyName(raw)

  // синонимы не сработали — оставляем формулировку автора вакансии
  if (slug === normalizeName(raw).replace(/\s+/g, '-')) return prettifyName(raw)

  if (DISPLAY_OVERRIDES[slug]) return DISPLAY_OVERRIDES[slug]

  // кириллический канон оставляем как есть, латиницу приводим к тайтл-кейсу
  if (/[а-яіїєґ]/.test(slug)) return prettifyName(slug.replace(/-/g, ' '))

  return slug
    .split('-')
    .map((w, i) => (i > 0 && LOWERCASE_WORDS.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(' ')
}
