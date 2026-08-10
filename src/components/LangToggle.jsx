import { LANGS, useI18n } from '../i18n'

export default function LangToggle() {
  const { lang, setLang, t } = useI18n()

  return (
    <div className="theme-toggle lang-toggle" role="group" aria-label={t('lang.group')}>
      {LANGS.map((l) => (
        <button
          key={l.id}
          type="button"
          data-active={lang === l.id}
          aria-pressed={lang === l.id}
          title={t(`lang.${l.id}`)}
          onClick={() => setLang(l.id)}
        >
          {l.short}
        </button>
      ))}
    </div>
  )
}
