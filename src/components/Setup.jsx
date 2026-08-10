import { useT } from '../i18n'
import ThemeToggle from './ThemeToggle'
import LangToggle from './LangToggle'

export default function Setup() {
  const t = useT()

  return (
    <div className="shell" style={{ maxWidth: 760, padding: '64px 24px' }}>
      <div className="row" style={{ gap: 9, marginBottom: 26 }}>
        <span className="brand-mark">S</span>
        <span className="brand-name">
          Skill <em>Dossier</em>
        </span>
        <span className="spacer" />
        <LangToggle />
        <ThemeToggle />
      </div>

      <h1 className="page-title" style={{ marginBottom: 12 }}>
        {t('setup.title')} <em>{t('setup.titleAccent')}</em>
      </h1>
      <p className="page-sub" style={{ marginBottom: 34 }}>{t('setup.lead')}</p>

      <ol className="steps">
        <li>
          <b>{t('setup.step1')}</b>
          <p className="muted" style={{ fontSize: 13.5 }}>
            <a href="https://supabase.com/dashboard" target="_blank" rel="noreferrer">supabase.com/dashboard</a> —{' '}
            {t('setup.step1text')}
          </p>
        </li>
        <li>
          <b>{t('setup.step2')}</b>
          <p className="muted" style={{ fontSize: 13.5 }}>
            {t('setup.step2text', { file: 'supabase/schema.sql' })}
          </p>
        </li>
        <li>
          <b>{t('setup.step3')}</b>
          <p className="muted" style={{ fontSize: 13.5 }}>
            {t('setup.step3text', { url: 'Project URL', key: 'anon public' })}
          </p>
        </li>
        <li>
          <b>{t('setup.step4', { file: '.env' })}</b>
          <div className="code-block" style={{ marginTop: 8 }}>{`VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOi...
VITE_OPENROUTER_API_KEY=sk-or-v1-...`}</div>
        </li>
        <li>
          <b>{t('setup.step5')}</b>
          <div className="code-block" style={{ marginTop: 8 }}>npm run dev</div>
          <p className="muted" style={{ fontSize: 13.5, marginTop: 6 }}>
            {t('setup.step5text', { file: '.env' })}
          </p>
        </li>
      </ol>
    </div>
  )
}
