import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import en from './en'
import uk from './uk'

const DICTS = { en, uk }
const LOCALES = { en: 'en-GB', uk: 'uk-UA' }
const KEY = 'skill-dossier.lang'

export const LANGS = [
  { id: 'en', short: 'EN' },
  { id: 'uk', short: 'UA' },
]

export function loadLang() {
  const stored = localStorage.getItem(KEY)
  if (stored && DICTS[stored]) return stored
  const nav = (navigator.language || 'en').toLowerCase()
  if (nav.startsWith('uk') || nav.startsWith('ru')) return 'uk'
  return 'en'
}

/** Текущий язык доступен и вне React — библиотечный код тоже умеет переводить. */
let current = 'en'
try {
  current = loadLang()
} catch {
  /* SSR / приватный режим без localStorage */
}

function resolve(dict, key) {
  return key.split('.').reduce((acc, part) => (acc == null ? undefined : acc[part]), dict)
}

/** Правила плюрализации: у английского две формы, у украинского три. */
const PLURAL = {
  en: (n) => (n === 1 ? 'one' : 'other'),
  uk: (n) => {
    const mod10 = n % 10
    const mod100 = n % 100
    if (mod10 === 1 && mod100 !== 11) return 'one'
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'few'
    return 'many'
  },
}

function interpolate(template, vars) {
  if (!vars) return template
  return String(template).replace(/\{(\w+)\}/g, (match, name) => (name in vars ? String(vars[name]) : match))
}

/** t('skills.title'), t('import.chars', { n: 120 }), t('import.saved', { count: 3, created: 3 }) */
export function translate(lang, key, vars) {
  let value = resolve(DICTS[lang], key)
  if (value === undefined) value = resolve(DICTS.en, key)
  if (value === undefined) return key

  // плюрализация: значение — объект с формами one/few/many/other
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const count = vars?.count ?? vars?.n
    if (typeof count === 'number') {
      const form = PLURAL[lang](Math.abs(count))
      value = value[form] ?? value.other ?? value.many ?? value.one ?? key
    } else {
      return key
    }
  }

  if (Array.isArray(value)) return value
  return interpolate(value, vars)
}

/** Перевод вне компонентов (ошибки в lib/, промпты). */
export function t(key, vars) {
  return translate(current, key, vars)
}

export function currentLang() {
  return current
}

export function localeOf(lang = current) {
  return LOCALES[lang] ?? 'en-GB'
}

const I18nContext = createContext(null)

export function I18nProvider({ children }) {
  const [lang, setLang] = useState(loadLang)

  useEffect(() => {
    current = lang
    document.documentElement.lang = lang
    try {
      localStorage.setItem(KEY, lang)
    } catch {
      /* приватный режим — переживём */
    }
  }, [lang])

  const value = useMemo(
    () => ({
      lang,
      setLang,
      locale: LOCALES[lang],
      t: (key, vars) => translate(lang, key, vars),
      /** Дата в локали интерфейса. */
      formatDate: (input) =>
        new Date(input).toLocaleDateString(LOCALES[lang], { day: '2-digit', month: 'short', year: 'numeric' }),
      formatNumber: (n) => Number(n).toLocaleString(LOCALES[lang]),
    }),
    [lang],
  )

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n() {
  const ctx = useContext(I18nContext)
  if (!ctx) throw new Error('useI18n вызван вне I18nProvider')
  return ctx
}

/** Короткий доступ только к переводчику. */
export function useT() {
  return useI18n().t
}

/** Сортировка строк по правилам текущего языка. */
export function useCollator() {
  const { locale } = useI18n()
  return useCallback((a, b) => String(a).localeCompare(String(b), locale), [locale])
}
