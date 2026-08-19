/**
 * Чек-листы по умолчанию для вкладки CV Check.
 *
 * Это не системный промпт, а именно критерии — их видит и правит
 * пользователь, поэтому они на языке ответа, а не только на английском.
 * Системная часть (роль, формат JSON) живёт в openrouter.js и всегда
 * английская: так модель стабильнее держит схему.
 *
 * Правило простое: одна строка — один проверяемый пункт. Модель отвечает
 * по пунктам, поэтому «водянистые» формулировки здесь дороже, чем короткие.
 */

export const DOC_TYPES = ['cv', 'cover', 'linkedin', 'vacancy']

/** Язык ответа. CV по умолчанию английское, письмо и профиль — как интерфейс. */
export const REVIEW_LANGS = ['en', 'uk', 'ru']

const CV = {
  en: `1. Target role. It is clear in the first 5 seconds which position this is for; the headline matches the target role, not a generic "IT specialist".
2. Summary. 3-4 lines: seniority, domains, methodologies, the scale you work at. No clichés like "results-driven team player".
3. Achievements, not duties. Every role has outcomes with numbers: team size, budget, deadlines, delivery, scope, effect on the business. "Responsible for…" is a defect.
4. Wording. Strong verbs in the past tense, one bullet = one thought, up to 2 lines. No first-person pronouns, no passive voice.
5. PM/BA specifics. Visible: methodologies (Scrum/Kanban/Waterfall), artefacts (BRD/SRS, user stories, BPMN/UML, backlog), tools (Jira, Confluence, Figma, SQL, BI), stakeholder work.
6. Scale and context. For each project: domain, team composition, your role in it, project length. A recruiter must be able to picture the setup.
7. Keywords and ATS. The terms from the target job ads appear literally. Single column, no tables, text boxes, icons or graphics instead of text.
8. Consistency. Dates without gaps and overlaps, one date format, consistent job titles, no unexplained breaks longer than 6 months.
9. Length and density. 1-2 pages, the most relevant experience on page one, older roles compressed to one line.
10. Contacts. Email, phone with country code, city and work format, LinkedIn as a live link. No photo unless the market expects one.
11. Language quality. Grammar, articles, one style of English (US or UK), no machine-translation artefacts.
12. Noise. Remove: hobbies without relevance, soft-skill lists without proof, courses without value, salary expectations, marital status.
13. Ranking. If the summary of target vacancies is provided, say what to change to fit them specifically.`,

  uk: `1. Цільова роль. За 5 секунд зрозуміло, на яку позицію резюме; заголовок збігається з цільовою роллю, а не «IT-спеціаліст».
2. Саммарі. 3-4 рядки: рівень, домени, методології, масштаб роботи. Без штампів на кшталт «результативний командний гравець».
3. Досягнення, не обов'язки. У кожній ролі — результат із цифрами: розмір команди, бюджет, терміни, обсяг, ефект для бізнесу. «Відповідав за…» — це дефект.
4. Формулювання. Сильні дієслова в минулому часі, один пункт = одна думка, до 2 рядків. Без «я», без пасивних конструкцій.
5. Специфіка PM/BA. Видно: методології (Scrum/Kanban/Waterfall), артефакти (BRD/SRS, user stories, BPMN/UML, беклог), інструменти (Jira, Confluence, Figma, SQL, BI), робота зі стейкхолдерами.
6. Масштаб і контекст. Для кожного проєкту: домен, склад команди, твоя роль у ній, тривалість. Рекрутер має уявити картину.
7. Ключові слова й ATS. Терміни з цільових вакансій присутні дослівно. Одна колонка, без таблиць, текстових блоків, іконок і графіки замість тексту.
8. Узгодженість. Дати без пропусків і накладань, один формат дат, однакові назви посад, без непояснених перерв понад 6 місяців.
9. Обсяг і щільність. 1-2 сторінки, найрелевантніший досвід на першій, старі ролі — до одного рядка.
10. Контакти. Email, телефон із кодом країни, місто й формат роботи, LinkedIn робочим посиланням. Фото — лише якщо ринок цього очікує.
11. Якість мови. Граматика, артиклі, один варіант англійської (US або UK), без слідів машинного перекладу.
12. Шум. Прибрати: хобі без релевантності, перелік soft skills без доказів, курси без цінності, очікування щодо зарплати, сімейний стан.
13. Пріоритети. Якщо передано зведення цільових вакансій — скажи, що змінити саме під них.`,

  ru: `1. Целевая роль. За 5 секунд понятно, на какую позицию резюме; заголовок совпадает с целевой ролью, а не «IT-специалист».
2. Саммари. 3-4 строки: уровень, домены, методологии, масштаб работы. Без штампов вроде «результативный командный игрок».
3. Достижения, а не обязанности. В каждой роли — результат с цифрами: размер команды, бюджет, сроки, объём, эффект для бизнеса. «Отвечал за…» — это дефект.
4. Формулировки. Сильные глаголы в прошедшем времени, один пункт = одна мысль, до 2 строк. Без «я», без пассивных конструкций.
5. Специфика PM/BA. Видно: методологии (Scrum/Kanban/Waterfall), артефакты (BRD/SRS, user stories, BPMN/UML, бэклог), инструменты (Jira, Confluence, Figma, SQL, BI), работа со стейкхолдерами.
6. Масштаб и контекст. Для каждого проекта: домен, состав команды, твоя роль в ней, длительность. Рекрутер должен представить картину.
7. Ключевые слова и ATS. Термины из целевых вакансий присутствуют дословно. Одна колонка, без таблиц, текстовых блоков, иконок и графики вместо текста.
8. Согласованность. Даты без пропусков и наложений, один формат даты, одинаковые названия должностей, без необъяснённых перерывов дольше 6 месяцев.
9. Объём и плотность. 1-2 страницы, самый релевантный опыт на первой, старые роли — до одной строки.
10. Контакты. Email, телефон с кодом страны, город и формат работы, LinkedIn рабочей ссылкой. Фото — только если рынок этого ждёт.
11. Качество языка. Грамматика, артикли, один вариант английского (US или UK), без следов машинного перевода.
12. Шум. Убрать: хобби без релевантности, список soft skills без доказательств, курсы без ценности, зарплатные ожидания, семейное положение.
13. Приоритеты. Если передана сводка целевых вакансий — скажи, что изменить именно под них.`,
}

const COVER = {
  en: `1. Length. 180-280 words, 3-4 short paragraphs. Anything longer does not get read.
2. Opening. The first sentence says something concrete about the company, the product or the role. Never "I am writing to apply for the position of…".
3. Why them. One specific reason: their product, market, domain, tech or challenge. No generic flattery about "an industry leader".
4. Proof. 2-3 facts from experience that answer exactly the top requirements of the vacancy, each with a number or a result. Do not retell the CV.
5. Fit. Explicitly connect your background to their context: same domain, same scale, same methodology, similar problem already solved.
6. Awkward bits. Career switch, employment gap, relocation, visa, notice period, salary — one calm sentence, without apologising.
7. Ending. A clear next step: ready to talk, ready to walk through a case, availability.
8. Tone. Human, professional, no bureaucratic clichés and no artificial enthusiasm. Contractions are fine in English if the company writes that way.
9. Language. Write in the language of the vacancy; keep terms and the company name exactly as they spell them.
10. Personalisation. Addressed to a person or a team when the name is known; the position title matches the ad word for word.
11. Formatting. Short paragraphs, no bullet-point walls, no tables, no attachments referenced inside the text.
12. Verify. Every claim must be true and provable at the interview; no promises you cannot back up.`,

  uk: `1. Обсяг. 180-280 слів, 3-4 короткі абзаци. Довше просто не читають.
2. Початок. Перше речення говорить щось конкретне про компанію, продукт або роль. Ніколи не «Звертаюсь щодо вакансії…».
3. Чому саме вони. Одна конкретна причина: продукт, ринок, домен, технології або виклик. Без загальних похвал «лідеру галузі».
4. Докази. 2-3 факти з досвіду, що відповідають головним вимогам вакансії, кожен із цифрою або результатом. Не переказувати резюме.
5. Відповідність. Прямо зв'яжи свій бекграунд із їхнім контекстом: той самий домен, масштаб, методологія, вже вирішена схожа задача.
6. Незручні місця. Зміна напряму, перерва в роботі, релокація, віза, термін виходу, зарплата — одне спокійне речення, без виправдань.
7. Фінал. Чіткий наступний крок: готовий поговорити, розібрати кейс, коли можеш почати.
8. Тон. Людський, професійний, без канцеляриту й штучного захоплення.
9. Мова. Пиши мовою вакансії; терміни й назву компанії — точно так, як у них.
10. Персоналізація. Звертання до людини або команди, якщо ім'я відоме; назва позиції дослівно як в оголошенні.
11. Формат. Короткі абзаци, без стін із пунктів, без таблиць, без згадок вкладень у тексті.
12. Перевірка. Кожне твердження правдиве й доказове на інтерв'ю; жодних обіцянок, які не підтвердиш.`,

  ru: `1. Объём. 180-280 слов, 3-4 коротких абзаца. Длиннее просто не читают.
2. Начало. Первое предложение говорит что-то конкретное о компании, продукте или роли. Никогда не «Обращаюсь по вакансии…».
3. Почему именно они. Одна конкретная причина: продукт, рынок, домен, технологии или вызов. Без общих похвал «лидеру отрасли».
4. Доказательства. 2-3 факта из опыта, отвечающие главным требованиям вакансии, каждый с цифрой или результатом. Не пересказывать резюме.
5. Соответствие. Прямо свяжи свой бэкграунд с их контекстом: тот же домен, масштаб, методология, уже решённая похожая задача.
6. Неудобные места. Смена направления, перерыв в работе, релокация, виза, срок выхода, зарплата — одно спокойное предложение, без оправданий.
7. Финал. Чёткий следующий шаг: готов поговорить, разобрать кейс, когда можешь начать.
8. Тон. Человеческий, профессиональный, без канцелярита и искусственного восторга.
9. Язык. Пиши на языке вакансии; термины и название компании — точно как у них.
10. Персонализация. Обращение к человеку или команде, если имя известно; название позиции дословно как в объявлении.
11. Формат. Короткие абзацы, без стен из пунктов, без таблиц, без упоминания вложений в тексте.
12. Проверка. Каждое утверждение правдиво и доказуемо на интервью; никаких обещаний, которые не подтвердишь.`,
}

const LINKEDIN = {
  en: `1. Headline. Role + specialisation + value, up to 220 characters. Searchable words, not "Open to opportunities".
2. About, first three lines. Everything above the "see more" cut has to earn the click: who you are, what you deliver, at what scale.
3. About, body. First person, 4-6 short paragraphs or blocks, ends with how to reach you. Keywords a recruiter would type.
4. Experience. Every role: one line of context (product, team, domain) plus 3-5 achievement bullets with numbers. No copy-paste of duties.
5. Titles. Recognisable market titles that match the CV; internal grades explained in brackets.
6. Skills. Top 3 pinned skills match the target role; the list holds the terms recruiters filter by (Jira, BPMN, Stakeholder management, SQL).
7. Search visibility. Terms from target vacancies present in headline, About and experience — this is what Recruiter search matches on.
8. Consistency with the CV. Same dates, same titles, same companies. Any mismatch reads as a red flag.
9. Profile hygiene. Custom URL, professional photo, banner, location and work format, "Open to work" set for the roles you actually want.
10. Proof. Featured section with artefacts or cases, 2-3 recommendations, certifications with issuers.
11. Language. One profile language matching your target market; a second locale added separately, not mixed into one text.
12. Signals of life. Recent activity or a couple of posts on your topic; an empty profile with a perfect text still looks dormant.`,

  uk: `1. Заголовок. Роль + спеціалізація + цінність, до 220 символів. Слова, за якими шукають, а не «Відкритий до можливостей».
2. About, перші три рядки. Усе до «see more» має заслужити клік: хто ти, що даєш, у якому масштабі.
3. About, тіло. Від першої особи, 4-6 коротких абзаців або блоків, у кінці — як із тобою зв'язатися. Ключові слова, які набирає рекрутер.
4. Досвід. Кожна роль: рядок контексту (продукт, команда, домен) плюс 3-5 пунктів досягнень із цифрами. Без копіпасту обов'язків.
5. Назви посад. Зрозумілі ринку назви, що збігаються з резюме; внутрішні грейди — у дужках.
6. Skills. Три закріплені навички відповідають цільовій ролі; у списку — терміни, за якими фільтрують (Jira, BPMN, Stakeholder management, SQL).
7. Видимість у пошуку. Терміни з цільових вакансій присутні в заголовку, About і досвіді — саме за ними працює Recruiter search.
8. Узгодженість із резюме. Ті самі дати, назви, компанії. Будь-яка розбіжність читається як червоний прапорець.
9. Гігієна профілю. Власний URL, професійне фото, банер, локація й формат роботи, «Open to work» під ті ролі, які справді потрібні.
10. Докази. Featured з артефактами або кейсами, 2-3 рекомендації, сертифікати з видавцями.
11. Мова. Одна мова профілю під цільовий ринок; друга локаль — окремо, а не всередині того ж тексту.
12. Ознаки життя. Свіжа активність або кілька постів у своїй темі; порожній профіль із бездоганним текстом усе одно виглядає покинутим.`,

  ru: `1. Заголовок. Роль + специализация + ценность, до 220 символов. Слова, по которым ищут, а не «Открыт к возможностям».
2. About, первые три строки. Всё до «see more» должно заслужить клик: кто ты, что даёшь, в каком масштабе.
3. About, тело. От первого лица, 4-6 коротких абзацев или блоков, в конце — как с тобой связаться. Ключевые слова, которые набирает рекрутер.
4. Опыт. Каждая роль: строка контекста (продукт, команда, домен) плюс 3-5 пунктов достижений с цифрами. Без копипаста обязанностей.
5. Названия должностей. Понятные рынку названия, совпадающие с резюме; внутренние грейды — в скобках.
6. Skills. Три закреплённых навыка соответствуют целевой роли; в списке — термины, по которым фильтруют (Jira, BPMN, Stakeholder management, SQL).
7. Видимость в поиске. Термины из целевых вакансий присутствуют в заголовке, About и опыте — именно по ним работает Recruiter search.
8. Согласованность с резюме. Те же даты, названия, компании. Любое расхождение читается как красный флаг.
9. Гигиена профиля. Свой URL, профессиональное фото, баннер, локация и формат работы, «Open to work» под те роли, которые действительно нужны.
10. Доказательства. Featured с артефактами или кейсами, 2-3 рекомендации, сертификаты с выдавшими их организациями.
11. Язык. Один язык профиля под целевой рынок; вторая локаль — отдельно, а не внутри того же текста.
12. Признаки жизни. Свежая активность или пара постов по своей теме; пустой профиль с безупречным текстом всё равно выглядит заброшенным.`,
}

const VACANCY = {
  en: `1. Match. Which must-have requirements of this vacancy are already covered by the candidate's experience, and which are not covered at all.
2. Blocking gaps. What exactly gets this application rejected at the screening stage, and whether it can be closed before applying.
3. Role and seniority. Does the title match the responsibilities and the scale described? A "Senior PM" who is really a coordinator, or a "PM" who is really a delivery director — say so.
4. Red flags in the ad. Three roles in one (PM + BA + QA + support), no word about the team, "family atmosphere" instead of process, unpaid test assignments, an unnamed product, a requirements list nobody could satisfy.
5. What the ad hides. Salary, work format, timezone, contract type, team size, product stage, who the manager is — list what is missing and has to be asked.
6. Domain. How transferable the candidate's domain experience is to this product, and what to lean on if it is a different domain.
7. Language and location. The level and format required against what the candidate has; visas, timezones, relocation.
8. Growth versus risk. What this role adds to the candidate's profile in a year, and where it would keep them stuck.
9. Compensation sanity. Whether the stated range is realistic for this scope of requirements, and what to name if the range is absent.
10. How to apply. The three things to put at the top of the CV and the cover letter specifically for this ad, in its own wording.
11. Interview prep. What this ad will certainly be asked about, and the questions worth asking them.
12. Verdict. Apply now, apply after closing a specific gap, or skip — and why.`,

  uk: `1. Відповідність. Які обов'язкові вимоги цієї вакансії досвід кандидата вже покриває, а які не покриває зовсім.
2. Блокери. Що саме відсіє заявку на етапі скринінгу і чи можна це закрити до відправки.
3. Роль і рівень. Чи збігається назва позиції з обов'язками й масштабом? Якщо «Senior PM» насправді координатор, а «PM» — насправді delivery director, скажи про це.
4. Червоні прапорці в оголошенні. Три ролі в одній (PM + BA + QA + підтримка), жодного слова про команду, «сімейна атмосфера» замість процесів, безоплатні тестові, неназваний продукт, список вимог, який не закриє ніхто.
5. Що оголошення приховує. Зарплата, формат роботи, часовий пояс, тип контракту, розмір команди, стадія продукту, хто керівник — перелічи, чого немає і про що доведеться запитати.
6. Домен. Наскільки досвід кандидата переноситься на цей продукт і на що спертися, якщо домен інший.
7. Мова й локація. Потрібний рівень і формат проти того, що є в кандидата; візи, часові пояси, релокація.
8. Зростання проти ризику. Що ця роль додасть до профілю за рік і де вона законсервує.
9. Гроші. Чи реалістична вказана вилка для такого обсягу вимог і що називати, якщо вилки немає.
10. Як відгукуватися. Три речі, які підняти на початок резюме й листа саме під це оголошення, його ж формулюваннями.
11. Підготовка до інтерв'ю. Про що з цього оголошення точно спитають і які питання варто поставити їм.
12. Вердикт. Відгукуватися зараз, відгукуватися після закриття конкретної прогалини або пропустити — і чому.`,

  ru: `1. Соответствие. Какие обязательные требования этой вакансии опыт кандидата уже закрывает, а какие не закрывает совсем.
2. Блокеры. Что именно отсеет заявку на этапе скрининга и можно ли это закрыть до отправки.
3. Роль и уровень. Совпадает ли название позиции с обязанностями и масштабом? Если «Senior PM» на деле координатор, а «PM» — на деле delivery director, скажи об этом.
4. Красные флаги в объявлении. Три роли в одной (PM + BA + QA + поддержка), ни слова о команде, «семейная атмосфера» вместо процессов, бесплатные тестовые, неназванный продукт, список требований, который не закроет никто.
5. Что объявление скрывает. Зарплата, формат работы, часовой пояс, тип контракта, размер команды, стадия продукта, кто руководитель — перечисли, чего нет и о чём придётся спросить.
6. Домен. Насколько опыт кандидата переносится на этот продукт и на что опереться, если домен другой.
7. Язык и локация. Требуемый уровень и формат против того, что есть у кандидата; визы, часовые пояса, релокация.
8. Рост против риска. Что эта роль добавит к профилю за год и где она законсервирует.
9. Деньги. Реалистична ли указанная вилка для такого объёма требований и что называть, если вилки нет.
10. Как отзываться. Три вещи, которые поднять в начало резюме и письма именно под это объявление, его же формулировками.
11. Подготовка к интервью. О чём из этого объявления точно спросят и какие вопросы стоит задать им.
12. Вердикт. Отзываться сейчас, отзываться после закрытия конкретного пробела или пропустить — и почему.`,
}

const CHECKLISTS = { cv: CV, cover: COVER, linkedin: LINKEDIN, vacancy: VACANCY }

/** Чек-лист по умолчанию для типа документа и языка ответа. */
export function defaultChecklist(docType, lang) {
  const byLang = CHECKLISTS[docType] ?? CV
  return byLang[lang] ?? byLang.en
}

/** Совпадает ли текст с любым из дефолтов — чтобы не считать его правкой. */
export function isDefaultChecklist(docType, text) {
  const byLang = CHECKLISTS[docType] ?? CV
  const clean = String(text ?? '').trim()
  return REVIEW_LANGS.some((l) => byLang[l]?.trim() === clean)
}
