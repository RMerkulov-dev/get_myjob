/**
 * Извлечение текста из PDF на клиенте.
 *
 * pdf.js весит около 400 КБ, поэтому он подгружается динамически — только
 * когда пользователь реально уронил файл в форму. Воркер отдаётся Vite как
 * обычный ассет (`?url`), иначе pdf.js пытается найти его по import.meta.url
 * и на проде спотыкается о хэши в именах файлов.
 */

import workerUrl from 'pdfjs-dist/build/pdf.worker.mjs?url'
import { isDocx, isLegacyDoc, readDocxText } from './docx'
import { pageItemsToText } from './pdfText'
import { t } from '../i18n'

export const MAX_FILE_BYTES = 15 * 1024 * 1024
const MAX_PAGES = 16
const MAX_CHARS = 60000

let libPromise = null

function lib() {
  if (!libPromise) {
    libPromise = import('pdfjs-dist').then((pdfjs) => {
      pdfjs.GlobalWorkerOptions.workerSrc = workerUrl
      return pdfjs
    })
  }
  return libPromise
}

/** Пустые строки схлопываем, но абзацы сохраняем — модель читает структуру. */
function tidy(raw) {
  return raw
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/** Текст страниц в один документ: между страницами — пустая строка. */
function joinPages(chunks) {
  return tidy(chunks.filter((c) => c.trim()).join('\n\n'))
}

/** File → { text, pages, truncated }. Бросает понятную ошибку для сканов. */
export async function extractPdfText(file) {
  if (file.size > MAX_FILE_BYTES) throw new Error(t('cv.errors.tooBig'))

  const pdfjs = await lib()
  const data = new Uint8Array(await file.arrayBuffer())

  // задачу загрузки держим отдельно: закрывать документ и воркер умеет только она
  const task = pdfjs.getDocument({ data, isEvalSupported: false, disableFontFace: true })
  let doc
  try {
    doc = await task.promise
  } catch (e) {
    task.destroy()
    if (String(e?.name) === 'PasswordException') throw new Error(t('cv.errors.encrypted'))
    throw new Error(t('cv.errors.badPdf'))
  }

  const pages = Math.min(doc.numPages, MAX_PAGES)
  const chunks = []
  for (let n = 1; n <= pages; n++) {
    const page = await doc.getPage(n)
    const content = await page.getTextContent()
    // ширина нужна, чтобы понять, где может быть граница колонок
    chunks.push(pageItemsToText(content.items, page.getViewport({ scale: 1 }).width))
    page.cleanup()
  }
  const total = doc.numPages
  await task.destroy()

  const text = joinPages(chunks)
  // В сканах текстового слоя нет вовсе — объясняем, что делать, вместо пустого экрана
  if (text.replace(/\s/g, '').length < 120) throw new Error(t('cv.errors.noTextLayer'))

  return {
    text: text.slice(0, MAX_CHARS),
    pages: total,
    truncated: total > pages || text.length > MAX_CHARS,
  }
}

/** Текстовые файлы читаем напрямую — .txt и .md тоже частый формат резюме. */
export async function readTextFile(file) {
  if (file.size > MAX_FILE_BYTES) throw new Error(t('cv.errors.tooBig'))
  const text = tidy(await file.text())
  if (!text) throw new Error(t('cv.errors.emptyFile'))
  return { text: text.slice(0, MAX_CHARS), pages: 0, truncated: text.length > MAX_CHARS }
}

export function isPdf(file) {
  return file.type === 'application/pdf' || /\.pdf$/i.test(file.name)
}

export function isPlainText(file) {
  return file.type.startsWith('text/') || /\.(txt|md|markdown)$/i.test(file.name)
}

/** Единая точка входа: PDF, DOCX или текст, всё остальное — понятная ошибка. */
export async function readDocumentFile(file) {
  if (isPdf(file)) return extractPdfText(file)
  if (isDocx(file)) {
    if (file.size > MAX_FILE_BYTES) throw new Error(t('cv.errors.tooBig'))
    const text = tidy(await readDocxText(file))
    return { text: text.slice(0, MAX_CHARS), pages: 0, truncated: text.length > MAX_CHARS }
  }
  if (isLegacyDoc(file)) throw new Error(t('cv.errors.legacyDoc'))
  if (isPlainText(file)) return readTextFile(file)
  throw new Error(t('cv.errors.unsupported'))
}
