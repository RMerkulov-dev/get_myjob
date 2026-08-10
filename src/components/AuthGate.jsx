import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useT } from '../i18n'
import { Icon, Spinner } from './ui'
import ThemeToggle from './ThemeToggle'
import LangToggle from './LangToggle'

/**
 * Пускает дальше только с активной сессией Supabase.
 * Вход по ссылке на почту — пароль не нужен, сессия обновляется сама.
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

  if (!session) return <SignIn />

  return children
}

function SignIn() {
  const t = useT()
  const [email, setEmail] = useState('')
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState(null)

  async function submit(e) {
    e.preventDefault()
    setSending(true)
    setError(null)
    try {
      const { error: err } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: { emailRedirectTo: window.location.origin },
      })
      if (err) throw err
      setSent(true)
    } catch (err) {
      setError(err.message || t('auth.failed'))
    } finally {
      setSending(false)
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

        {sent ? (
          <>
            <h1 className="serif" style={{ fontSize: 30, lineHeight: 1.1, marginBottom: 10 }}>
              {t('auth.sentTitle')}
            </h1>
            <p style={{ color: 'var(--ink-2)', fontSize: 14 }}>{t('auth.sentText', { email })}</p>
            <button className="btn btn-ghost btn-sm" style={{ marginTop: 20 }} onClick={() => setSent(false)}>
              {t('auth.otherEmail')}
            </button>
          </>
        ) : (
          <>
            <h1 className="serif" style={{ fontSize: 32, lineHeight: 1.05, marginBottom: 8 }}>
              {t('auth.title')}{' '}
              <em style={{ fontStyle: 'italic', color: 'var(--accent-ink)' }}>{t('auth.titleAccent')}</em>
            </h1>
            <p style={{ color: 'var(--ink-2)', fontSize: 14, marginBottom: 22 }}>{t('auth.lead')}</p>

            <form onSubmit={submit}>
              <label className="field" style={{ marginBottom: 16 }}>
                <span className="field-label">{t('auth.email')}</span>
                <input
                  className="input"
                  type="email"
                  required
                  autoFocus
                  autoComplete="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </label>

              <button className="btn btn-accent" type="submit" disabled={sending || !email.trim()}>
                {sending ? <Spinner /> : <Icon name="send" size={14} />}
                {t('auth.send')}
              </button>
            </form>

            {error && <p style={{ marginTop: 16, fontSize: 13, color: 'var(--accent-ink)' }}>{error}</p>}
          </>
        )}
      </div>
    </div>
  )
}
