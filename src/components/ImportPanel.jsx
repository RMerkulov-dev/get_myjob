import { useMemo, useState } from 'react'
import { CATEGORY_IDS, POSITIONS } from '../lib/constants'
import { parseVacancy } from '../lib/openrouter'
import { reconcileRequirements, saveParsedVacancy } from '../lib/db'
import { useI18n } from '../i18n'
import { Icon, LevelPicker, PageHead, Segmented, Spinner } from './ui'

export default function ImportPanel({ skills, settings, onSaved, toast, goToSkills }) {
  const { t, lang, formatNumber } = useI18n()
  const [text, setText] = useState('')
  const [positionType, setPositionType] = useState('PM')
  const [parsing, setParsing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [result, setResult] = useState(null) // { vacancy, items }

  const existingNames = useMemo(() => skills.map((s) => s.name), [skills])
  const positionOptions = useMemo(
    () => POSITIONS.map((id) => ({ id, label: id === 'PM/BA' ? 'PM / BA' : id, full: t(`positions.${id}`) })),
    [t],
  )

  const stats = useMemo(() => {
    if (!result) return null
    const chosen = result.items.filter((i) => i.include)
    return {
      fresh: result.items.filter((i) => i.status === 'new').length,
      known: result.items.filter((i) => i.status === 'existing').length,
      chosenNew: chosen.filter((i) => i.status === 'new').length,
      chosen: chosen.length,
    }
  }, [result])

  async function handleParse() {
    if (text.trim().length < 40) {
      toast(t('import.tooShort'), 'error')
      return
    }
    setParsing(true)
    setResult(null)
    try {
      const parsed = await parseVacancy({
        apiKey: settings.apiKey,
        model: settings.model,
        text,
        positionType,
        existingNames,
        lang,
      })
      const items = reconcileRequirements(parsed.requirements, skills)
      if (!items.length) toast(t('import.nothingFound'), 'error')
      setResult({ vacancy: parsed.vacancy, items })
    } catch (e) {
      toast(e.message, 'error')
    } finally {
      setParsing(false)
    }
  }

  function patchItem(slug, patch) {
    setResult((r) => ({ ...r, items: r.items.map((i) => (i.slug === slug ? { ...i, ...patch } : i)) }))
  }

  function setAllNew(include) {
    setResult((r) => ({ ...r, items: r.items.map((i) => (i.status === 'new' ? { ...i, include } : i)) }))
  }

  async function handleSave() {
    setSaving(true)
    try {
      const res = await saveParsedVacancy({
        rawText: text,
        positionType,
        vacancy: result.vacancy,
        items: result.items,
        existingSkills: skills,
      })
      toast(
        t('import.saved', { count: res.created, created: res.created }) +
          (res.updated ? t('import.savedUpdated', { updated: res.updated }) : ''),
        'success',
      )
      setResult(null)
      setText('')
      await onSaved()
      goToSkills()
    } catch (e) {
      toast(e.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <PageHead title={t('import.title')} accent={t('import.titleAccent')}>
        {t('import.lead')}
      </PageHead>

      <div className="import-layout">
        {/* ------------------------------------------------ левая колонка */}
        <div>
          <div className="row wrap" style={{ marginBottom: 12, justifyContent: 'space-between' }}>
            <div>
              <span className="field-label" style={{ marginBottom: 6 }}>{t('import.position')}</span>
              <Segmented options={positionOptions} value={positionType} onChange={setPositionType} accent />
            </div>
            <span className="mono" style={{ alignSelf: 'flex-end' }}>
              {text.trim() ? t('import.chars', { n: formatNumber(text.trim().length) }) : t('import.empty')}
            </span>
          </div>

          <label className="field dropzone">
            <span className="field-label">{t('import.text')}</span>
            <textarea
              className="textarea textarea-lg"
              placeholder={t('import.placeholder')}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onPaste={() => setResult(null)}
              spellCheck={false}
            />
          </label>

          <div className="row wrap" style={{ marginTop: 14 }}>
            <button className="btn btn-accent" onClick={handleParse} disabled={parsing || saving}>
              {parsing ? <Spinner /> : <Icon name="spark" />}
              {parsing ? t('import.parsing') : t('import.parse')}
            </button>
            {text && (
              <button className="btn btn-ghost" onClick={() => { setText(''); setResult(null) }} disabled={parsing}>
                {t('common.clear')}
              </button>
            )}
            <span className="spacer" />
            <span className="mono">
              {t('common.model')}: {settings.model.split('/').pop()}
            </span>
          </div>
        </div>

        {/* ------------------------------------------------ правая колонка */}
        <div className="panel card-pad-lg" style={{ position: 'sticky', top: 92 }}>
          {!result && !parsing && (
            <div style={{ textAlign: 'center', padding: '30px 6px' }}>
              <div className="serif" style={{ fontSize: 26, marginBottom: 8 }}>{t('import.resultTitle')}</div>
              <p className="muted" style={{ fontSize: 13.5 }}>{t('import.resultLead')}</p>
            </div>
          )}

          {parsing && (
            <div style={{ display: 'grid', gap: 9 }}>
              <div className="mono" style={{ marginBottom: 4 }}>{t('import.reading')}</div>
              {[0, 1, 2].map((i) => (
                <div key={i} className="skeleton" style={{ height: 54, animationDelay: `${i * 0.12}s` }} />
              ))}
            </div>
          )}

          {result && (
            <>
              <div style={{ marginBottom: 16 }}>
                <label className="field" style={{ marginBottom: 10 }}>
                  <span className="field-label">{t('import.vacancy')}</span>
                  <input
                    className="input"
                    value={result.vacancy.title}
                    onChange={(e) => setResult((r) => ({ ...r, vacancy: { ...r.vacancy, title: e.target.value } }))}
                  />
                </label>
                <label className="field">
                  <span className="field-label">{t('import.company')}</span>
                  <input
                    className="input"
                    placeholder="—"
                    value={result.vacancy.company ?? ''}
                    onChange={(e) => setResult((r) => ({ ...r, vacancy: { ...r.vacancy, company: e.target.value } }))}
                  />
                </label>
                {result.vacancy.summary && (
                  <p style={{ marginTop: 12, fontSize: 13, color: 'var(--ink-2)' }}>{result.vacancy.summary}</p>
                )}
                <div className="row wrap" style={{ gap: 5, marginTop: 12 }}>
                  <span className="tag">{positionType}</span>
                  {result.vacancy.seniority && <span className="tag">{result.vacancy.seniority}</span>}
                  {result.vacancy.location && <span className="tag">{result.vacancy.location}</span>}
                  {result.vacancy.salary && <span className="tag tag-warn">{result.vacancy.salary}</span>}
                </div>
              </div>

              <div className="row" style={{ marginBottom: 10, paddingTop: 14, borderTop: '1px solid var(--line)' }}>
                <span className="mono">{t('import.counts', { fresh: stats.fresh, known: stats.known })}</span>
                <span className="spacer" />
                {stats.fresh > 0 && (
                  <>
                    <button className="btn btn-ghost btn-sm" onClick={() => setAllNew(true)}>{t('common.all')}</button>
                    <button className="btn btn-ghost btn-sm" onClick={() => setAllNew(false)}>{t('common.none')}</button>
                  </>
                )}
              </div>

              <div className="review-list">
                {result.items.map((item, idx) => (
                  <div
                    key={item.slug}
                    className="review-item"
                    data-status={item.status}
                    data-off={!item.include}
                    style={{ animationDelay: `${Math.min(idx, 12) * 0.025}s` }}
                  >
                    <label className="check ink" style={{ marginTop: 2 }}>
                      <input
                        type="checkbox"
                        checked={item.include}
                        onChange={(e) => patchItem(item.slug, { include: e.target.checked })}
                      />
                    </label>

                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="row wrap" style={{ gap: 7 }}>
                        <span className="review-name">{item.name}</span>
                        {item.status === 'new' ? (
                          <span className="tag tag-new">{t('import.tagNew')}</span>
                        ) : (
                          <span className="tag">{t('import.tagExisting', { n: item.existing.mentions + 1 })}</span>
                        )}
                        {item.importance === 'must' && <span className="tag tag-must">{t('common.must')}</span>}
                      </div>

                      <div className="row wrap" style={{ gap: 7, marginTop: 7 }}>
                        {item.status === 'new' ? (
                          <>
                            <select
                              className="select"
                              style={{ width: 'auto', padding: '3px 7px', fontSize: 12 }}
                              value={item.category}
                              onChange={(e) => patchItem(item.slug, { category: e.target.value })}
                            >
                              {CATEGORY_IDS.map((id) => (
                                <option key={id} value={id}>{t(`categories.${id}`)}</option>
                              ))}
                            </select>
                            <LevelPicker
                              value={item.level}
                              onChange={(v) => patchItem(item.slug, { level: v })}
                              showLabel={false}
                            />
                          </>
                        ) : (
                          <span className="mono">
                            {t('import.yourLevel', {
                              category: t(`categories.${item.existing.category}`),
                              level: item.existing.level,
                            })}
                            {item.existing.learned ? t('import.alsoLearned') : ''}
                          </span>
                        )}
                      </div>

                      {item.context && <div className="review-ctx">«{item.context}»</div>}
                    </div>
                  </div>
                ))}
              </div>

              <div className="row wrap" style={{ marginTop: 18, paddingTop: 16, borderTop: '1px solid var(--line)' }}>
                <button className="btn btn-primary" onClick={handleSave} disabled={saving || stats.chosen === 0}>
                  {saving ? <Spinner /> : <Icon name="check" />}
                  {t('import.saveCount', { n: stats.chosenNew })}
                </button>
                <button className="btn btn-ghost" onClick={() => setResult(null)} disabled={saving}>
                  {t('common.cancel')}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  )
}
