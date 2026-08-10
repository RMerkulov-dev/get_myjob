import { useMemo } from 'react'
import { CATEGORY_IDS } from '../lib/constants'
import { useI18n } from '../i18n'
import { Empty, Icon, PageHead } from './ui'

/**
 * Отчёт по прогрессу.
 *
 * Все графики — одна серия на нейтральной дорожке: величину несёт длина полосы,
 * а не цвет. Идентичность подписана текстом рядом с каждой полосой, поэтому
 * категориальная палитра (и её проверка на цветовую слепоту) здесь не нужна.
 */
export default function ReportView({ skills, vacancies, goToImport }) {
  const { t, locale, formatDate } = useI18n()

  const data = useMemo(() => {
    const total = skills.length
    const learned = skills.filter((s) => s.learned).length
    const must = skills.filter((s) => s.importance === 'must')
    const mustLearned = must.filter((s) => s.learned).length
    const avg = total ? skills.reduce((a, s) => a + (s.level ?? 0), 0) / total : 0

    // распределение по уровням 0…5
    const levels = [0, 1, 2, 3, 4, 5].map((value) => ({
      value,
      count: skills.filter((s) => (s.level ?? 0) === value).length,
    }))

    // топ по частоте упоминаний в вакансиях
    const top = [...skills]
      .filter((s) => (s.mentions ?? 0) > 0)
      .sort((a, b) => (b.mentions ?? 0) - (a.mentions ?? 0) || a.name.localeCompare(b.name, locale))
      .slice(0, 12)

    // приоритетные пробелы: часто требуют, а уровень низкий
    const gaps = skills
      .filter((s) => !s.learned && (s.level ?? 0) <= 2)
      .map((s) => ({
        ...s,
        weight: (s.importance === 'must' ? 2 : 0) + (s.mentions ?? 0) * 0.5 - (s.level ?? 0) * 0.6,
      }))
      .sort((a, b) => b.weight - a.weight)
      .slice(0, 8)

    const byCategory = CATEGORY_IDS.map((id) => {
      const items = skills.filter((s) => s.category === id)
      return {
        id,
        total: items.length,
        learned: items.filter((s) => s.learned).length,
        avg: items.length ? items.reduce((a, s) => a + (s.level ?? 0), 0) / items.length : 0,
      }
    })
      .filter((c) => c.total > 0)
      .sort((a, b) => b.total - a.total)

    const byPosition = ['PM', 'BA'].map((id) => {
      const items = skills.filter((s) => (s.positions ?? []).includes(id))
      return {
        id,
        total: items.length,
        learned: items.filter((s) => s.learned).length,
        avg: items.length ? items.reduce((a, s) => a + (s.level ?? 0), 0) / items.length : 0,
      }
    }).filter((p) => p.total > 0)

    // сколько требований появилось по месяцам
    const months = new Map()
    for (const s of skills) {
      const key = String(s.created_at ?? '').slice(0, 7)
      if (key) months.set(key, (months.get(key) ?? 0) + 1)
    }
    const timeline = [...months.entries()].sort(([a], [b]) => a.localeCompare(b)).slice(-8)

    return {
      total,
      learned,
      percent: total ? Math.round((learned / total) * 100) : 0,
      must: must.length,
      mustLearned,
      mustPercent: must.length ? Math.round((mustLearned / must.length) * 100) : 0,
      avg,
      levels,
      top,
      gaps,
      byCategory,
      byPosition,
      timeline,
      maxMentions: Math.max(1, ...skills.map((s) => s.mentions ?? 0)),
      maxLevelCount: Math.max(1, ...levels.map((l) => l.count)),
      maxMonth: Math.max(1, ...timeline.map(([, n]) => n)),
    }
  }, [skills, locale])

  if (!skills.length) {
    return (
      <>
        <PageHead title={t('report.title')} accent={t('report.titleAccent')} />
        <Empty
          title={t('report.emptyTitle')}
          action={
            <button className="btn btn-accent" onClick={goToImport}>
              <Icon name="plus" /> {t('skills.emptyCta')}
            </button>
          }
        >
          {t('report.emptyText')}
        </Empty>
      </>
    )
  }

  const lastVacancy = vacancies[0]

  return (
    <>
      <PageHead
        title={t('report.title')}
        accent={t('report.titleAccent')}
        aside={
          lastVacancy && (
            <span className="mono" style={{ whiteSpace: 'nowrap' }}>
              {t('report.lastImport', { date: formatDate(lastVacancy.created_at) })}
            </span>
          )
        }
      >
        {t('report.lead')}
      </PageHead>

      {/* ------------------------------------------------------------- KPI */}
      <div className="stats" style={{ marginBottom: 26 }}>
        <div className="stat">
          <div className="stat-value">{data.percent}<small>%</small></div>
          <div className="stat-label mono">{t('report.kpiProgress')}</div>
        </div>
        <div className="stat stat-green">
          <div className="stat-value">{data.learned}<small> / {data.total}</small></div>
          <div className="stat-label mono">{t('stats.learned')}</div>
        </div>
        <div className="stat stat-accent">
          <div className="stat-value">{data.mustPercent}<small>%</small></div>
          <div className="stat-label mono">{t('report.kpiMust')}</div>
        </div>
        <div className="stat">
          <div className="stat-value">{data.avg.toFixed(1)}<small> / 5</small></div>
          <div className="stat-label mono">{t('stats.avg')}</div>
        </div>
        <div className="stat">
          <div className="stat-value">{data.gaps.length}</div>
          <div className="stat-label mono">{t('report.kpiGaps')}</div>
        </div>
        <div className="stat">
          <div className="stat-value">{vacancies.length}</div>
          <div className="stat-label mono">{t('stats.vacancies')}</div>
        </div>
      </div>

      <div className="report-grid">
        {/* ------------------------------------------- топ технологий */}
        <section className="card report-card">
          <h2 className="report-h">{t('report.topTitle')}</h2>
          <p className="report-note">{t('report.topNote')}</p>
          <div className="bars">
            {data.top.map((s) => (
              <div className="bar-row" key={s.id} title={`${s.name} — ${t('skills.mentions', { n: s.mentions })}`}>
                <span className="bar-label">
                  {s.name}
                  {s.learned && <span className="bar-flag" aria-label={t('common.learned')}>✓</span>}
                </span>
                <div className="bar-track">
                  <div
                    className={`bar-fill${s.learned ? ' done' : ''}`}
                    style={{ width: `${Math.max(4, ((s.mentions ?? 0) / data.maxMentions) * 100)}%` }}
                  />
                </div>
                <span className="bar-value mono">{s.mentions}</span>
              </div>
            ))}
          </div>
        </section>

        {/* ------------------------------------------- уровни знания */}
        <section className="card report-card">
          <h2 className="report-h">{t('report.levelsTitle')}</h2>
          <p className="report-note">{t('report.levelsNote')}</p>
          <div className="columns">
            {data.levels.map((l) => (
              <div className="col" key={l.value} title={`${t(`levels.${l.value}`)}: ${l.count}`}>
                <span className="col-value mono">{l.count}</span>
                <div className="col-track">
                  <div
                    className="col-fill"
                    style={{ height: `${l.count ? Math.max(5, (l.count / data.maxLevelCount) * 100) : 0}%` }}
                  />
                </div>
                <span className="col-label mono">{l.value}</span>
              </div>
            ))}
          </div>
          <div className="report-legend mono">{t('report.levelsAxis')}</div>
        </section>

        {/* ------------------------------------------- по категориям */}
        <section className="card report-card">
          <h2 className="report-h">{t('report.categoriesTitle')}</h2>
          <p className="report-note">{t('report.categoriesNote')}</p>
          <div className="bars">
            {data.byCategory.map((c) => (
              <div className="bar-row" key={c.id}>
                <span className="bar-label">{t(`categories.${c.id}`)}</span>
                <div className="bar-track">
                  <div className="bar-fill done" style={{ width: `${(c.learned / c.total) * 100}%` }} />
                </div>
                <span className="bar-value mono">
                  {c.learned}/{c.total} · {c.avg.toFixed(1)}
                </span>
              </div>
            ))}
          </div>
        </section>

        {/* ------------------------------------------- PM / BA */}
        <section className="card report-card">
          <h2 className="report-h">{t('report.rolesTitle')}</h2>
          <p className="report-note">{t('report.rolesNote')}</p>
          <div className="bars">
            {data.byPosition.map((p) => (
              <div className="bar-row" key={p.id}>
                <span className="bar-label">{p.id}</span>
                <div className="bar-track">
                  <div className="bar-fill done" style={{ width: `${(p.learned / p.total) * 100}%` }} />
                </div>
                <span className="bar-value mono">
                  {Math.round((p.learned / p.total) * 100)}% · {p.avg.toFixed(1)}
                </span>
              </div>
            ))}
          </div>
        </section>

        {/* ------------------------------------------- пробелы */}
        <section className="card report-card report-wide">
          <h2 className="report-h">{t('report.gapsTitle')}</h2>
          <p className="report-note">{t('report.gapsNote')}</p>
          {data.gaps.length === 0 ? (
            <p className="muted" style={{ fontSize: 14 }}>{t('report.gapsNone')}</p>
          ) : (
            <ol className="gap-list">
              {data.gaps.map((s, i) => (
                <li className="gap-item" key={s.id}>
                  <span className="gap-rank mono">{i + 1}</span>
                  <span className="gap-name">{s.name}</span>
                  <span className="gap-tags">
                    {s.importance === 'must' && <span className="tag tag-must">{t('common.must')}</span>}
                    <span className="tag">{t('skills.mentions', { n: s.mentions ?? 0 })}</span>
                    <span className="tag">{t(`levels.${s.level ?? 0}`)}</span>
                  </span>
                </li>
              ))}
            </ol>
          )}
        </section>

        {/* ------------------------------------------- динамика */}
        {data.timeline.length > 1 && (
          <section className="card report-card report-wide">
            <h2 className="report-h">{t('report.timelineTitle')}</h2>
            <p className="report-note">{t('report.timelineNote')}</p>
            <div className="columns columns-wide">
              {data.timeline.map(([month, n]) => (
                <div className="col" key={month} title={`${month}: ${n}`}>
                  <span className="col-value mono">{n}</span>
                  <div className="col-track">
                    <div className="col-fill" style={{ height: `${Math.max(5, (n / data.maxMonth) * 100)}%` }} />
                  </div>
                  <span className="col-label mono">{month.slice(2).replace('-', '/')}</span>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </>
  )
}
