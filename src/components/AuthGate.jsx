import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useT } from '../i18n'
import { Icon, Spinner } from './ui'
import ThemeToggle from './ThemeToggle'
import LangToggle from './LangToggle'

const MIN_PASSWORD = 6

/**
 * Пускает дальше только с активной сессией Supabase.
 *
 * Вход и регистрация по email с паролем. Ссылки на почту не используются:
 * встроенный SMTP Supabase ограничен парой писем в час, и на этом лимите
 * приложение становится недоступным.
 */
export default function AuthGate({ children }) {
  const t = useT()
  const [session, setSession] = useState(null)
  const [checking, setChecking] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setChecking(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => setSession(next))
    return () => sub.subscription.unsubscribe()
  }, [])

  if (checking) {
    return (
      <div className="auth-screen">
        <span className="mono row" style={{ gap: 9 }}>
          <Spinner /> {t('auth.checking')}
        </span>
      </div>
    )
  }

  if (!session) return <AuthForm />

  return children
}

function AuthForm() {
  const t = useT()
  const [mode, setMode] = useState('signIn') // 'signIn' | 'signUp'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [confirmSent, setConfirmSent] = useState(false)

  const isSignUp = mode === 'signUp'
  const tooShort = isSignUp && password.length > 0 && password.length < MIN_PASSWORD

  function switchMode() {
    setMode(isSignUp ? 'signIn' : 'signUp')
    setError(null)
    setConfirmSent(false)
  }

  function describe(raw) {
    const message = String(raw ?? '')
    if (/invalid login credentials/i.test(message)) return t('auth.wrongCredentials')
    if (/already registered|already exists/i.test(message)) return t('auth.alreadyRegistered')
    if (/email not confirmed/i.test(message)) return t('auth.notConfirmed')
    if (/password should be at least/i.test(message)) return t('auth.passwordShort', { n: MIN_PASSWORD })
    if (/rate limit/i.test(message)) return t('auth.rateLimited')
    if (/logins are disabled|provider is not enabled|email provider/i.test(message)) return t('auth.emailDisabled')
    if (/signups not allowed|signup is disabled|signups are disabled/i.test(message)) return t('auth.signupDisabled')
    return message || t('auth.failed')
  }

  async function submit(e) {
    e.preventDefault()
    if (tooShort) return
    setBusy(true)
    setError(null)

    try {
      if (isSignUp) {
        const { data, error: err } = await supabase.auth.signUp({ email: email.trim(), password })
        if (err) throw err
        // если в Supabase включено подтверждение почты, сессии не будет
        if (!data.session) setConfirmSent(true)
      } else {
        const { error: err } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
        if (err) throw err
      }
      // при успехе сработает onAuthStateChange и AuthGate пустит внутрь
    } catch (err) {
      setError(describe(err.message))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="auth-screen">
      <div className="auth-card panel">
        <div className="row" style={{ gap: 9, marginBottom: 22 }}>
          <span className="brand-mark">S</span>
          <span className="brand-name">
            Skill <em>Dossier</em>
          </span>
          <span className="spacer" />
          <LangToggle />
          <ThemeToggle />
        </div>

        {confirmSent ? (
          <>
            <h1 className="serif" style={{ fontSize: 30, lineHeight: 1.1, marginBottom: 10 }}>
              {t('auth.confirmTitle')}
            </h1>
            <p style={{ color: 'var(--ink-2)', fontSize: 14 }}>{t('auth.confirmText', { email })}</p>
            <button className="btn btn-ghost btn-sm" style={{ marginTop: 20 }} onClick={() => setConfirmSent(false)}>
              {t('auth.backToSignIn')}
            </button>
          </>
        ) : (
          <>
            <h1 className="serif" style={{ fontSize: 32, lineHeight: 1.05, marginBottom: 8 }}>
              {isSignUp ? t('auth.signUpTitle') : t('auth.title')}{' '}
              <em style={{ fontStyle: 'italic', color: 'var(--accent-ink)' }}>
                {isSignUp ? t('auth.signUpTitleAccent') : t('auth.titleAccent')}
              </em>
            </h1>
            <p style={{ color: 'var(--ink-2)', fontSize: 14, marginBottom: 22 }}>
              {isSignUp ? t('auth.signUpLead') : t('auth.lead')}
            </p>

            <form onSubmit={submit}>
              <label className="field" style={{ marginBottom: 14 }}>
                <span className="field-label">{t('auth.email')}</span>
                <input
                  className="input"
                  type="email"
                  required
                  autoFocus
                  autoComplete="username"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </label>

              <label className="field" style={{ marginBottom: 18 }}>
                <span className="field-label">{t('auth.password')}</span>
                <input
                  className="input"
                  type="password"
                  required
                  minLength={isSignUp ? MIN_PASSWORD : undefined}
                  autoComplete={isSignUp ? 'new-password' : 'current-password'}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                {isSignUp && (
                  <span
                    className="mono"
                    style={{
                      display: 'block',
                      marginTop: 6,
                      textTransform: 'none',
                      letterSpacing: 0,
                      color: tooShort ? 'var(--accent-ink)' : undefined,
                    }}
                  >
                    {t('auth.passwordHint', { n: MIN_PASSWORD })}
                  </span>
                )}
              </label>

              <button
                className="btn btn-accent"
                type="submit"
                disabled={busy || !email.trim() || !password || tooShort}
              >
                {busy ? <Spinner /> : <Icon name={isSignUp ? 'plus' : 'logout'} size={14} />}
                {isSignUp ? t('auth.signUp') : t('auth.signIn')}
              </button>
            </form>

            {error && <p style={{ marginTop: 16, fontSize: 13, color: 'var(--accent-ink)' }}>{error}</p>}

            <div className="auth-switch">
              <span>{isSignUp ? t('auth.haveAccount') : t('auth.noAccount')}</span>
              <button type="button" onClick={switchMode}>
                {isSignUp ? t('auth.signIn') : t('auth.signUp')}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
