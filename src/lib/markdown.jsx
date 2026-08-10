/**
 * Минимальный рендерер markdown для ответов ИИ.
 * Собирает React-элементы, а не HTML-строку — инъекции невозможны by design.
 * Поддержано: заголовки, списки, **жирный**, *курсив*, `код`, --- и цитаты.
 */

const INLINE = /(\*\*[^*]+\*\*|`[^`]+`|\*[^*\n]+\*|\[[^\]]+\]\([^)]+\))/g

function inline(text, keyPrefix) {
  const parts = String(text).split(INLINE).filter((p) => p !== '' && p !== undefined)

  return parts.map((part, i) => {
    const key = `${keyPrefix}-${i}`
    if (/^\*\*[^*]+\*\*$/.test(part)) return <strong key={key}>{part.slice(2, -2)}</strong>
    if (/^`[^`]+`$/.test(part)) return <code key={key}>{part.slice(1, -1)}</code>
    if (/^\*[^*]+\*$/.test(part)) return <em key={key}>{part.slice(1, -1)}</em>
    const link = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/)
    if (link) {
      return (
        <a key={key} href={link[2]} target="_blank" rel="noreferrer">
          {link[1]}
        </a>
      )
    }
    return part
  })
}

const BULLET = /^\s*[-*•—]\s+/
const NUMBER = /^\s*(\d+)[.)]\s+/

export function Markdown({ text }) {
  const lines = String(text ?? '').split('\n')
  const blocks = []
  let list = null // { ordered, items: [] }
  let para = []

  const flushPara = () => {
    if (para.length) {
      blocks.push({ type: 'p', lines: para })
      para = []
    }
  }
  const flushList = () => {
    if (list) {
      blocks.push({ type: 'list', ...list })
      list = null
    }
  }

  for (const raw of lines) {
    const line = raw.replace(/\s+$/, '')

    if (!line.trim()) {
      flushPara()
      flushList()
      continue
    }

    const heading = line.match(/^(#{1,4})\s+(.*)$/)
    if (heading) {
      flushPara()
      flushList()
      blocks.push({ type: 'h', level: heading[1].length, text: heading[2] })
      continue
    }

    if (/^\s*(---+|\*\*\*+|___+)\s*$/.test(line)) {
      flushPara()
      flushList()
      blocks.push({ type: 'hr' })
      continue
    }

    if (/^\s*>\s?/.test(line)) {
      flushPara()
      flushList()
      blocks.push({ type: 'quote', text: line.replace(/^\s*>\s?/, '') })
      continue
    }

    const num = line.match(NUMBER)
    if (num) {
      flushPara()
      if (!list?.ordered) {
        flushList()
        list = { ordered: true, items: [] }
      }
      list.items.push(line.replace(NUMBER, ''))
      continue
    }

    if (BULLET.test(line)) {
      flushPara()
      if (!list || list.ordered) {
        flushList()
        list = { ordered: false, items: [] }
      }
      list.items.push(line.replace(BULLET, ''))
      continue
    }

    // продолжение пункта списка (отступом)
    if (list && /^\s{2,}\S/.test(raw)) {
      list.items[list.items.length - 1] += ` ${line.trim()}`
      continue
    }

    flushList()
    para.push(line)
  }
  flushPara()
  flushList()

  return (
    <div className="md">
      {blocks.map((b, i) => {
        if (b.type === 'h') {
          const Tag = `h${Math.min(b.level + 2, 6)}`
          return <Tag key={i}>{inline(b.text, `h${i}`)}</Tag>
        }
        if (b.type === 'hr') return <hr key={i} />
        if (b.type === 'quote') return <blockquote key={i}>{inline(b.text, `q${i}`)}</blockquote>
        if (b.type === 'list') {
          const Tag = b.ordered ? 'ol' : 'ul'
          return (
            <Tag key={i}>
              {b.items.map((item, j) => (
                <li key={j}>{inline(item, `l${i}-${j}`)}</li>
              ))}
            </Tag>
          )
        }
        return (
          <p key={i}>
            {b.lines.map((line, j) => (
              <span key={j}>
                {inline(line, `p${i}-${j}`)}
                {j < b.lines.length - 1 && <br />}
              </span>
            ))}
          </p>
        )
      })}
    </div>
  )
}
