import { useT } from '../i18n'
import { supabase } from '../lib/supabase'
import ThemeToggle from './ThemeToggle'
import LangToggle from './LangToggle'
import { Icon } from './ui'

const TABS = ['import', 'skills', 'cv', 'report', 'vacancies', 'chat']

export default function Header({ tab, onTab, counts }) {
  const t = useT()

  return (
    <div className="topbar">
      <div className="shell topbar-inner">
        <button
          className="brand"
          onClick={() => onTab('skills')}
          style={{ background: 'none', border: 0, cursor: 'pointer', padding: 0 }}
        >
          <span className="brand-mark">S</span>
          <span className="brand-name">
            Skill <em>Dossier</em>
          </span>
        </button>

        <nav className="nav" style={{ marginLeft: 'auto' }}>
          {TABS.map((id) => (
            <button key={id} className="nav-item" data-active={tab === id} onClick={() => onTab(id)}>
              {t(`nav.${id}`)}
              {counts[id] > 0 && <span className="nav-count">{counts[id]}</span>}
            </button>
          ))}
        </nav>

        <div className="row" style={{ gap: 6, flexShrink: 0 }}>
          <LangToggle />
          <ThemeToggle />
          <button
            className="icon-btn"
            title={t('settings.signOut')}
            aria-label={t('settings.signOut')}
            onClick={async () => {
              if (!confirm(t('settings.signOutConfirm'))) return
              await supabase.auth.signOut()
            }}
          >
            <Icon name="logout" size={14} />
          </button>
        </div>
      </div>
    </div>
  )
}

export { TABS }
