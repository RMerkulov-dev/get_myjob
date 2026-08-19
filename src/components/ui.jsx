import { useT } from '../i18n'

/* ------------------------------------------------------------------ иконки */

const stroke = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
}

export function Icon({ name, size = 15 }) {
  const paths = {
    search: <><circle cx="7" cy="7" r="5" {...stroke} /><path d="m11 11 4 4" {...stroke} /></>,
    plus: <path d="M8 3v10M3 8h10" {...stroke} />,
    trash: <><path d="M3 5h10M6.5 5V3.5h3V5M5 5l.6 8h4.8L11 5" {...stroke} /></>,
    send: <path d="M2.5 8 13.5 3l-4 10.5L7.6 9.2 2.5 8Z" {...stroke} />,
    spark: <path d="M8 2l1.4 4.2L13.5 8 9.4 9.4 8 14l-1.4-4.6L2.5 8l4.1-1.4L8 2Z" {...stroke} />,
    chevron: <path d="m4 6.5 4 4 4-4" {...stroke} />,
    check: <path d="m3 8.5 3.2 3.2L13 4.5" {...stroke} />,
    close: <path d="m4 4 8 8M12 4l-8 8" {...stroke} />,
    doc: <><path d="M4 2.5h5l3 3v8H4v-11Z" {...stroke} /><path d="M9 2.5v3h3" {...stroke} /></>,
    chat: <path d="M13.5 8.5c0 2.5-2.5 4.5-5.5 4.5-.7 0-1.4-.1-2-.3L3 13.5l.9-2.3A4.4 4.4 0 0 1 2.5 8.5C2.5 6 5 4 8 4s5.5 2 5.5 4.5Z" {...stroke} />,
    gear: <><circle cx="8" cy="8" r="2.3" {...stroke} /><path d="M8 1.8v1.6M8 12.6v1.6M2.6 8H1M15 8h-1.6M4.2 4.2 3 3M13 13l-1.2-1.2M11.8 4.2 13 3M3 13l1.2-1.2" {...stroke} /></>,
    layers: <><path d="M8 2 2.5 5 8 8l5.5-3L8 2Z" {...stroke} /><path d="m2.5 8.5 5.5 3 5.5-3" {...stroke} /></>,
    refresh: <><path d="M13 8a5 5 0 1 1-1.7-3.8" {...stroke} /><path d="M13 2v3h-3" {...stroke} /></>,
    sun: (
      <>
        <circle cx="8" cy="8" r="2.9" {...stroke} />
        <path d="M8 1.5v1.4M8 13.1v1.4M1.5 8h1.4M13.1 8h1.4M3.4 3.4l1 1M11.6 11.6l1 1M12.6 3.4l-1 1M4.4 11.6l-1 1" {...stroke} />
      </>
    ),
    moon: <path d="M13 9.3A5.4 5.4 0 0 1 6.7 3a5.6 5.6 0 1 0 6.3 6.3Z" {...stroke} />,
    auto: (
      <>
        <circle cx="8" cy="8" r="5.3" {...stroke} />
        <path d="M8 2.7a5.3 5.3 0 0 1 0 10.6Z" fill="currentColor" stroke="none" />
      </>
    ),
    cap: (
      <>
        <path d="M8 2.6 14.2 5.6 8 8.6 1.8 5.6 8 2.6Z" {...stroke} />
        <path d="M4 7v3.4c0 1.1 1.8 2 4 2s4-.9 4-2V7" {...stroke} />
      </>
    ),
    info: (
      <>
        <circle cx="8" cy="8" r="6" {...stroke} />
        <path d="M8 7.2v4" {...stroke} />
        <circle cx="8" cy="4.9" r="0.85" fill="currentColor" stroke="none" />
      </>
    ),
    logout: (
      <>
        <path d="M9.5 3.5H4v9h5.5" {...stroke} />
        <path d="M7.5 8h6M11.5 5.8 13.7 8l-2.2 2.2" {...stroke} />
      </>
    ),
  }
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true" style={{ flexShrink: 0 }}>
      {paths[name] ?? null}
    </svg>
  )
}

/* --------------------------------------------------------------- подсказка */

/**
 * Знак вопроса с всплывающей подсказкой. Работает и с клавиатуры (focus),
 * поэтому это button, а не div: иначе объяснение недоступно без мыши.
 */
export function Hint({ text }) {
  return (
    <button type="button" className="hint" aria-label={text} onClick={(e) => e.preventDefault()}>
      <Icon name="info" size={12} />
      <span className="hint-bubble" role="tooltip">{text}</span>
    </button>
  )
}

/* --------------------------------------------------------------- метрика */

/**
 * Оценка полосой: величину несёт длина, значение подписано цифрой.
 * Без числа не рисуется вовсе — иначе пустая полоса читается как «100».
 */
export function ScoreBar({ label, value, hint, comment }) {
  if (!Number.isFinite(value)) return null
  const clamped = Math.max(0, Math.min(100, Math.round(value)))
  const band = clamped >= 80 ? 'good' : clamped >= 55 ? 'mid' : 'low'
  return (
    <div className="scorebar" data-band={band}>
      <div className="row" style={{ gap: 6, marginBottom: 5 }}>
        <span className="field-label" style={{ marginBottom: 0 }}>{label}</span>
        {hint && <Hint text={hint} />}
        <span className="spacer" />
        <span className="scorebar-value mono">{clamped}/100</span>
      </div>
      <div className="progress-track">
        <div className="progress-fill" style={{ width: `${clamped}%` }} />
      </div>
      {comment && <p className="scorebar-note">{comment}</p>}
    </div>
  )
}

/* --------------------------------------------------------------- сегменты */

export function Segmented({ options, value, onChange, accent = false }) {
  return (
    <div className={`segmented${accent ? ' accent' : ''}`} role="tablist">
      {options.map((o) => (
        <button
          key={o.id ?? o.value}
          type="button"
          role="tab"
          aria-selected={value === (o.id ?? o.value)}
          data-active={value === (o.id ?? o.value)}
          title={o.full ?? o.hint ?? ''}
          onClick={() => onChange(o.id ?? o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

/* ---------------------------------------------------------------- уровень */

export function LevelPicker({ value = 0, learned = false, onChange, showLabel = true }) {
  const t = useT()
  return (
    <div className="row" style={{ gap: 9 }}>
      <div className={`level${learned ? ' is-learned' : ''}`} role="group" aria-label={t('levels.group')}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            data-on={n <= value}
            aria-label={`${n} — ${t(`levels.${n}`)}`}
            title={t(`levels.${n}`)}
            onClick={() => onChange(value === n ? n - 1 : n)}
          />
        ))}
      </div>
      {showLabel && <span className="level-name">{t(`levels.${Math.max(0, Math.min(5, value))}`)}</span>}
    </div>
  )
}

/* ----------------------------------------------------------------- прочее */

export function Empty({ title, children, action }) {
  return (
    <div className="empty">
      <div className="empty-title serif">{title}</div>
      <p>{children}</p>
      {action && <div style={{ marginTop: 18 }}>{action}</div>}
    </div>
  )
}

export function Spinner() {
  return <span className="spinner" />
}

export function Toasts({ items, onDismiss, dismissLabel = 'Close' }) {
  if (!items.length) return null
  return (
    <div className="toasts">
      {items.map((t) => (
        <div key={t.id} className="toast" data-kind={t.kind} role="status">
          <span style={{ flex: 1 }}>{t.message}</span>
          <button
            type="button"
            onClick={() => onDismiss(t.id)}
            style={{ background: 'none', border: 0, color: 'inherit', cursor: 'pointer', opacity: 0.7 }}
            aria-label={dismissLabel}
          >
            <Icon name="close" size={12} />
          </button>
        </div>
      ))}
    </div>
  )
}

export function PageHead({ title, accent, children, aside }) {
  return (
    <header className="page-head">
      <div style={{ flex: 1, minWidth: 0 }}>
        <h1 className="page-title">
          {title} {accent && <em>{accent}</em>}
        </h1>
        {children && <p className="page-sub" style={{ marginTop: 10 }}>{children}</p>}
      </div>
      {aside}
    </header>
  )
}
