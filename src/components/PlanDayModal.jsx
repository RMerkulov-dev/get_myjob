import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { createLinkedinPost, deleteLinkedinPost, deletePlanDay, savePlanDay, updateLinkedinPost } from '../lib/db'
import {
  PLAN_METRICS,
  POST_STATUSES,
  clampCount,
  emptyDay,
  factKey,
  fromISODate,
  isDayEmpty,
  planKey,
} from '../lib/planner'
import { useI18n } from '../i18n'
import { Hint, Icon, Spinner } from './ui'

let tempSeq = 0

/** Счётчик с шагами: цифры набираются руками, но в один клик тоже быстро. */
function Counter({ value, onChange, ariaLabel }) {
  return (
    <div className="counter">
      <button type="button" onClick={() => onChange(clampCount(value - 1))} aria-label="−" tabIndex={-1}>
        −
      </button>
      <input
        className="counter-input mono"
        type="number"
        min="0"
        max="999"
        value={value}
        aria-label={ariaLabel}
        onFocus={(e) => e.target.select()}
        onChange={(e) => onChange(e.target.value === '' ? 0 : clampCount(e.target.value))}
      />
      <button type="button" onClick={() => onChange(clampCount(value + 1))} aria-label="+" tabIndex={-1}>
        +
      </button>
    </div>
  )
}

/**
 * Редактор одного дня: план и факт по пяти метрикам, заметка и карточки постов.
 * Правки живут в локальном черновике — «Сохранить» пишет всё одним заходом,
 * поэтому случайный клик мимо ничего не портит.
 */
export default function PlanDayModal({ iso, row, posts, onClose, onSaved, toast }) {
  const { t, locale } = useI18n()
  const [draft, setDraft] = useState(() => ({ ...emptyDay(iso), ...(row ?? {}), note: row?.note ?? '' }))
  const [postDrafts, setPostDrafts] = useState(() => posts.map((p) => ({ ...p })))
  const [removed, setRemoved] = useState([])
  const [saving, setSaving] = useState(false)

  // fromISODate, а не new Date(iso): строку 'YYYY-MM-DD' браузер читает как UTC
  // и в западных часовых поясах показал бы предыдущий день.
  const dateLabel = useMemo(
    () =>
      fromISODate(iso).toLocaleDateString(locale, {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      }),
    [iso, locale],
  )

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const setField = (key, value) => setDraft((prev) => ({ ...prev, [key]: value }))

  const patchPost = (id, patch) =>
    setPostDrafts((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)))

  function addPost() {
    const id = `new-${++tempSeq}`
    setPostDrafts((prev) => [...prev, { id, day: iso, title: '', topic: '', status: 'idea', url: '', notes: '', isNew: true }])
  }

  function dropPost(post) {
    setPostDrafts((prev) => prev.filter((p) => p.id !== post.id))
    if (!post.isNew) setRemoved((prev) => [...prev, post.id])
  }

  async function save() {
    setSaving(true)
    try {
      // Пустой день в базе не держим: был — удаляем, не было — не создаём.
      if (isDayEmpty(draft)) {
        if (row?.id) await deletePlanDay(row.id)
      } else {
        const patch = { note: draft.note?.trim() || null }
        for (const m of PLAN_METRICS) {
          patch[planKey(m)] = clampCount(draft[planKey(m)])
          patch[factKey(m)] = clampCount(draft[factKey(m)])
        }
        await savePlanDay(iso, patch)
      }

      const before = new Map(posts.map((p) => [p.id, p]))
      const jobs = []

      for (const p of postDrafts) {
        const payload = {
          day: iso,
          title: p.title?.trim() || '',
          topic: p.topic?.trim() || null,
          status: p.status,
          url: p.url?.trim() || null,
          notes: p.notes?.trim() || null,
        }
        if (p.isNew) {
          // Совсем пустую карточку сохранять нечего
          if (!payload.title && !payload.topic && !payload.notes && !payload.url) continue
          jobs.push(createLinkedinPost(payload))
          continue
        }
        const prev = before.get(p.id)
        const changed =
          prev &&
          (prev.title !== payload.title ||
            (prev.topic ?? null) !== payload.topic ||
            prev.status !== payload.status ||
            (prev.url ?? null) !== payload.url ||
            (prev.notes ?? null) !== payload.notes)
        if (changed) jobs.push(updateLinkedinPost(p.id, payload))
      }

      for (const id of removed) jobs.push(deleteLinkedinPost(id))
      await Promise.all(jobs)

      await onSaved()
      toast(isDayEmpty(draft) && !postDrafts.length ? t('planner.dayCleared') : t('planner.daySaved', { date: dateLabel }), 'success')
      onClose()
    } catch (e) {
      toast(e.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  return createPortal(
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={dateLabel}>
        <div className="modal-head">
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2 className="modal-title" style={{ textTransform: 'capitalize' }}>{dateLabel}</h2>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label={t('common.cancel')}>
            <Icon name="close" size={13} />
          </button>
        </div>

        <div className="modal-body">
          <div className="plan-form">
            <div className="plan-form-head mono">
              <span />
              <span>{t('planner.plan')}</span>
              <span>{t('planner.fact')}</span>
            </div>
            {PLAN_METRICS.map((m) => (
              <div className="plan-form-row" key={m} data-tone={m}>
                <div className="row" style={{ gap: 6, minWidth: 0 }}>
                  <span className="plan-form-label">{t(`planner.metrics.${m}`)}</span>
                  <Hint text={t(`planner.metricsHint.${m}`)} />
                </div>
                <Counter
                  value={draft[planKey(m)] ?? 0}
                  onChange={(v) => setField(planKey(m), v)}
                  ariaLabel={`${t(`planner.metrics.${m}`)} — ${t('planner.plan')}`}
                />
                <Counter
                  value={draft[factKey(m)] ?? 0}
                  onChange={(v) => setField(factKey(m), v)}
                  ariaLabel={`${t(`planner.metrics.${m}`)} — ${t('planner.fact')}`}
                />
              </div>
            ))}
          </div>

          <label className="field" style={{ marginTop: 22 }}>
            <span className="field-label">{t('planner.noteLabel')}</span>
            <textarea
              className="textarea textarea-sm"
              rows={2}
              placeholder={t('planner.notePlaceholder')}
              value={draft.note ?? ''}
              onChange={(e) => setField('note', e.target.value)}
            />
          </label>

          <div className="group-head" style={{ marginTop: 26 }}>
            <h3 className="group-title">{t('planner.postsSection')}</h3>
            <span className="group-rule" />
            <button className="btn btn-sm btn-ghost" onClick={addPost}>
              <Icon name="plus" size={12} /> {t('planner.addPost')}
            </button>
          </div>
          <p className="page-sub" style={{ margin: '0 0 14px' }}>{t('planner.postsLead')}</p>

          {postDrafts.map((p) => (
            <div className="post-card" key={p.id} data-status={p.status}>
              <div className="row" style={{ gap: 8 }}>
                <input
                  className="input"
                  placeholder={t('planner.postTitlePlaceholder')}
                  aria-label={t('planner.postTitle')}
                  value={p.title ?? ''}
                  onChange={(e) => patchPost(p.id, { title: e.target.value })}
                />
                <button
                  className="btn btn-sm btn-ghost btn-danger"
                  onClick={() => dropPost(p)}
                  title={t('planner.removePost')}
                  aria-label={t('planner.removePost')}
                >
                  <Icon name="trash" size={13} />
                </button>
              </div>

              <div className="post-card-grid">
                <label className="field">
                  <span className="field-label">{t('planner.statusLabel')}</span>
                  <select
                    className="select"
                    value={p.status}
                    onChange={(e) => patchPost(p.id, { status: e.target.value })}
                  >
                    {POST_STATUSES.map((s) => (
                      <option key={s} value={s}>{t(`planner.status.${s}`)}</option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span className="field-label">{t('planner.postTopic')}</span>
                  <input
                    className="input"
                    placeholder={t('planner.postTopicPlaceholder')}
                    value={p.topic ?? ''}
                    onChange={(e) => patchPost(p.id, { topic: e.target.value })}
                  />
                </label>
                <label className="field">
                  <span className="field-label">{t('planner.postUrl')}</span>
                  <input
                    className="input input-mono"
                    type="url"
                    placeholder="https://www.linkedin.com/posts/…"
                    value={p.url ?? ''}
                    onChange={(e) => patchPost(p.id, { url: e.target.value })}
                  />
                </label>
              </div>

              <label className="field" style={{ marginTop: 10 }}>
                <span className="field-label">{t('planner.postNotes')}</span>
                <textarea
                  className="textarea textarea-sm"
                  rows={2}
                  value={p.notes ?? ''}
                  onChange={(e) => patchPost(p.id, { notes: e.target.value })}
                />
              </label>
            </div>
          ))}

          <div className="row" style={{ gap: 10, marginTop: 24 }}>
            <button className="btn btn-accent" onClick={save} disabled={saving}>
              {saving ? <Spinner /> : <Icon name="check" size={13} />} {t('common.save')}
            </button>
            <button className="btn btn-ghost" onClick={onClose} disabled={saving}>
              {t('common.cancel')}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}
