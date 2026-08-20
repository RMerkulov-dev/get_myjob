import { useCallback, useEffect, useMemo, useState } from 'react'
import { fetchPlanGoal, fetchPlanRange, savePlanGoal } from '../lib/db'
import {
  METRIC_TONE,
  PLAN_METRICS,
  addMonths,
  clampCount,
  emptyGoal,
  factKey,
  goalKey,
  gridRange,
  groupPostsByDay,
  indexByDay,
  monthGrid,
  monthKey,
  planKey,
  ratio,
  startOfMonth,
  totals,
} from '../lib/planner'
import { useI18n } from '../i18n'
import PlanDayModal from './PlanDayModal'
import { Hint, Icon, PageHead, Spinner } from './ui'

/** Метрика месяца: крупно факт, рядом план, полоса — до цели или до плана. */
function MetricCard({ metric, plan, fact, goal, t }) {
  const target = goal || plan
  const percent = ratio(fact, target)
  const done = target > 0 && fact >= target
  return (
    <div className="plan-metric" data-tone={METRIC_TONE[metric]} data-done={done}>
      <div className="row" style={{ gap: 5 }}>
        <span className="plan-metric-label mono">{t(`planner.metrics.${metric}`)}</span>
        <Hint text={t(`planner.metricsHint.${metric}`)} />
      </div>
      <div className="plan-metric-value">
        {fact}
        <small>
          {' / '}
          {plan || 0} {t('planner.plan')}
        </small>
      </div>
      <div className="progress-track">
        <div className="progress-fill" style={{ width: `${percent}%` }} />
      </div>
      <div className="row plan-metric-foot mono">
        <span>{target ? `${percent}%` : t('planner.noPlanYet')}</span>
        <span className="spacer" />
        {goal > 0 && <span>{t('planner.goal')} {goal}</span>}
      </div>
    </div>
  )
}

/** Компактная строка метрики внутри дня календаря: план/факт одним взглядом. */
function CellMetric({ metric, plan, fact, t }) {
  if (!plan && !fact) return null
  const state = fact >= plan && plan > 0 ? 'done' : fact > 0 ? 'partial' : 'planned'
  return (
    <span
      className="cal-metric"
      data-tone={METRIC_TONE[metric]}
      data-state={state}
      title={`${t(`planner.metrics.${metric}`)}: ${t('planner.ofPlan', { fact, plan })}`}
    >
      <b>{t(`planner.metricsShort.${metric}`)}</b>
      <span className="mono">
        {fact}
        <i>/{plan}</i>
      </span>
    </span>
  )
}

export default function PlannerView({ toast }) {
  const { t, locale, formatNumber } = useI18n()
  const [cursor, setCursor] = useState(() => startOfMonth(new Date()))
  const [days, setDays] = useState([])
  const [posts, setPosts] = useState([])
  const [goal, setGoal] = useState(null)
  const [loading, setLoading] = useState(true)
  const [openIso, setOpenIso] = useState(null)
  const [goalsOpen, setGoalsOpen] = useState(false)
  // Номер загрузки: им пересоздаётся редактор дня, чтобы он не остался
  // с пустым черновиком, если день открыли раньше, чем пришли данные.
  const [gen, setGen] = useState(0)
  const [goalDraft, setGoalDraft] = useState(null)
  const [savingGoals, setSavingGoals] = useState(false)

  const weeks = useMemo(() => monthGrid(cursor), [cursor])
  const month = monthKey(cursor)

  const load = useCallback(async () => {
    const { from, to } = gridRange(weeks)
    try {
      const [range, goalRow] = await Promise.all([fetchPlanRange(from, to), fetchPlanGoal(month)])
      setDays(range.days)
      setPosts(range.posts)
      setGoal(goalRow)
      setGen((n) => n + 1)
    } catch (e) {
      toast(
        e.message.includes('does not exist') || e.message.includes('schema') ? t('errors.noTables') : e.message,
        'error',
      )
    }
  }, [weeks, month, toast, t])

  useEffect(() => {
    let alive = true
    setLoading(true)
    load().finally(() => alive && setLoading(false))
    return () => {
      alive = false
    }
  }, [load])

  const byDay = useMemo(() => indexByDay(days), [days])
  const postsByDay = useMemo(() => groupPostsByDay(posts), [posts])

  // Итоги считаем только по дням самого месяца: «хвосты» сетки принадлежат соседям.
  const monthDays = useMemo(() => days.filter((d) => d.day.startsWith(month.slice(0, 7))), [days, month])
  const monthTotals = useMemo(() => totals(monthDays), [monthDays])
  const monthPosts = useMemo(() => posts.filter((p) => p.day.startsWith(month.slice(0, 7))), [posts, month])
  const published = monthPosts.filter((p) => p.status === 'published').length

  const monthLabel = useMemo(
    () => cursor.toLocaleDateString(locale, { month: 'long', year: 'numeric' }),
    [cursor, locale],
  )
  // 1 января 2024 — понедельник, от него берём подписи дней недели в локали
  const weekdays = useMemo(
    () =>
      Array.from({ length: 7 }, (_, i) =>
        new Date(2024, 0, 1 + i).toLocaleDateString(locale, { weekday: 'short' }).replace('.', ''),
      ),
    [locale],
  )

  const isCurrentMonth = monthKey(new Date()) === month

  function openGoals() {
    setGoalDraft({ ...emptyGoal(month), ...(goal ?? {}) })
    setGoalsOpen(true)
  }

  async function persistGoals() {
    setSavingGoals(true)
    try {
      const patch = {}
      for (const m of PLAN_METRICS) patch[goalKey(m)] = clampCount(goalDraft[goalKey(m)], 9999)
      const saved = await savePlanGoal(month, patch)
      setGoal(saved)
      setGoalsOpen(false)
      toast(t('planner.goalsSaved'), 'success')
    } catch (e) {
      toast(e.message, 'error')
    } finally {
      setSavingGoals(false)
    }
  }

  const conversion = (a, b) => (b > 0 ? (a / b).toFixed(1) : null)
  const perResponse = conversion(monthTotals.applications.fact, monthTotals.responses.fact)
  const perInterview = conversion(monthTotals.responses.fact, monthTotals.interviews.fact)

  return (
    <>
      <PageHead title={t('planner.title')} accent={t('planner.titleAccent')}>
        {t('planner.lead')}
      </PageHead>

      <div className="plan-toolbar">
        <div className="row" style={{ gap: 4 }}>
          <button
            className="icon-btn"
            onClick={() => setCursor((c) => addMonths(c, -1))}
            aria-label={t('planner.prevMonth')}
            title={t('planner.prevMonth')}
          >
            <Icon name="caretLeft" size={13} />
          </button>
          <button
            className="icon-btn"
            onClick={() => setCursor((c) => addMonths(c, 1))}
            aria-label={t('planner.nextMonth')}
            title={t('planner.nextMonth')}
          >
            <Icon name="caretRight" size={13} />
          </button>
        </div>

        <h2 className="plan-month">{monthLabel}</h2>
        {loading && <Spinner />}

        <span className="spacer" />

        {!isCurrentMonth && (
          <button className="btn btn-sm btn-ghost" onClick={() => setCursor(startOfMonth(new Date()))}>
            <Icon name="calendar" size={12} /> {t('planner.today')}
          </button>
        )}
        <button className="btn btn-sm btn-ghost" onClick={openGoals}>
          <Icon name="spark" size={12} /> {t('planner.editGoals')}
        </button>
      </div>

      {goalsOpen && goalDraft && (
        <div className="card plan-goals">
          <div className="row" style={{ gap: 8, marginBottom: 4 }}>
            <h3 className="group-title">{t('planner.goalsTitle')}</h3>
            <span className="spacer" />
            <span className="mono">{monthLabel}</span>
          </div>
          <p className="page-sub" style={{ margin: '0 0 16px' }}>{t('planner.goalsLead')}</p>
          <div className="plan-goals-grid">
            {PLAN_METRICS.map((m) => (
              <label className="field" key={m}>
                <span className="field-label">{t(`planner.metrics.${m}`)}</span>
                <input
                  className="input input-mono"
                  type="number"
                  min="0"
                  max="9999"
                  value={goalDraft[goalKey(m)] ?? 0}
                  onFocus={(e) => e.target.select()}
                  onChange={(e) =>
                    setGoalDraft((prev) => ({
                      ...prev,
                      [goalKey(m)]: e.target.value === '' ? 0 : clampCount(e.target.value, 9999),
                    }))
                  }
                />
              </label>
            ))}
          </div>
          <div className="row" style={{ gap: 10, marginTop: 16 }}>
            <button className="btn btn-accent btn-sm" onClick={persistGoals} disabled={savingGoals}>
              {savingGoals ? <Spinner /> : <Icon name="check" size={12} />} {t('common.save')}
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => setGoalsOpen(false)} disabled={savingGoals}>
              {t('common.cancel')}
            </button>
          </div>
        </div>
      )}

      <div className="plan-metrics">
        {PLAN_METRICS.map((m) => (
          <MetricCard
            key={m}
            metric={m}
            plan={monthTotals[m].plan}
            fact={monthTotals[m].fact}
            goal={goal?.[goalKey(m)] ?? 0}
            t={t}
          />
        ))}
      </div>

      <div className="cal-wrap">
        <div className="cal">
          <div className="cal-row cal-head">
            {weekdays.map((w, i) => (
              <div className="cal-hcell mono" key={i}>{w}</div>
            ))}
            <div className="cal-hcell mono cal-sum">{t('planner.week')}</div>
          </div>

          {weeks.map((week) => {
            const weekRows = week.days.map((d) => byDay.get(d.iso)).filter(Boolean)
            const weekTotals = totals(weekRows)
            return (
              <div className="cal-row" key={week.start}>
                {week.days.map((d) => {
                  const row = byDay.get(d.iso)
                  const dayPosts = postsByDay.get(d.iso) ?? []
                  return (
                    <button
                      type="button"
                      className="cal-cell"
                      key={d.iso}
                      data-out={!d.inMonth}
                      data-today={d.isToday}
                      data-weekend={d.isWeekend}
                      onClick={() => setOpenIso(d.iso)}
                      title={row?.note ?? ''}
                    >
                      <span className="cal-day mono">{d.dayNum}</span>

                      <span className="cal-metrics">
                        {PLAN_METRICS.map((m) => (
                          <CellMetric
                            key={m}
                            metric={m}
                            plan={row?.[planKey(m)] ?? 0}
                            fact={row?.[factKey(m)] ?? 0}
                            t={t}
                          />
                        ))}
                      </span>

                      {dayPosts.map((p) => (
                        <span className="cal-post" key={p.id} data-status={p.status}>
                          {p.title?.trim() || t('planner.untitledPost')}
                        </span>
                      ))}

                      {row?.note && <span className="cal-note">{row.note}</span>}
                    </button>
                  )
                })}

                <div className="cal-cell cal-sum" aria-hidden="true">
                  {PLAN_METRICS.map((m) =>
                    weekTotals[m].plan || weekTotals[m].fact ? (
                      <span className="cal-metric" key={m} data-tone={METRIC_TONE[m]} data-state="total">
                        <b>{t(`planner.metricsShort.${m}`)}</b>
                        <span className="mono">
                          {weekTotals[m].fact}
                          <i>/{weekTotals[m].plan}</i>
                        </span>
                      </span>
                    ) : null,
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      <div className="plan-footnotes">
        <div className="card">
          <span className="field-label">{t('planner.conversion')}</span>
          <p className="page-sub" style={{ margin: '0 0 12px' }}>{t('planner.conversionLead')}</p>
          <div className="kv">
            <span>{t('planner.perResponse')}</span>
            <b className="mono">{perResponse ?? t('planner.noData')}</b>
          </div>
          <div className="kv">
            <span>{t('planner.perInterview')}</span>
            <b className="mono">{perInterview ?? t('planner.noData')}</b>
          </div>
          <div className="kv">
            <span>{t('planner.status.published')}</span>
            <b className="mono">
              {formatNumber(published)} / {formatNumber(monthPosts.length)}
            </b>
          </div>
        </div>
        <div className="card">
          <span className="field-label">{t('planner.legend')}</span>
          <div className="plan-legend">
            {PLAN_METRICS.map((m) => (
              <div className="plan-legend-item" key={m}>
                <span className="cal-metric" data-tone={METRIC_TONE[m]} data-state="planned">
                  <b>{t(`planner.metricsShort.${m}`)}</b>
                  <span className="mono">
                    0<i>/0</i>
                  </span>
                </span>
                <span>{t(`planner.metrics.${m}`)}</span>
              </div>
            ))}
          </div>
          <p className="plan-hint mono">{t('planner.dayEmpty')}</p>
        </div>
      </div>

      {openIso && (
        <PlanDayModal
          key={`${openIso}-${gen}`}
          iso={openIso}
          row={byDay.get(openIso) ?? null}
          posts={postsByDay.get(openIso) ?? []}
          onClose={() => setOpenIso(null)}
          onSaved={load}
          toast={toast}
        />
      )}
    </>
  )
}
