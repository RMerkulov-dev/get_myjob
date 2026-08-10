import { useEffect, useState } from 'react'
import { THEMES, applyTheme, loadTheme, saveTheme } from '../lib/theme'
import { useT } from '../i18n'
import { Icon } from './ui'

export default function ThemeToggle() {
  const t = useT()
  const [theme, setTheme] = useState(loadTheme)

  // в режиме «как в системе» реагируем на переключение темы в ОС
  useEffect(() => {
    if (theme !== 'system') return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => applyTheme('system')
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [theme])

  return (
    <div className="theme-toggle" role="group" aria-label={t('theme.group')}>
      {THEMES.map((item) => (
        <button
          key={item.id}
          type="button"
          data-active={theme === item.id}
          title={t(`theme.${item.id}`)}
          aria-label={t(`theme.${item.id}`)}
          aria-pressed={theme === item.id}
          onClick={() => {
            setTheme(item.id)
            saveTheme(item.id)
          }}
        >
          <Icon name={item.icon} size={13} />
        </button>
      ))}
    </div>
  )
}
