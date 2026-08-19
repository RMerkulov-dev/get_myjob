/**
 * Сборка читаемого текста из фрагментов, которые отдаёт pdf.js.
 *
 * pdf.js возвращает куски в порядке потока PDF, а не чтения. У любого
 * двухколоночного резюме это означает кашу: сначала заголовки сайдбара,
 * потом вперемешку их содержимое и основная колонка. Модель такое читает
 * плохо, поэтому порядок восстанавливаем по координатам:
 *
 *   1. ищем вертикальную полосу, которую не пересекает ни один фрагмент —
 *      это разделитель колонок; если её нет, страница одноколоночная;
 *   2. каждую колонку читаем сверху вниз, строки собираем по общей y;
 *   3. внутри строки фрагменты идут слева направо, пробел ставится только
 *      там, где между ними реальный зазор.
 *
 * Файл отдельный от pdf.js: здесь чистая арифметика без обращений к
 * библиотеке, поэтому её можно проверять тестом без загрузки воркера.
 */

/** Заголовки в дизайнерских PDF часто сохранены с разрядкой: «E D U C A T I O N». */
export function collapseTracking(text) {
  const tokens = text.trim().split(' ')
  if (tokens.length < 4) return text
  const singles = tokens.filter((t) => t.length === 1).length
  if (singles / tokens.length < 0.8) return text

  // одиночные буквы склеиваем, слова длиннее буквы остаются словами
  let out = ''
  for (const token of tokens) {
    if (token.length === 1) out += token
    else out += (out && !out.endsWith(' ') ? ' ' : '') + token + ' '
  }
  return out.trim()
}

/** Фрагменты → плоский список с координатами. Пустые строки — это метки конца строки. */
function toEntries(items) {
  const entries = []
  for (const item of items) {
    if (typeof item.str !== 'string' || !item.str.trim()) continue
    const x0 = item.transform?.[4] ?? 0
    const size = Math.abs(item.transform?.[3] ?? item.height ?? 10) || 10
    entries.push({
      str: collapseTracking(item.str),
      x0,
      x1: x0 + (item.width ?? 0),
      y: item.transform?.[5] ?? 0,
      size,
    })
  }
  return entries
}

/**
 * Полоса, которую не пересекает ни один фрагмент, — граница колонок.
 * Ищем только в середине страницы и требуем, чтобы обе половины были
 * заполнены: иначе отступ страницы примет за колонку.
 */
function findColumnSplit(entries, pageWidth) {
  if (entries.length < 12) return null

  // шапка резюме почти всегда идёт на всю ширину и пересекает любую полосу,
  // поэтому единичные сквозные элементы допустимы — их вынесем отдельно
  const allowedStraddles = Math.max(2, Math.round(entries.length * 0.06))
  let best = null

  for (let x = pageWidth * 0.25; x <= pageWidth * 0.65; x += 4) {
    const straddling = entries.filter((e) => e.x0 < x - 4 && e.x1 > x + 4).length
    if (straddling > allowedStraddles) continue

    const columns = entries.filter((e) => !(e.x0 < x - 4 && e.x1 > x + 4))
    const left = columns.filter((e) => e.x1 <= x).length
    const right = columns.length - left
    const share = Math.min(left, right) / (columns.length || 1)
    if (share < 0.2) continue

    // сначала меньше пересечений, потом ровнее колонки
    if (!best || straddling < best.straddling || (straddling === best.straddling && share > best.share)) {
      best = { x, share, straddling }
    }
  }

  return best?.x ?? null
}

/** Одна колонка: строки сверху вниз, внутри строки — слева направо. */
function regionToLines(entries) {
  const sorted = [...entries].sort((a, b) => b.y - a.y || a.x0 - b.x0)
  const lines = []

  for (const entry of sorted) {
    const line = lines[lines.length - 1]
    // одна строка = близкие y; допуск от размера шрифта, а не константа
    const tolerance = Math.max(1.5, entry.size * 0.5)
    if (line && Math.abs(line.y - entry.y) <= tolerance) {
      line.parts.push(entry)
      line.size = Math.max(line.size, entry.size)
    } else {
      lines.push({ y: entry.y, size: entry.size, parts: [entry] })
    }
  }

  return lines.map((line) => {
    const parts = line.parts.sort((a, b) => a.x0 - b.x0)
    let text = ''
    let prev = null
    for (const part of parts) {
      if (prev) {
        const gap = part.x0 - prev.x1
        // пробел только при реальном зазоре: иначе слова рвутся на слоги
        if (gap > prev.size * 0.2 && !text.endsWith(' ') && !part.str.startsWith(' ')) text += ' '
      }
      text += part.str
      prev = part
    }
    return { y: line.y, size: line.size, text: text.replace(/\s+/g, ' ').trim() }
  })
}

/** Строки колонки → текст: большой вертикальный зазор превращается в пустую строку. */
function linesToText(lines) {
  let out = ''
  let prev = null
  for (const line of lines) {
    if (!line.text) continue
    if (prev) out += line.y < prev.y - prev.size * 2.1 ? '\n\n' : '\n'
    out += line.text
    prev = line
  }
  return out
}

/** Фрагменты одной страницы → текст в порядке чтения. */
export function pageItemsToText(items, pageWidth) {
  const entries = toEntries(items)
  if (!entries.length) return ''

  const split = findColumnSplit(entries, pageWidth || 600)
  if (split === null) return linesToText(regionToLines(entries))

  const spans = (e) => e.x0 < split - 4 && e.x1 > split + 4
  const columns = entries.filter((e) => !spans(e))
  const full = entries.filter(spans)

  const top = Math.max(...columns.map((e) => e.y))
  const bottom = Math.min(...columns.map((e) => e.y))

  const left = columns.filter((e) => e.x1 <= split).concat(full.filter((e) => e.y <= top && e.y >= bottom))
  const right = columns.filter((e) => e.x1 > split)

  return [
    linesToText(regionToLines(full.filter((e) => e.y > top))),
    linesToText(regionToLines(left)),
    linesToText(regionToLines(right)),
    linesToText(regionToLines(full.filter((e) => e.y < bottom))),
  ]
    .filter(Boolean)
    .join('\n\n')
}
