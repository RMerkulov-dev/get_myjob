/**
 * Извлечение текста из .docx без внешних библиотек.
 *
 * .docx — это обычный zip, внутри которого `word/document.xml`. Браузер умеет
 * и то, и другое сам: распаковку даёт DecompressionStream('deflate-raw'),
 * разбор XML — DOMParser. Библиотека вроде mammoth добавила бы к бандлу
 * несколько сотен килобайт ради разметки, которая нам не нужна: модели
 * нужен текст с абзацами и списками, а не стили.
 *
 * Читаем центральный каталог zip, а не локальные заголовки: при потоковой
 * записи (её делают Word и Google Docs) размеры в локальном заголовке
 * заполнены нулями, и по ним содержимое не найти.
 */

import { t } from '../i18n'

const EOCD_SIGNATURE = 0x06054b50
const CDFH_SIGNATURE = 0x02014b50

/** Конец центрального каталога лежит в последних 64 КБ — ищем подпись с конца. */
function findEndOfCentralDirectory(view) {
  const from = Math.max(0, view.byteLength - 66000)
  for (let i = view.byteLength - 22; i >= from; i--) {
    if (view.getUint32(i, true) === EOCD_SIGNATURE) return i
  }
  return -1
}

/** Записи центрального каталога: имя, метод сжатия, смещение и размеры. */
function readCentralDirectory(view) {
  const eocd = findEndOfCentralDirectory(view)
  if (eocd < 0) throw new Error(t('cv.errors.badDocx'))

  const count = view.getUint16(eocd + 10, true)
  let offset = view.getUint32(eocd + 16, true)
  const decoder = new TextDecoder()
  const entries = []

  for (let n = 0; n < count; n++) {
    if (view.getUint32(offset, true) !== CDFH_SIGNATURE) break
    const nameLength = view.getUint16(offset + 28, true)
    const extraLength = view.getUint16(offset + 30, true)
    const commentLength = view.getUint16(offset + 32, true)
    entries.push({
      name: decoder.decode(new Uint8Array(view.buffer, offset + 46, nameLength)),
      method: view.getUint16(offset + 10, true),
      compressedSize: view.getUint32(offset + 20, true),
      localOffset: view.getUint32(offset + 42, true),
    })
    offset += 46 + nameLength + extraLength + commentLength
  }

  return entries
}

/** Содержимое одной записи: stored отдаём как есть, deflate распаковываем. */
async function readEntry(buffer, view, entry) {
  // данные начинаются после локального заголовка, длина которого переменная
  const nameLength = view.getUint16(entry.localOffset + 26, true)
  const extraLength = view.getUint16(entry.localOffset + 28, true)
  const start = entry.localOffset + 30 + nameLength + extraLength
  const bytes = new Uint8Array(buffer, start, entry.compressedSize)

  if (entry.method === 0) return new TextDecoder().decode(bytes)
  if (entry.method !== 8) throw new Error(t('cv.errors.badDocx'))
  if (typeof DecompressionStream === 'undefined') throw new Error(t('cv.errors.noUnzip'))

  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'))
  return new Response(stream).text()
}

const local = (node) => node.localName || node.nodeName.replace(/^.*:/, '')

/** Абзац Word → строка. w:tab и w:br несут структуру, поэтому не теряем их. */
function paragraphText(paragraph) {
  let text = ''
  const walk = (node) => {
    for (const child of node.childNodes) {
      if (child.nodeType !== 1) continue
      const name = local(child)
      if (name === 't') text += child.textContent
      else if (name === 'tab') text += ' '
      else if (name === 'br' || name === 'cr') text += '\n'
      else walk(child)
    }
  }
  walk(paragraph)

  const clean = text.replace(/[ \t]+/g, ' ').trim()
  if (!clean) return ''
  // пункт списка помечаем дефисом: в резюме это половина смысла
  const isListItem = !!paragraph.getElementsByTagName('w:numPr').length
  return isListItem ? `- ${clean}` : clean
}

/** document.xml → текст: абзацы построчно, строки таблиц через « · ». */
function documentText(xml) {
  const doc = new DOMParser().parseFromString(xml, 'application/xml')
  if (doc.querySelector('parsererror')) throw new Error(t('cv.errors.badDocx'))

  const lines = []
  const seenRows = new Set()

  const walk = (node) => {
    for (const child of node.childNodes) {
      if (child.nodeType !== 1) continue
      const name = local(child)

      if (name === 'p') {
        const text = paragraphText(child)
        if (text) lines.push(text)
        continue
      }

      if (name === 'tr') {
        // строка таблицы: ячейки в одну строку, иначе резюме-таблица рассыпается
        const cells = [...child.childNodes]
          .filter((c) => c.nodeType === 1 && local(c) === 'tc')
          .map((c) =>
            [...c.getElementsByTagName('*')]
              .filter((n) => local(n) === 'p')
              .map((p) => paragraphText(p).replace(/^- /, ''))
              .filter(Boolean)
              .join(' '),
          )
          .filter(Boolean)
        const row = cells.join(' · ')
        if (row && !seenRows.has(row)) {
          seenRows.add(row)
          lines.push(row)
        }
        continue
      }

      walk(child)
    }
  }

  walk(doc.documentElement)
  return lines.join('\n')
}

/**
 * File (.docx) → текст. Колонтитулы читаем тоже: в резюме там часто лежат
 * имя и контакты, и молча их терять — то же самое, что не прочитать файл.
 */
export async function readDocxText(file) {
  const buffer = await file.arrayBuffer()
  const view = new DataView(buffer)
  const entries = readCentralDirectory(view)

  const body = entries.find((e) => e.name === 'word/document.xml')
  if (!body) throw new Error(t('cv.errors.badDocx'))

  const headers = entries.filter((e) => /^word\/(header|footer)\d*\.xml$/.test(e.name))
  const parts = []

  for (const entry of [...headers, body]) {
    try {
      parts.push(documentText(await readEntry(buffer, view, entry)))
    } catch (e) {
      // колонтитул сломался — это не повод не прочитать сам документ
      if (entry === body) throw e
    }
  }

  const text = parts.filter((p) => p.trim()).join('\n\n')
  if (text.replace(/\s/g, '').length < 20) throw new Error(t('cv.errors.emptyFile'))
  return text
}

export function isDocx(file) {
  return (
    file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    /\.docx$/i.test(file.name)
  )
}

/** Старый бинарный .doc распаковкой не берётся — о нём говорим отдельно. */
export function isLegacyDoc(file) {
  return file.type === 'application/msword' || /\.doc$/i.test(file.name)
}
