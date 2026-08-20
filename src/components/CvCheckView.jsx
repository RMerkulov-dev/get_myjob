import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { reviewDocument } from '../lib/openrouter'
import { readDocumentFile } from '../lib/pdf'
import { DOC_TYPES, REVIEW_LANGS, defaultChecklist } from '../lib/checklists'
import { useI18n } from '../i18n'
import { Empty, Hint, Icon, PageHead, ScoreBar, Segmented, Spinner } from './ui'

const STORE_KEY = 'skill-dossier.cvcheck'
// v2: на последней вкладке главным документом стало резюме, а объявление
// переехало в отдельное поле — старые черновики нужно перенести, а не
// выдавать объявление за резюме.
const STORE_VERSION = 2
const MIN_CHARS = 220
const MIN_VACANCY_CHARS = 160

/** Резюме пишут по-английски, письмо и профиль — часто на языке рынка. */
function defaultLang(docType, uiLang) {
  if (docType === 'cv') return 'en'
  return REVIEW_LANGS.includes(uiLang) ? uiLang : 'en'
}

const emptyDoc = (docType, uiLang) => ({
  text: '',
  fileName: '',
  pages: 0,
  vacancyText: '', // только у режима сравнения: объявление, с которым сверяем резюме
  lang: defaultLang(docType, uiLang),
  criteria: null, // null — берём чек-лист по умолчанию для текущего языка
  result: null,
})

function loadStore(uiLang) {
  const blank = { docType: 'cv', docs: {} }
  let saved = {}
  try {
    saved = JSON.parse(localStorage.getItem(STORE_KEY) || '{}')
  } catch {
    /* повреждённый ключ — начинаем с чистого листа */
  }
  const docs = {}
  for (const id of DOC_TYPES) docs[id] = { ...emptyDoc(id, uiLang), ...(saved.docs?.[id] ?? {}) }

  // Миграция: то, что лежало в тексте последней вкладки, было объявлением.
  // Разбор считался по прежней схеме, поэтому его сбрасываем.
  if (saved.version !== STORE_VERSION && docs.vacancy.text && !docs.vacancy.vacancyText) {
    docs.vacancy = {
      ...docs.vacancy,
      vacancyText: docs.vacancy.text,
      text: '',
      fileName: '',
      pages: 0,
      result: null,
    }
  }

  return {
    version: STORE_VERSION,
    docType: DOC_TYPES.includes(saved.docType) ? saved.docType : blank.docType,
    docs,
  }
}

/**
 * Выжимка по навыкам из базы — добавка к режиму сравнения: сама вакансия
 * уходит в запрос дословно, а это её дополняет самооценкой уровней.
 * Держим её короткой: это добавка к каждому запросу.
 */
function buildTargetContext({ skills }) {
  const lines = []

  const demanded = [...skills]
    .filter((s) => (s.mentions ?? 0) > 0)
    .sort((a, b) => (b.mentions ?? 0) - (a.mentions ?? 0) || a.name.localeCompare(b.name))
    .slice(0, 30)

  lines.push(
    'This block is internal data about the target market. Use it to decide what the document should cover. Never copy its notation (×counts, L0-L5 levels, "must"/"nice") into the document itself.',
  )

  if (demanded.length) {
    lines.push(
      `Requirements most often asked for in the vacancies this person is targeting (name ×mentions, must/nice, self-assessed level 0-5):`,
      demanded
        .map((s) => `${s.name} ×${s.mentions}${s.importance === 'must' ? ' must' : ''} L${s.level ?? 0}`)
        .join('; '),
    )
  }

  const strong = skills.filter((s) => s.learned || (s.level ?? 0) >= 4).map((s) => s.name)
  if (strong.length) lines.push(`Skills the person considers solid: ${strong.slice(0, 25).join(', ')}.`)

  return lines.filter(Boolean).join('\n')
}

/** Отчёт в markdown — чтобы унести правки в редактор одним движением. */
function reportToMarkdown(result, title, t, label) {
  const out = [`# ${title}`, '']
  if (Number.isFinite(result.score)) out.push(`**${label('score')}: ${result.score}/100**`, '')
  if (Number.isFinite(result.atsScore)) out.push(`**${t('cv.atsScore')}: ${result.atsScore}/100**`, '')
  if (result.verdict) out.push(result.verdict, '')
  if (result.strengths.length) {
    out.push(`## ${label('strengths')}`, ...result.strengths.map((s) => `- ${s}`), '')
  }
  if (result.metrics?.length) {
    out.push(
      `## ${t('cv.metrics')}`,
      ...result.metrics.map((m) => `- **${m.name}: ${m.score}/100**${m.comment ? ` — ${m.comment}` : ''}`),
      '',
    )
  }
  if (result.ats?.missingKeywords?.length) {
    out.push(`## ${t('cv.atsKeywords')}`, result.ats.missingKeywords.join(', '), '')
  }
  if (result.ats?.fixes?.length) {
    out.push(`## ${t('cv.atsFixes')}`, ...result.ats.fixes.map((f) => `- ${f}`), '')
  }
  if (result.findings.length) {
    out.push(`## ${label('findings')}`)
    result.findings.forEach((f, i) => {
      out.push(`### ${i + 1}. ${f.item || '—'} · ${t(`cv.severity.${f.severity}`)}`)
      if (f.problem) out.push(f.problem)
      if (f.fix) out.push(`*${t('cv.fix')}:* ${f.fix}`)
      if (f.before) out.push('', `> ${f.before.replace(/\n/g, '\n> ')}`)
      if (f.after) out.push('', `**${label('after')}:**`, f.after)
      out.push('')
    })
  }
  if (result.missing.length) out.push(`## ${label('missing')}`, ...result.missing.map((s) => `- ${s}`), '')
  if (result.nextSteps.length) out.push(`## ${t('cv.nextSteps')}`, ...result.nextSteps.map((s) => `- ${s}`), '')
  return out.join('\n')
}

export default function CvCheckView({ skills, vacancies, settings, toast }) {
  const { t, lang: uiLang, formatNumber } = useI18n()

  const [store, setStore] = useState(() => loadStore(uiLang))
  const [vacancyId, setVacancyId] = useState('')
  const [useContext, setUseContext] = useState(true)
  const [showCriteria, setShowCriteria] = useState(false)
  const [reading, setReading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState(0)
  const [dragging, setDragging] = useState(false)
  const [copied, setCopied] = useState('')
  const abortRef = useRef(null)
  const fileRef = useRef(null)

  const { docType, docs } = store
  const doc = docs[docType]
  const criteria = doc.criteria ?? defaultChecklist(docType, doc.lang)
  const chars = doc.text.trim().length
  const vacancyChars = (doc.vacancyText ?? '').trim().length

  // Схема ответа у всех типов одна, но у вакансии те же поля значат другое:
  // не «правки в текст», а соответствие кандидата и риски. Меняем подписи.
  const isVacancy = docType === 'vacancy'
  const label = useCallback(
    (key) => t(isVacancy ? `cv.vacancyLabels.${key}` : `cv.${key}`),
    [t, isVacancy],
  )
  // В режиме сравнения главный документ — резюме, а не «документ вообще»
  const docLabel = isVacancy ? t('cv.yourCv') : t('cv.text')

  // Текст документа и правки живут в localStorage: переключение вкладок и
  // перезагрузка страницы не должны стирать ответ, за который уже заплачено.
  // Запись отложена: резюме бывает на 60 000 символов, сериализовать его
  // на каждое нажатие клавиши незачем.
  useEffect(() => {
    const id = setTimeout(() => {
      try {
        localStorage.setItem(STORE_KEY, JSON.stringify(store))
      } catch {
        /* приватный режим или переполненная квота — переживём */
      }
    }, 400)
    return () => clearTimeout(id)
  }, [store])

  useEffect(() => {
    if (!copied) return
    const id = setTimeout(() => setCopied(''), 1600)
    return () => clearTimeout(id)
  }, [copied])

  const patchDoc = useCallback(
    (patch, id) =>
      setStore((s) => {
        const target = id ?? s.docType
        return { ...s, docs: { ...s.docs, [target]: { ...s.docs[target], ...patch } } }
      }),
    [],
  )

  const docOptions = useMemo(
    () => DOC_TYPES.map((id) => ({ id, label: t(`cv.docs.${id}`), full: t(`cv.docsHint.${id}`) })),
    [t],
  )
  const langOptions = useMemo(() => REVIEW_LANGS.map((id) => ({ id, label: t(`cv.langs.${id}`) })), [t])

  // Сравнение с базой осталось только у режима сравнения: остальные документы
  // оцениваются сами по себе, по чек-листу.
  const context = useMemo(
    () => (isVacancy && useContext ? buildTargetContext({ skills }) : ''),
    [isVacancy, useContext, skills],
  )

  /** Готовая вакансия из базы — сразу текстом в поле сравнения. */
  function pickVacancy(id) {
    setVacancyId(id)
    if (!id) return
    const vacancy = vacancies.find((v) => v.id === id)
    if (!vacancy?.raw_text) return
    patchDoc({ vacancyText: vacancy.raw_text, result: null })
    toast(t('cv.vacancyFilled', { title: vacancy.title }), 'success')
  }

  /** Резюме уже разобрано на первой вкладке — незачем загружать его дважды. */
  function takeCvFromTab() {
    const source = docs.cv
    if (!source.text.trim()) {
      toast(t('cv.noCvYet'), 'info')
      return
    }
    patchDoc({ text: source.text, fileName: source.fileName, pages: source.pages, result: null })
    toast(t('cv.filledFromCv'), 'success')
  }

  async function handleFile(file) {
    if (!file) return
    setReading(true)
    try {
      const { text, pages, truncated } = await readDocumentFile(file)
      patchDoc({ text, fileName: file.name, pages, result: null })
      if (truncated) toast(t('cv.truncated'), 'info')
      else toast(t('cv.loaded', { name: file.name }), 'success')
    } catch (e) {
      toast(e.message, 'error')
    } finally {
      setReading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  async function handleCheck() {
    if (chars < MIN_CHARS) {
      toast(t('cv.tooShort', { n: MIN_CHARS }), 'error')
      return
    }
    if (isVacancy && vacancyChars < MIN_VACANCY_CHARS) {
      toast(t('cv.vacancyTooShort', { n: MIN_VACANCY_CHARS }), 'error')
      return
    }
    const controller = new AbortController()
    abortRef.current = controller
    setBusy(true)
    setProgress(0)
    patchDoc({ result: null })

    let received = 0
    try {
      const result = await reviewDocument(
        {
          apiKey: settings.apiKey,
          model: settings.reviewModel || settings.model,
          docType,
          text: doc.text,
          criteria,
          lang: doc.lang,
          context,
          vacancyText: isVacancy ? doc.vacancyText ?? '' : '',
          signal: controller.signal,
        },
        (delta) => {
          received += delta.length
          setProgress(received)
        },
      )
      if (!result.findings.length && !result.verdict) {
        toast(t('cv.nothingBack'), 'error')
        return
      }
      patchDoc({ result })
    } catch (e) {
      if (e.name !== 'AbortError') toast(e.message, 'error')
    } finally {
      setBusy(false)
      abortRef.current = null
    }
  }

  async function copy(text, tag) {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(tag)
    } catch {
      toast(t('cv.copyFailed'), 'error')
    }
  }

  const result = doc.result

  return (
    <>
      <PageHead
        title={t('cv.title')}
        accent={t('cv.titleAccent')}
        aside={
          <Segmented
            options={docOptions}
            value={docType}
            onChange={(id) => setStore((s) => ({ ...s, docType: id }))}
            accent
          />
        }
      >
        {t(`cv.lead.${docType}`)}
      </PageHead>

      <div className="import-layout">
        {/* ------------------------------------------------ левая колонка */}
        <div>
          <label
            className="filedrop"
            data-over={dragging}
            onDragOver={(e) => {
              e.preventDefault()
              setDragging(true)
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault()
              setDragging(false)
              handleFile(e.dataTransfer.files?.[0])
            }}
          >
            <input
              ref={fileRef}
              type="file"
              accept=".pdf,.docx,.txt,.md,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
              onChange={(e) => handleFile(e.target.files?.[0])}
              hidden
            />
            {reading ? (
              <>
                <Spinner />
                <span className="filedrop-title">{t('cv.reading')}</span>
              </>
            ) : (
              <>
                <Icon name="doc" size={22} />
                <span className="filedrop-title">{doc.fileName || t('cv.drop')}</span>
                <span className="filedrop-hint">
                  {doc.fileName
                    ? doc.pages
                      ? t('cv.fileMeta', { pages: doc.pages, chars: formatNumber(chars) })
                      : t('cv.fileMetaNoPages', { chars: formatNumber(chars) })
                    : t('cv.dropHint')}
                </span>
              </>
            )}
          </label>

          <div className="field" style={{ marginTop: 14 }}>
            <div className="row wrap" style={{ gap: 8, marginBottom: 7 }}>
              <span className="field-label" style={{ marginBottom: 0 }}>
                {docLabel}
                <span className="mono" style={{ marginLeft: 8, textTransform: 'none' }}>
                  {chars ? t('import.chars', { n: formatNumber(chars) }) : t('import.empty')}
                </span>
              </span>
              <span className="spacer" />
              {isVacancy && (
                <button className="btn btn-ghost btn-sm" onClick={takeCvFromTab}>
                  <Icon name="doc" size={12} /> {t('cv.fillFromCv')}
                </button>
              )}
            </div>
            <textarea
              className="textarea"
              style={{ minHeight: 220 }}
              aria-label={docLabel}
              placeholder={t(`cv.placeholder.${docType}`)}
              value={doc.text}
              onChange={(e) => patchDoc({ text: e.target.value })}
              spellCheck={false}
            />
          </div>

          {/* ------------------------------------ вакансия, с которой сверяем */}
          {isVacancy && (
            <div className="panel" style={{ marginTop: 14, padding: 16 }}>
              <div className="row wrap" style={{ gap: 8 }}>
                <span className="field-label" style={{ marginBottom: 0 }}>
                  {t('cv.vacancyText')}
                  <span className="mono" style={{ marginLeft: 8, textTransform: 'none' }}>
                    {vacancyChars ? t('import.chars', { n: formatNumber(vacancyChars) }) : t('import.empty')}
                  </span>
                </span>
                <span className="spacer" />
                {vacancies.length > 0 && (
                  <select
                    className="select"
                    style={{ width: 'auto', maxWidth: 240, padding: '5px 9px', fontSize: 12.5 }}
                    value={vacancyId}
                    onChange={(e) => pickVacancy(e.target.value)}
                  >
                    <option value="">{t('cv.vacancyFromDb')}</option>
                    {vacancies.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.title}
                        {v.company ? ` — ${v.company}` : ''}
                      </option>
                    ))}
                  </select>
                )}
              </div>
              <p className="report-note" style={{ marginTop: 8, marginBottom: 8 }}>{t('cv.vacancyTextHint')}</p>
              <textarea
                className="textarea"
                style={{ minHeight: 180 }}
                aria-label={t('cv.vacancyText')}
                placeholder={t('cv.vacancyPlaceholder')}
                value={doc.vacancyText ?? ''}
                onChange={(e) => patchDoc({ vacancyText: e.target.value })}
                spellCheck={false}
              />
            </div>
          )}

          <div className="row wrap" style={{ marginTop: 14, gap: 12 }}>
            <div>
              <span className="field-label" style={{ marginBottom: 6 }}>{t('cv.answerLang')}</span>
              <Segmented options={langOptions} value={doc.lang} onChange={(id) => patchDoc({ lang: id })} />
            </div>
            {docType === 'cv' && doc.lang !== 'en' && (
              <span className="mono" style={{ alignSelf: 'flex-end', color: 'var(--ink-3)' }}>
                {t('cv.cvLangNote')}
              </span>
            )}
          </div>

          {/* ----------------------------------------- критерии проверки */}
          <div className="panel" style={{ marginTop: 16, padding: 16 }}>
            <div className="row wrap">
              <span className="field-label" style={{ marginBottom: 0 }}>{t('cv.criteria')}</span>
              <span className="spacer" />
              {doc.criteria !== null && (
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => patchDoc({ criteria: null })}
                  title={t('cv.criteriaResetHint')}
                >
                  <Icon name="refresh" size={12} /> {t('common.reset')}
                </button>
              )}
              <button className="btn btn-ghost btn-sm" onClick={() => setShowCriteria((v) => !v)}>
                {showCriteria ? t('common.hide') : t('common.show')}
              </button>
            </div>

            {!showCriteria && (
              <p className="report-note" style={{ marginTop: 8 }}>
                {doc.criteria === null ? t('cv.criteriaDefault') : t('cv.criteriaCustom')}
              </p>
            )}

            {showCriteria && (
              <>
                <p className="report-note" style={{ marginTop: 8, marginBottom: 8 }}>{t('cv.criteriaHint')}</p>
                <textarea
                  className="textarea"
                  style={{ minHeight: 260, fontSize: 13 }}
                  value={criteria}
                  onChange={(e) => patchDoc({ criteria: e.target.value })}
                  spellCheck={false}
                />
              </>
            )}
          </div>

          {/* ------------------------------------------ контекст из базы */}
          {isVacancy && (
            <div className="panel" style={{ marginTop: 12, padding: 16 }}>
              <label className="check ink">
                <input type="checkbox" checked={useContext} onChange={(e) => setUseContext(e.target.checked)} />
                <span>{t('cv.useContext')}</span>
              </label>
              <p className="report-note" style={{ marginTop: 6 }}>
                {t('cv.useContextHint', { skills: skills.length })}
              </p>
            </div>
          )}

          <div className="row wrap" style={{ marginTop: 16 }}>
            {busy ? (
              <button className="btn" onClick={() => abortRef.current?.abort()}>
                <Icon name="close" size={13} /> {t('chat.stop')}
              </button>
            ) : (
              <button
                className="btn btn-accent"
                onClick={handleCheck}
                disabled={reading || chars < MIN_CHARS || (isVacancy && vacancyChars < MIN_VACANCY_CHARS)}
              >
                <Icon name="spark" /> {isVacancy ? t('cv.compare') : t('cv.check')}
              </button>
            )}
            {(doc.text || result) && !busy && (
              <button
                className="btn btn-ghost"
                onClick={() => patchDoc({ ...emptyDoc(docType, uiLang), lang: doc.lang, criteria: doc.criteria })}
              >
                {t('common.clear')}
              </button>
            )}
            <span className="spacer" />
            <span className="mono">
              {t('common.model')}: {(settings.reviewModel || settings.model).split('/').pop()}
            </span>
          </div>
        </div>

        {/* ------------------------------------------------ правая колонка */}
        <div className="panel card-pad-lg">
          {busy && (
            <div style={{ display: 'grid', gap: 10 }}>
              <div className="mono">
                {progress ? t('cv.working', { n: formatNumber(progress) }) : t('cv.thinking')}
              </div>
              {[0, 1, 2].map((i) => (
                <div key={i} className="skeleton" style={{ height: 62, animationDelay: `${i * 0.12}s` }} />
              ))}
            </div>
          )}

          {!busy && !result && (
            <div style={{ textAlign: 'center', padding: '30px 6px' }}>
              <div className="serif" style={{ fontSize: 26, marginBottom: 8 }}>{t('cv.resultTitle')}</div>
              <p className="muted" style={{ fontSize: 13.5 }}>{t('cv.resultLead')}</p>
            </div>
          )}

          {!busy && result && (
            <>
              <div className="row wrap" style={{ alignItems: 'flex-start', gap: 16 }}>
                {Number.isFinite(result.score) && (
                  <div
                    className="cv-score"
                    data-band={result.score >= 80 ? 'good' : result.score >= 55 ? 'mid' : 'low'}
                  >
                    <span className="cv-score-value">{result.score}</span>
                    <span className="cv-score-label">
                      {label('score')}
                      <Hint text={t(isVacancy ? 'cv.fitHint' : 'cv.scoreHint')} />
                    </span>
                  </div>
                )}
                <div style={{ flex: 1, minWidth: 180 }}>
                  <p style={{ fontSize: 14, lineHeight: 1.55 }}>{result.verdict}</p>
                  {Number.isFinite(result.atsScore) && (
                    <div style={{ marginTop: 12 }}>
                      <ScoreBar label={t('cv.atsScore')} value={result.atsScore} hint={t('cv.atsHint')} />
                    </div>
                  )}
                  <div className="row wrap" style={{ gap: 5, marginTop: 10 }}>
                    <span className="tag">{t(`cv.docs.${docType}`)}</span>
                    {result.documentLanguage && <span className="tag">{result.documentLanguage}</span>}
                    <span className="tag">
                      {t(isVacancy ? 'cv.vacancyLabels.findingsCount' : 'cv.findingsCount', {
                        n: result.findings.length,
                      })}
                    </span>
                  </div>
                </div>
              </div>

              {result.metrics?.length > 0 && (
                <div className="cv-block">
                  <div className="report-h">{t('cv.metrics')}</div>
                  <p className="report-note" style={{ marginTop: 6 }}>{t('cv.metricsNote')}</p>
                  <div className="metrics">
                    {result.metrics.map((m) => (
                      <ScoreBar key={m.name} label={m.name} value={m.score} comment={m.comment} />
                    ))}
                  </div>
                </div>
              )}

              {result.strengths.length > 0 && (
                <div className="cv-block">
                  <div className="report-h">{label('strengths')}</div>
                  <ul className="cv-list cv-list-ok">
                    {result.strengths.map((s, i) => (
                      <li key={i}>{s}</li>
                    ))}
                  </ul>
                </div>
              )}

              {result.ats && (result.ats.missingKeywords?.length > 0 || result.ats.fixes?.length > 0) && (
                <div className="cv-block">
                  <div className="report-h">{t('cv.atsFixes')}</div>

                  {result.ats.missingKeywords.length > 0 && (
                    <>
                      <p className="report-note" style={{ marginTop: 6 }}>{t('cv.atsKeywords')}</p>
                      <div className="row wrap" style={{ gap: 5, marginTop: 8 }}>
                        {result.ats.missingKeywords.map((k) => (
                          <button
                            key={k}
                            className="tag tag-copy"
                            onClick={() => copy(k, `kw-${k}`)}
                            title={t('cv.copy')}
                          >
                            {copied === `kw-${k}` ? <Icon name="check" size={10} /> : null}
                            {k}
                          </button>
                        ))}
                      </div>
                    </>
                  )}

                  {result.ats.fixes.length > 0 && (
                    <ul className="cv-list cv-list-steps" style={{ marginTop: 12 }}>
                      {result.ats.fixes.map((f, i) => (
                        <li key={i}>{f}</li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

              {result.findings.length > 0 && (
                <div className="cv-block">
                  <div className="report-h">{label('findings')}</div>
                  <div className="cv-findings">
                    {result.findings.map((f, idx) => (
                      <article
                        key={f.id}
                        className="finding"
                        data-severity={f.severity}
                        style={{ animationDelay: `${Math.min(idx, 10) * 0.03}s` }}
                      >
                        <header className="row wrap" style={{ gap: 7 }}>
                          <span className="finding-num mono">{idx + 1}</span>
                          <span className="finding-item">{f.item || '—'}</span>
                          <span className="spacer" />
                          <span className={`tag tag-sev-${f.severity}`}>{t(`cv.severity.${f.severity}`)}</span>
                        </header>

                        {f.problem && <p className="finding-problem">{f.problem}</p>}

                        {f.before && (
                          <div className="finding-quote">
                            <span className="finding-label mono">{t('cv.before')}</span>
                            <span>{f.before}</span>
                          </div>
                        )}

                        {f.after && (
                          <div className="finding-after">
                            <div className="row" style={{ marginBottom: 4 }}>
                              <span className="finding-label mono">{label('after')}</span>
                              <span className="spacer" />
                              <button
                                className="btn btn-ghost btn-sm"
                                onClick={() => copy(f.after, `f${f.id}`)}
                                title={t('cv.copy')}
                              >
                                <Icon name={copied === `f${f.id}` ? 'check' : 'doc'} size={12} />
                                {copied === `f${f.id}` ? t('cv.copied') : t('cv.copy')}
                              </button>
                            </div>
                            <div className="finding-after-text">{f.after}</div>
                          </div>
                        )}

                        {f.fix && (
                          <p className="finding-fix">
                            <span className="finding-label mono">{t('cv.fix')}</span> {f.fix}
                          </p>
                        )}
                      </article>
                    ))}
                  </div>
                </div>
              )}

              {result.missing.length > 0 && (
                <div className="cv-block">
                  <div className="report-h">{label('missing')}</div>
                  <ul className="cv-list cv-list-warn">
                    {result.missing.map((s, i) => (
                      <li key={i}>{s}</li>
                    ))}
                  </ul>
                </div>
              )}

              {result.nextSteps.length > 0 && (
                <div className="cv-block">
                  <div className="report-h">{t('cv.nextSteps')}</div>
                  <ol className="cv-list cv-list-steps">
                    {result.nextSteps.map((s, i) => (
                      <li key={i}>{s}</li>
                    ))}
                  </ol>
                </div>
              )}

              <div className="row wrap" style={{ marginTop: 18, paddingTop: 16, borderTop: '1px solid var(--line)' }}>
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => copy(reportToMarkdown(result, `${t('cv.title')} ${t('cv.titleAccent')} · ${t(`cv.docs.${docType}`)}`, t, label), 'report')}
                >
                  <Icon name={copied === 'report' ? 'check' : 'doc'} size={13} />
                  {copied === 'report' ? t('cv.copied') : t('cv.copyReport')}
                </button>
                <button className="btn btn-ghost btn-sm" onClick={handleCheck}>
                  <Icon name="refresh" size={13} /> {t('cv.again')}
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {isVacancy && !skills.length && (
        <div style={{ marginTop: 22 }}>
          <Empty title={t('cv.noDataTitle')}>{t('cv.noDataText')}</Empty>
        </div>
      )}
    </>
  )
}
