import { useState } from 'react'
import { deleteVacancy } from '../lib/db'
import { useI18n } from '../i18n'
import { Empty, Icon, PageHead } from './ui'

export default function VacanciesView({ vacancies, onSaved, toast, goToImport }) {
  const { t, formatDate } = useI18n()
  const [openId, setOpenId] = useState(null)

  async function handleDelete(v) {
    if (!confirm(t('vacancies.deleteConfirm', { title: v.title }))) return
    try {
      await deleteVacancy(v.id)
      await onSaved()
      toast(t('vacancies.deleted'), 'success')
    } catch (e) {
      toast(e.message, 'error')
    }
  }

  if (!vacancies.length) {
    return (
      <>
        <PageHead title={t('vacancies.title')} accent={t('vacancies.titleAccent')} />
        <Empty
          title={t('vacancies.emptyTitle')}
          action={
            <button className="btn btn-accent" onClick={goToImport}>
              <Icon name="plus" /> {t('vacancies.emptyCta')}
            </button>
          }
        >
          {t('vacancies.emptyText')}
        </Empty>
      </>
    )
  }

  return (
    <>
      <PageHead
        title={t('vacancies.title')}
        accent={t('vacancies.titleAccent')}
        aside={<span className="mono">{t('vacancies.count', { n: vacancies.length })}</span>}
      >
        {t('vacancies.lead')}
      </PageHead>

      {vacancies.map((v, idx) => {
        const links = v.vacancy_skills ?? []
        const learned = links.filter((l) => l.skills?.learned).length
        const open = openId === v.id

        return (
          <article className="vac" key={v.id} style={{ animationDelay: `${Math.min(idx, 10) * 0.03}s` }}>
            <div className="row wrap" style={{ alignItems: 'flex-start', gap: 14 }}>
              <div style={{ flex: 1, minWidth: 240 }}>
                <h2 className="vac-title">{v.title}</h2>
                <div className="row wrap" style={{ gap: 6, marginTop: 8 }}>
                  <span className="tag tag-new">{v.position_type}</span>
                  {v.company && <span className="tag">{v.company}</span>}
                  {v.seniority && <span className="tag">{v.seniority}</span>}
                  {v.location && <span className="tag">{v.location}</span>}
                  {v.salary && <span className="tag tag-warn">{v.salary}</span>}
                  <span className="mono" style={{ marginLeft: 4 }}>{formatDate(v.created_at)}</span>
                </div>
              </div>
              <div className="row" style={{ gap: 4 }}>
                <button className="btn btn-sm btn-ghost" onClick={() => setOpenId(open ? null : v.id)}>
                  {open ? t('vacancies.hideRaw') : t('vacancies.showRaw')}
                </button>
                <button
                  className="btn btn-sm btn-ghost btn-danger"
                  onClick={() => handleDelete(v)}
                  title={t('common.delete')}
                >
                  <Icon name="trash" size={13} />
                </button>
              </div>
            </div>

            {v.summary && (
              <p style={{ marginTop: 12, fontSize: 13.5, color: 'var(--ink-2)', maxWidth: '78ch' }}>{v.summary}</p>
            )}

            <div className="row" style={{ marginTop: 14, gap: 10 }}>
              <span className="mono">{t('vacancies.progress', { total: links.length, closed: learned })}</span>
              <div className="progress-track" style={{ flex: 1, maxWidth: 220 }}>
                <div
                  className="progress-fill green"
                  style={{ width: `${links.length ? (learned / links.length) * 100 : 0}%` }}
                />
              </div>
            </div>

            <div className="vac-chips">
              {[...links]
                .sort((a, b) => (a.importance === b.importance ? 0 : a.importance === 'must' ? -1 : 1))
                .map((l) => (
                  <span key={l.skill_id} className="chip" data-learned={Boolean(l.skills?.learned)} title={l.context ?? ''}>
                    {l.skills?.name ?? '—'}
                    <b>{l.importance === 'must' ? t('common.must').toUpperCase() : `${l.skills?.level ?? 0}/5`}</b>
                  </span>
                ))}
            </div>

            {open && <pre className="raw-text">{v.raw_text}</pre>}
          </article>
        )
      })}
    </>
  )
}
