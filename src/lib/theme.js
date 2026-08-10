/** Тема: «system» (по настройкам ОС), «light» или «dark». */

const KEY = 'skill-dossier.theme'

/** Подписи берутся из i18n по ключу `theme.<id>`. */
export const THEMES = [
  { id: 'system', icon: 'auto' },
  { id: 'light', icon: 'sun' },
  { id: 'dark', icon: 'moon' },
]

export function loadTheme() {
  const stored = localStorage.getItem(KEY)
  return stored === 'light' || stored === 'dark' ? stored : 'system'
}

/** Ставит атрибут на <html>: дальше всё решает CSS. */
export function applyTheme(theme) {
  const root = document.documentElement
  if (theme === 'system') root.removeAttribute('data-theme')
  else root.setAttribute('data-theme', theme)

  const dark =
    theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)

  // цвет строки браузера на мобильных
  let meta = document.querySelector('meta[name="theme-color"]')
  if (!meta) {
    meta = document.createElement('meta')
    meta.name = 'theme-color'
    document.head.appendChild(meta)
  }
  meta.content = dark ? '#14130f' : '#f6f4ed'
}

export function saveTheme(theme) {
  localStorage.setItem(KEY, theme)
  applyTheme(theme)
}
