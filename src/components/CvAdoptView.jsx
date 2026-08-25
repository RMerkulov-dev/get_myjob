import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { proposeCvEdits, tailorCv } from '../lib/openrouter'
import { readDocumentFile } from '../lib/pdf'
import { buildCvDocx, cvToMarkdown, downloadBlob, suggestFileName } from '../lib/docxWrite'
import { useI18n } from '../i18n'
import { Empty, Hint, Icon, PageHead, Segmented, Spinner } from './ui'

const STORE_KEY = 'skill-dossier.cvadopt'
const STORE_VERSION = 1
/** Черновик вкладки «Проверка CV» — оттуда резюме забирается одной кнопкой. */
const CHECK_STORE_KEY = 'skill-dossier.cvcheck'
const MIN_CHARS = 220
const MIN_VACANCY_CHARS = 160

const LANGS = ['ru', 'uk', 'en']

const emptyStore = (uiLang) => ({
  version: STORE_VERSION,
  text: '',
  fileName: '',
  pages: 0,
  vacancyText: '',
  notes: '',
  lang: LANGS.includes(uiLang) ? uiLang : 'ru',
  plan: null, // предложенные правки
  approved: {}, // { editId: true } — что человек одобрил
  overrides: {}, // { editId: 'правка, отредактированная руками' }
  result: null, // собранное резюме
})

function loadStore(uiLang) {
  const blank = emptyStore(uiLang)
  try {
    const saved = JSON.parse(localStorage.getItem(STORE_KEY) || '{}')
    if (saved.version !== STORE_VERSION) return blank
    return { ...blank, ...saved }
  } catch {
    return blank
  }
}

/** Резюме, уже разобранное на вкладке «Проверка CV»: грузить файл дважды незачем. */
function cvFromCheckTab() {
  try {
    const saved = JSON.parse(localStorage.getItem(CHECK_STORE_KEY) || '{}')
    const doc = saved?.docs?.cv
    if (doc?.text?.trim()) return { text: doc.text, fileName: doc.fileName || '', pages: doc.pages || 0 }
  } catch {
    /* повреждённый ключ — просто нечего предложить */
  }
  return null
}

/**
 * Выжимка из базы навыков — единственная её задача здесь в том, чтобы в
 * резюме не появилось того, чего человек не знает. Поэтому передаём не
 * «частые требования», а две границы: что можно заявлять и что нельзя.
 */
function buildSkillGuard(skills) {
  const claimable = skills
    .filter((s) => s.learned || (s.level ?? 0) >= 3)
    .sort((a, b) => (b.level ?? 0) - (a.level ?? 0))
    .map((s) => s.name)
    .slice(0, 40)

  const weak = skills
    .filter((s) => !s.learned && (s.level ?? 0) <= 1)
    .sort((a, b) => (b.mentions ?? 0) - (a.mentions ?? 0))
    .map((s) => s.name)
    .slice(0, 40)

  if (!claimable.length && !weak.length) return ''

  const lines = [
    'Internal data about this person, self-assessed. Never copy its notation or wording into the CV.',
  ]
  if (claimable.length) lines.push(`Can be claimed (level 3-5 or marked as learned): ${claimable.join(', ')}.`)
  if (weak.length) {
    lines.push(
      `Must NOT be claimed (level 0-1) — never write these into the CV, whatever the vacancy asks: ${weak.join(', ')}.`,
    )
  }
  return lines.join('\n')
}

/**
 * Поле, которое растёт под текст. Готовая формулировка бывает и на пять
 * строк, а в поле фиксированной высоты она обрезается — и человек правит
 * то, чего не видит.
 */
function AutoTextarea({ value, ...rest }) {
  const ref = useRef(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [value])

  return (
    <textarea
      ref={ref}
      className="textarea edit-after"
      // до первого эффекта высота считается по длине текста: иначе поле
      // успевает мигнуть одной строкой
      rows={Math.min(10, Math.max(2, Math.ceil(String(value ?? '').length / 58)))}
      value={value}
      {...rest}
    />
  )
}

/* ------------------------------------------------------------- превью docx */

function DocBlock({ block }) {
  const text = (block.text ?? '').trim()

  if (block.type === 'entry') {
    return (
      <div className="cvdoc-entry">
        <div className="row" style={{ gap: 10, alignItems: 'baseline' }}>
          <strong style={{ flex: 1 }}>{text}</strong>
          {block.right && <span className="cvdoc-period">{block.right}</span>}
        </div>
        {block.meta && <div className="cvdoc-meta">{block.meta}</div>}
      </div>
    )
  }
  if (block.type === 'bullet') return text ? <div className="cvdoc-bullet">{text}</div> : null
  if (block.type === 'inline') {
    return (
      <p className="cvdoc-inline">
        {block.label && <strong>{block.label}: </strong>}
        {text}
      </p>
    )
  }
  return text ? <p className="cvdoc-para">{text}</p> : null
}

function DocPreview({ doc }) {
  return (
    <div className="cvdoc">
      {doc.name && <div className="cvdoc-name">{doc.name}</div>}
      {doc.headline && <div className="cvdoc-headline">{doc.headline}</div>}
      {doc.contacts?.length > 0 && <div className="cvdoc-contacts">{doc.contacts.join('  ·  ')}</div>}

      {(doc.sections ?? []).map((section, i) => (
        <section key={i} className="cvdoc-section">
          {section.heading && <h3 className="cvdoc-h">{section.heading}</h3>}
          {(section.blocks ?? []).map((block, j) => (
            <DocBlock key={j} block={block} />
          ))}
        </section>
      ))}
    </div>
  )
}

/* ------------------------------------------------------------- компонент */

export default function CvAdoptView({ skills, vacancies, settings, toast }) {
  const { t, lang: uiLang, formatNumber } = useI18n()

  const [store, setStore] = useState(() => loadStore(uiLang))
  const [vacancyId, setVacancyId] = useState('')
  const [useContext, setUseContext] = useState(true)
  const [reading, setReading] = useState(false)
  const [stage, setStage] = useState('') // 'propose' | 'build' — что сейчас считается
  const [progress, setProgress] = useState(0)
  const [dragging, setDragging] = useState(false)
  const [view, setView] = useState('edits')
  const [copied, setCopied] = useState('')
  const abortRef = useRef(null)
  const fileRef = useRef(null)

  const { plan, result, approved, overrides } = store
  const chars = store.text.trim().length
  const vacancyChars = store.vacancyText.trim().length
  const busy = !!stage

  // Черновик живёт в localStorage: за правки уже заплачено, и переключение
  // вкладки или перезагрузка страницы не должны их стирать. Запись отложена —
  // резюме бывает на 60 000 символов.
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

  const patch = useCallback((update) => setStore((s) => ({ ...s, ...update })), [])

  const langOptions = useMemo(() => LANGS.map((id) => ({ id, label: t(`cv.langs.${id}`) })), [t])

  const context = useMemo(() => (useContext ? buildSkillGuard(skills) : ''), [useContext, skills])

  /** Правки, которые можно применить: у «ask» применять нечего, это вопрос. */
  const actionable = useMemo(() => (plan?.edits ?? []).filter((e) => e.kind !== 'ask'), [plan])
  const questions = useMemo(() => (plan?.edits ?? []).filter((e) => e.kind === 'ask'), [plan])
  const approvedCount = actionable.filter((e) => approved[e.id]).length

  function pickVacancy(id) {
    setVacancyId(id)
    if (!id) return
    const vacancy = vacancies.find((v) => v.id === id)
    if (!vacancy?.raw_text) return
    patch({ vacancyText: vacancy.raw_text, plan: null, result: null, approved: {}, overrides: {} })
    toast(t('cv.vacancyFilled', { title: vacancy.title }), 'success')
  }

  function takeFromCheckTab() {
    const source = cvFromCheckTab()
    if (!source) {
      toast(t('adopt.noCvInCheck'), 'info')
      return
    }
    patch({ ...source, plan: null, result: null, approved: {}, overrides: {} })
    toast(t('adopt.tookFromCheck'), 'success')
  }

  async function handleFile(file) {
    if (!file) return
    setReading(true)
    try {
      const { text, pages, truncated } = await readDocumentFile(file)
      patch({ text, fileName: file.name, pages, plan: null, result: null, approved: {}, overrides: {} })
      if (truncated) toast(t('cv.truncated'), 'info')
      else toast(t('cv.loaded', { name: file.name }), 'success')
    } catch (e) {
      toast(e.message, 'error')
    } finally {
      setReading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  /** Шаг 1: предложить правки. Резюме не меняется — только список. */
  async function handlePropose() {
    if (chars < MIN_CHARS) {
      toast(t('cv.tooShort', { n: MIN_CHARS }), 'error')
      return
    }
    if (vacancyChars < MIN_VACANCY_CHARS) {
      toast(t('cv.vacancyTooShort', { n: MIN_VACANCY_CHARS }), 'error')
      return
    }

    const controller = new AbortController()
    abortRef.current = controller
    setStage('propose')
    setProgress(0)
    setView('edits')
    patch({ plan: null, result: null, approved: {}, overrides: {} })

    let received = 0
    try {
      const proposal = await proposeCvEdits(
        {
          apiKey: settings.apiKey,
          model: settings.reviewModel || settings.model,
          cvText: store.text,
          vacancyText: store.vacancyText,
          lang: store.lang,
          context,
          notes: store.notes,
          signal: controller.signal,
        },
        (delta) => {
          received += delta.length
          setProgress(received)
        },
      )
      if (!proposal.edits.length) {
        toast(t('cv.nothingBack'), 'error')
        return
      }
      // по умолчанию отмечено то, что решает скрининг: остальное человек
      // добирает сам, а не снимает галочки с шестнадцати пунктов
      const preset = {}
      for (const edit of proposal.edits) {
        if (edit.kind !== 'ask' && edit.severity === 'high') preset[edit.id] = true
      }
      patch({ plan: proposal, approved: preset, overrides: {} })
    } catch (e) {
      if (e.name !== 'AbortError') toast(e.message, 'error')
    } finally {
      setStage('')
      abortRef.current = null
    }
  }

  /** Шаг 2: собрать резюме из одобренных правок. */
  async function handleGenerate() {
    const chosen = actionable
      .filter((e) => approved[e.id])
      .map((e) => ({ ...e, after: overrides[e.id] ?? e.after }))

    if (!chosen.length) {
      toast(t('adopt.pickAtLeastOne'), 'error')
      return
    }

    const controller = new AbortController()
    abortRef.current = controller
    setStage('build')
    setProgress(0)

    let received = 0
    try {
      const built = await tailorCv(
        {
          apiKey: settings.apiKey,
          model: settings.reviewModel || settings.model,
          cvText: store.text,
          vacancyText: store.vacancyText,
          edits: chosen,
          lang: store.lang,
          cvLanguage: plan.cvLanguage,
          context,
          signal: controller.signal,
        },
        (delta) => {
          received += delta.length
          setProgress(received)
        },
      )
      if (!built.doc.sections.length) {
        toast(t('cv.nothingBack'), 'error')
        return
      }
      patch({ result: { ...built, editIds: chosen.map((e) => e.id) } })
      setView('cv')
    } catch (e) {
      if (e.name !== 'AbortError') toast(e.message, 'error')
    } finally {
      setStage('')
      abortRef.current = null
    }
  }

  async function handleDownload() {
    try {
      const target = plan?.vacancy?.company || plan?.vacancy?.title || ''
      const blob = await buildCvDocx(result.doc, { title: `CV — ${target || result.doc.name}` })
      const name = suggestFileName(result.doc, target)
      downloadBlob(blob, name)
      toast(t('adopt.downloaded', { name }), 'success')
    } catch (e) {
      toast(t('adopt.docxFailed', { error: e.message }), 'error')
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

  const toggleAll = (value) =>
    patch({ approved: value ? Object.fromEntries(actionable.map((e) => [e.id, true])) : {} })

  return (
    <>
      <PageHead
        title={t('adopt.title')}
        accent={t('adopt.titleAccent')}
        aside={
          result && (
            <Segmented
              options={[
                { id: 'edits', label: t('adopt.tabEdits') },
                { id: 'cv', label: t('adopt.tabCv') },
              ]}
              value={view}
              onChange={setView}
              accent
            />
          )
        }
      >
        {t('adopt.lead')}
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
              accept=".docx,.pdf,.txt,.md,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
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
                <span className="filedrop-title">{store.fileName || t('adopt.drop')}</span>
                <span className="filedrop-hint">
                  {store.fileName
                    ? store.pages
                      ? t('cv.fileMeta', { pages: store.pages, chars: formatNumber(chars) })
                      : t('cv.fileMetaNoPages', { chars: formatNumber(chars) })
                    : t('adopt.dropHint')}
                </span>
              </>
            )}
          </label>

          <div className="field" style={{ marginTop: 14 }}>
            <div className="row wrap" style={{ gap: 8, marginBottom: 7 }}>
              <span className="field-label" style={{ marginBottom: 0 }}>
                {t('cv.yourCv')}
                <span className="mono" style={{ marginLeft: 8, textTransform: 'none' }}>
                  {chars ? t('import.chars', { n: formatNumber(chars) }) : t('import.empty')}
                </span>
              </span>
              <span className="spacer" />
              <button className="btn btn-ghost btn-sm" onClick={takeFromCheckTab}>
                <Icon name="doc" size={12} /> {t('adopt.takeFromCheck')}
              </button>
            </div>
            <textarea
              className="textarea"
              style={{ minHeight: 200 }}
              aria-label={t('cv.yourCv')}
              placeholder={t('adopt.cvPlaceholder')}
              value={store.text}
              onChange={(e) => patch({ text: e.target.value })}
              spellCheck={false}
            />
          </div>

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
            <p className="report-note" style={{ marginTop: 8, marginBottom: 8 }}>
              {t('adopt.vacancyHint')}
            </p>
            <textarea
              className="textarea"
              style={{ minHeight: 170 }}
              aria-label={t('cv.vacancyText')}
              placeholder={t('cv.vacancyPlaceholder')}
              value={store.vacancyText}
              onChange={(e) => patch({ vacancyText: e.target.value })}
              spellCheck={false}
            />
          </div>

          <div className="field" style={{ marginTop: 14 }}>
            <span className="field-label">{t('adopt.notes')}</span>
            <textarea
              className="textarea"
              style={{ minHeight: 70 }}
              placeholder={t('adopt.notesPlaceholder')}
              value={store.notes}
              onChange={(e) => patch({ notes: e.target.value })}
            />
            <p className="report-note" style={{ marginTop: 6 }}>{t('adopt.notesHint')}</p>
          </div>

          <div style={{ marginTop: 14 }}>
            <span className="field-label" style={{ marginBottom: 6 }}>{t('cv.answerLang')}</span>
            <Segmented options={langOptions} value={store.lang} onChange={(id) => patch({ lang: id })} />
            <p className="report-note" style={{ marginTop: 6 }}>{t('adopt.langHint')}</p>
          </div>

          <div className="panel" style={{ marginTop: 14, padding: 16 }}>
            <label className="check ink">
              <input type="checkbox" checked={useContext} onChange={(e) => setUseContext(e.target.checked)} />
              <span>{t('adopt.useGuard')}</span>
            </label>
            <p className="report-note" style={{ marginTop: 6 }}>
              {t('adopt.useGuardHint', { skills: skills.length })}
            </p>
          </div>

          <div className="row wrap" style={{ marginTop: 16 }}>
            {busy ? (
              <button className="btn" onClick={() => abortRef.current?.abort()}>
                <Icon name="close" size={13} /> {t('chat.stop')}
              </button>
            ) : (
              <button
                className="btn btn-accent"
                onClick={handlePropose}
                disabled={reading || chars < MIN_CHARS || vacancyChars < MIN_VACANCY_CHARS}
              >
                <Icon name="spark" /> {plan ? t('adopt.analyzeAgain') : t('adopt.analyze')}
              </button>
            )}
            {(store.text || plan) && !busy && (
              <button
                className="btn btn-ghost"
                onClick={() => setStore({ ...emptyStore(uiLang), lang: store.lang })}
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
                {progress
                  ? t(stage === 'build' ? 'adopt.building' : 'adopt.proposing', { n: formatNumber(progress) })
                  : t('cv.thinking')}
              </div>
              {[0, 1, 2].map((i) => (
                <div key={i} className="skeleton" style={{ height: 62, animationDelay: `${i * 0.12}s` }} />
              ))}
            </div>
          )}

          {!busy && !plan && (
            <div style={{ textAlign: 'center', padding: '30px 6px' }}>
              <div className="serif" style={{ fontSize: 26, marginBottom: 8 }}>{t('adopt.resultTitle')}</div>
              <p className="muted" style={{ fontSize: 13.5 }}>{t('adopt.resultLead')}</p>
            </div>
          )}

          {/* --------------------------------------------- список правок */}
          {!busy && plan && view === 'edits' && (
            <>
              <div className="row wrap" style={{ alignItems: 'flex-start', gap: 16 }}>
                {Number.isFinite(plan.fit) && (
                  <div className="cv-score" data-band={plan.fit >= 80 ? 'good' : plan.fit >= 55 ? 'mid' : 'low'}>
                    <span className="cv-score-value">{plan.fit}</span>
                    <span className="cv-score-label">
                      {t('adopt.fit')}
                      <Hint text={t('adopt.fitHint')} />
                    </span>
                  </div>
                )}
                <div style={{ flex: 1, minWidth: 180 }}>
                  <p style={{ fontSize: 14, lineHeight: 1.55 }}>{plan.summary}</p>
                  <div className="row wrap" style={{ gap: 5, marginTop: 10 }}>
                    {plan.vacancy.title && <span className="tag">{plan.vacancy.title}</span>}
                    {plan.vacancy.company && <span className="tag">{plan.vacancy.company}</span>}
                    <span className="tag">{t('adopt.editsCount', { n: actionable.length })}</span>
                  </div>
                </div>
              </div>

              {plan.keywordsToUse.length > 0 && (
                <div className="cv-block">
                  <div className="report-h">{t('adopt.keywordsUse')}</div>
                  <p className="report-note" style={{ marginTop: 6 }}>{t('adopt.keywordsUseHint')}</p>
                  <div className="row wrap" style={{ gap: 5, marginTop: 8 }}>
                    {plan.keywordsToUse.map((k) => (
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
                </div>
              )}

              {plan.keywordsToAvoid.length > 0 && (
                <div className="cv-block">
                  <div className="report-h">{t('adopt.keywordsAvoid')}</div>
                  <p className="report-note" style={{ marginTop: 6 }}>{t('adopt.keywordsAvoidHint')}</p>
                  <ul className="cv-list cv-list-warn">
                    {plan.keywordsToAvoid.map((k) => (
                      <li key={k.term}>
                        <b>{k.term}</b>
                        {k.why ? ` — ${k.why}` : ''}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="cv-block">
                <div className="row wrap" style={{ gap: 8 }}>
                  <div className="report-h" style={{ marginBottom: 0 }}>{t('adopt.editsTitle')}</div>
                  <span className="spacer" />
                  <span className="mono">{t('adopt.approvedOf', { n: approvedCount, total: actionable.length })}</span>
                  <button className="btn btn-ghost btn-sm" onClick={() => toggleAll(true)}>{t('common.all')}</button>
                  <button className="btn btn-ghost btn-sm" onClick={() => toggleAll(false)}>{t('common.none')}</button>
                </div>
                <p className="report-note" style={{ marginTop: 6 }}>{t('adopt.editsHint')}</p>

                <div className="cv-findings" style={{ marginTop: 12 }}>
                  {actionable.map((edit, idx) => {
                    const on = !!approved[edit.id]
                    const after = overrides[edit.id] ?? edit.after
                    return (
                      <article
                        key={edit.id}
                        className="edit"
                        data-severity={edit.severity}
                        data-on={on}
                        style={{ animationDelay: `${Math.min(idx, 10) * 0.03}s` }}
                      >
                        <header className="row wrap" style={{ gap: 8 }}>
                          <label className="check ink" style={{ flex: 1, alignItems: 'flex-start' }}>
                            <input
                              type="checkbox"
                              checked={on}
                              onChange={(e) => patch({ approved: { ...approved, [edit.id]: e.target.checked } })}
                            />
                            <span className="finding-item">
                              <span className="finding-num mono" style={{ marginRight: 6 }}>{idx + 1}</span>
                              {edit.title || edit.section || '—'}
                            </span>
                          </label>
                          <span className={`tag tag-sev-${edit.severity}`}>{t(`cv.severity.${edit.severity}`)}</span>
                        </header>

                        <div className="row wrap" style={{ gap: 5, marginTop: 8 }}>
                          <span className="tag">{t(`adopt.kinds.${edit.kind}`)}</span>
                          {edit.section && <span className="tag">{edit.section}</span>}
                          {edit.needsInput && <span className="tag tag-warn">{t('adopt.needsInput')}</span>}
                        </div>

                        {edit.why && <p className="finding-problem">{edit.why}</p>}

                        {edit.before && (
                          <div className="finding-quote">
                            <span className="finding-label mono">{t('cv.before')}</span>
                            <span>{edit.before}</span>
                          </div>
                        )}

                        {edit.after !== null && (
                          <div className="finding-after">
                            <div className="row" style={{ marginBottom: 4 }}>
                              <span className="finding-label mono">{t('cv.after')}</span>
                              <span className="spacer" />
                              {overrides[edit.id] !== undefined && (
                                <button
                                  className="btn btn-ghost btn-sm"
                                  onClick={() => {
                                    const next = { ...overrides }
                                    delete next[edit.id]
                                    patch({ overrides: next })
                                  }}
                                >
                                  <Icon name="refresh" size={12} /> {t('common.reset')}
                                </button>
                              )}
                            </div>
                            <AutoTextarea
                              aria-label={t('cv.after')}
                              value={after ?? ''}
                              onChange={(e) => patch({ overrides: { ...overrides, [edit.id]: e.target.value } })}
                              spellCheck={false}
                            />
                          </div>
                        )}

                        {edit.evidence && (
                          <p className="finding-fix">
                            <span className="finding-label mono">{t('adopt.evidence')}</span> «{edit.evidence}»
                          </p>
                        )}
                      </article>
                    )
                  })}
                </div>
              </div>

              {questions.length > 0 && (
                <div className="cv-block">
                  <div className="report-h">{t('adopt.questionsTitle')}</div>
                  <p className="report-note" style={{ marginTop: 6 }}>{t('adopt.questionsHint')}</p>
                  <ul className="cv-list cv-list-steps">
                    {questions.map((q) => (
                      <li key={q.id}>
                        <b>{q.title}</b>
                        {q.why ? ` — ${q.why}` : ''}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="row wrap" style={{ marginTop: 18, paddingTop: 16, borderTop: '1px solid var(--line)' }}>
                <button className="btn btn-accent" onClick={handleGenerate} disabled={!approvedCount}>
                  <Icon name="spark" /> {t('adopt.generate', { n: approvedCount })}
                </button>
                {result && (
                  <button className="btn btn-ghost" onClick={() => setView('cv')}>
                    {t('adopt.backToCv')}
                  </button>
                )}
              </div>
            </>
          )}

          {/* ------------------------------------------ готовое резюме */}
          {!busy && result && view === 'cv' && (
            <>
              <div className="row wrap" style={{ gap: 8 }}>
                <div className="report-h" style={{ marginBottom: 0 }}>{t('adopt.readyTitle')}</div>
                <span className="spacer" />
                <span className="mono">
                  {t('adopt.appliedCount', { n: result.applied.length || result.editIds.length })}
                </span>
              </div>

              <div className="row wrap" style={{ gap: 8, marginTop: 12 }}>
                <button className="btn btn-accent" onClick={handleDownload}>
                  <Icon name="doc" size={13} /> {t('adopt.download')}
                </button>
                <button
                  className="btn btn-ghost"
                  onClick={() => copy(cvToMarkdown(result.doc), 'md')}
                >
                  <Icon name={copied === 'md' ? 'check' : 'doc'} size={13} />
                  {copied === 'md' ? t('cv.copied') : t('adopt.copyMarkdown')}
                </button>
                <button className="btn btn-ghost" onClick={() => setView('edits')}>
                  <Icon name="layers" size={13} /> {t('adopt.backToEdits')}
                </button>
                <button className="btn btn-ghost" onClick={handleGenerate}>
                  <Icon name="refresh" size={13} /> {t('adopt.rebuild')}
                </button>
              </div>

              {result.placeholders.length > 0 && (
                <div className="cv-block">
                  <div className="report-h">{t('adopt.placeholders')}</div>
                  <p className="report-note" style={{ marginTop: 6 }}>{t('adopt.placeholdersHint')}</p>
                  <ul className="cv-list cv-list-warn">
                    {result.placeholders.map((p, i) => (
                      <li key={i}>{p}</li>
                    ))}
                  </ul>
                </div>
              )}

              {result.skipped.length > 0 && (
                <div className="cv-block">
                  <div className="report-h">{t('adopt.skipped')}</div>
                  <ul className="cv-list cv-list-warn">
                    {result.skipped.map((s, i) => (
                      <li key={i}>
                        <b>#{s.num}</b>
                        {s.why ? ` — ${s.why}` : ''}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {result.notes.length > 0 && (
                <div className="cv-block">
                  <div className="report-h">{t('adopt.notesOut')}</div>
                  <ul className="cv-list cv-list-steps">
                    {result.notes.map((n, i) => (
                      <li key={i}>{n}</li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="cv-block">
                <div className="report-h">{t('adopt.preview')}</div>
                <p className="report-note" style={{ marginTop: 6, marginBottom: 10 }}>{t('adopt.previewHint')}</p>
                <DocPreview doc={result.doc} />
              </div>
            </>
          )}
        </div>
      </div>

      {!skills.length && (
        <div style={{ marginTop: 22 }}>
          <Empty title={t('cv.noDataTitle')}>{t('adopt.noDataText')}</Empty>
        </div>
      )}
    </>
  )
}
