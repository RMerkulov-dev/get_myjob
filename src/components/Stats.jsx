import { useI18n } from '../i18n'

export default function Stats({ skills, vacancies }) {
  const { t, formatNumber } = useI18n()

  const total = skills.length
  const learned = skills.filter((s) => s.learned).length
  const gaps = skills.filter((s) => !s.learned && (s.level ?? 0) <= 1).length
  const must = skills.filter((s) => s.importance === 'must').length
  const avg = total ? skills.reduce((a, s) => a + (s.level ?? 0), 0) / total : 0
  const percent = total ? Math.round((learned / total) * 100) : 0

  return (
    <>
      <div className="stats">
        <div className="stat">
          <div className="stat-value">{formatNumber(total)}</div>
          <div className="stat-label mono">{t('stats.total')}</div>
        </div>
        <div className="stat stat-green">
          <div className="stat-value">
            {learned}
            <small> / {total || 0}</small>
          </div>
          <div className="stat-label mono">{t('stats.learned')}</div>
        </div>
        <div className="stat stat-accent">
          <div className="stat-value">{gaps}</div>
          <div className="stat-label mono">{t('stats.gaps')}</div>
        </div>
        <div className="stat">
          <div className="stat-value">{must}</div>
          <div className="stat-label mono">{t('stats.must')}</div>
        </div>
        <div className="stat">
          <div className="stat-value">
            {avg.toFixed(1)}
            <small> / 5</small>
          </div>
          <div className="stat-label mono">{t('stats.avg')}</div>
        </div>
        <div className="stat">
          <div className="stat-value">{vacancies.length}</div>
          <div className="stat-label mono">{t('stats.vacancies')}</div>
        </div>
      </div>

      {total > 0 && (
        <div style={{ marginTop: -18, marginBottom: 30 }}>
          <div className="row" style={{ justifyContent: 'space-between', marginBottom: 6 }}>
            <span className="mono">{t('stats.progress')}</span>
            <span className="mono" style={{ color: 'var(--ink)' }}>{percent}%</span>
          </div>
          <div className="progress-track">
            <div className="progress-fill green" style={{ width: `${percent}%` }} />
          </div>
        </div>
      )}
    </>
  )
}
