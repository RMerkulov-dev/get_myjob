/**
 * Сборка .docx без внешних библиотек — обратная сторона docx.js.
 *
 * Читать .docx мы уже умеем силами браузера; писать — та же история.
 * `.docx` — это zip с несколькими XML внутри, а zip браузер собирает сам:
 * CompressionStream('deflate-raw') сжимает, CRC32 считается в пятнадцать
 * строк. Библиотека вроде `docx` добавила бы к бандлу под мегабайт ради
 * возможностей, которые в резюме не нужны: нам хватает заголовков, списков
 * и правого табулятора под даты.
 *
 * Что важнее удобства API — вёрстка должна читаться машиной. Резюме сначала
 * разбирает ATS, поэтому здесь нет ни таблиц, ни текстовых блоков, ни двух
 * колонок: один поток абзацев, стандартные Heading 1/2 (парсеры ищут именно
 * их), настоящие списки через numbering.xml и даты правым табулятором,
 * а не в отдельной колонке.
 */

/* ------------------------------------------------------------------- zip */

let crcLookup = null

function crcTable() {
  if (crcLookup) return crcLookup
  crcLookup = new Uint32Array(256)
  for (let i = 0; i < 256; i++) {
    let c = i
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    crcLookup[i] = c >>> 0
  }
  return crcLookup
}

/** CRC32 обязателен даже для несжатых записей — Word без него файл не откроет. */
function crc32(bytes) {
  const table = crcTable()
  let c = 0xffffffff
  for (let i = 0; i < bytes.length; i++) c = table[(c ^ bytes[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

async function deflateRaw(bytes) {
  if (typeof CompressionStream === 'undefined') return null
  const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate-raw'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

/**
 * files: [{ name, text }] → Blob с zip-архивом.
 *
 * Время файла проставляем нулями, а не текущей датой: одинаковый вход должен
 * давать одинаковый архив, иначе два скачивания одного резюме различаются
 * байтами без причины. Word на это поле не смотрит.
 */
async function zipBlob(files, mime) {
  const encoder = new TextEncoder()
  const parts = []
  const central = []
  let offset = 0

  for (const file of files) {
    const raw = encoder.encode(file.text)
    const crc = crc32(raw)
    let data = await deflateRaw(raw)
    let method = 8
    // на коротких XML deflate иногда только раздувает — тогда кладём как есть
    if (!data || data.length >= raw.length) {
      data = raw
      method = 0
    }
    const name = encoder.encode(file.name)

    const local = new Uint8Array(30 + name.length)
    const lv = new DataView(local.buffer)
    lv.setUint32(0, 0x04034b50, true)
    lv.setUint16(4, 20, true) // версия, нужная для распаковки
    lv.setUint16(6, 0x0800, true) // имена в UTF-8
    lv.setUint16(8, method, true)
    lv.setUint32(14, crc, true)
    lv.setUint32(18, data.length, true)
    lv.setUint32(22, raw.length, true)
    lv.setUint16(26, name.length, true)
    local.set(name, 30)
    parts.push(local, data)

    const cd = new Uint8Array(46 + name.length)
    const cv = new DataView(cd.buffer)
    cv.setUint32(0, 0x02014b50, true)
    cv.setUint16(4, 20, true)
    cv.setUint16(6, 20, true)
    cv.setUint16(8, 0x0800, true)
    cv.setUint16(10, method, true)
    cv.setUint32(16, crc, true)
    cv.setUint32(20, data.length, true)
    cv.setUint32(24, raw.length, true)
    cv.setUint16(28, name.length, true)
    cv.setUint32(42, offset, true)
    cd.set(name, 46)
    central.push(cd)

    offset += local.length + data.length
  }

  const directorySize = central.reduce((sum, c) => sum + c.length, 0)
  const eocd = new Uint8Array(22)
  const ev = new DataView(eocd.buffer)
  ev.setUint32(0, 0x06054b50, true)
  ev.setUint16(8, files.length, true)
  ev.setUint16(10, files.length, true)
  ev.setUint32(12, directorySize, true)
  ev.setUint32(16, offset, true)

  return new Blob([...parts, ...central, eocd], { type: mime })
}

/* ------------------------------------------------------------------- xml */

const XML_ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }

/** Управляющие символы XML не переносит вовсе — из PDF они прилетают регулярно. */
function esc(value) {
  return String(value ?? '')
    .replace(/[&<>"]/g, (c) => XML_ESCAPES[c])
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '')
}

const HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
const W_NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"'

/** Текст в прогоны: перевод строки внутри абзаца — это w:br, а не новый абзац. */
function runs(text, props = '') {
  return String(text ?? '')
    .split('\n')
    .map(
      (line, i) =>
        `${i ? `<w:r>${props}<w:br/></w:r>` : ''}<w:r>${props}<w:t xml:space="preserve">${esc(line)}</w:t></w:r>`,
    )
    .join('')
}

/* Ширина текста на A4 с полями 1080 twips: 11906 − 2×1080 ≈ 9740. */
const RIGHT_TAB = 9740

const rPr = ({ bold, italic, size, color, caps, spacing } = {}) =>
  `<w:rPr>${bold ? '<w:b/>' : ''}${italic ? '<w:i/>' : ''}${caps ? '<w:caps/>' : ''}` +
  `${spacing ? `<w:spacing w:val="${spacing}"/>` : ''}` +
  `${color ? `<w:color w:val="${color}"/>` : ''}` +
  `${size ? `<w:sz w:val="${size}"/><w:szCs w:val="${size}"/>` : ''}</w:rPr>`

const pPr = ({ style, before = 0, after = 0, bullet, tab, border, indent } = {}) =>
  `<w:pPr>${style ? `<w:pStyle w:val="${style}"/>` : ''}` +
  `${bullet ? '<w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr>' : ''}` +
  `${border ? '<w:pBdr><w:bottom w:val="single" w:sz="6" w:space="3" w:color="BFBFBF"/></w:pBdr>' : ''}` +
  `${tab ? `<w:tabs><w:tab w:val="right" w:pos="${RIGHT_TAB}"/></w:tabs>` : ''}` +
  `${indent ? `<w:ind w:left="${indent}" w:hanging="200"/>` : ''}` +
  `<w:spacing w:before="${before}" w:after="${after}"/></w:pPr>`

/* ------------------------------------------------------- модель документа
 *
 * Резюме приходит от модели структурой, а не готовым текстом: только так
 * его можно и показать на экране, и собрать в docx, и отдать markdown-ом
 * из одного источника. Блоки:
 *
 *   para   — абзац (саммари, описание)
 *   bullet — пункт списка
 *   entry  — шапка позиции: слева должность и компания, справа период,
 *            под ней необязательная строка контекста (домен, команда)
 *   inline — «Инструменты: Jira, Confluence» одной строкой
 * ------------------------------------------------------------------------ */

/** Один блок → абзацы docx. */
function blockXml(block) {
  const text = (block.text ?? '').trim()

  if (block.type === 'bullet') {
    if (!text) return ''
    return `<w:p>${pPr({ style: 'ListParagraph', bullet: true, after: 40, indent: 340 })}${runs(text)}</w:p>`
  }

  if (block.type === 'entry') {
    const right = (block.right ?? '').trim()
    const meta = (block.meta ?? '').trim()
    const head =
      `<w:p>${pPr({ before: 120, after: 20, tab: !!right })}` +
      `${runs(text, rPr({ bold: true }))}` +
      `${right ? `<w:r><w:tab/></w:r>${runs(right, rPr({ color: '595959' }))}` : ''}</w:p>`
    return (
      head +
      (meta ? `<w:p>${pPr({ after: 60 })}${runs(meta, rPr({ italic: true, size: 19, color: '595959' }))}</w:p>` : '')
    )
  }

  if (block.type === 'inline') {
    const label = (block.label ?? '').trim()
    if (!label && !text) return ''
    return `<w:p>${pPr({ after: 60 })}${label ? runs(`${label}: `, rPr({ bold: true })) : ''}${runs(text)}</w:p>`
  }

  if (!text) return ''
  return `<w:p>${pPr({ after: 100 })}${runs(text)}</w:p>`
}

function documentXml(doc) {
  const body = []

  if (doc.name) {
    body.push(`<w:p>${pPr({ style: 'Heading1', after: 40 })}${runs(doc.name, rPr({ bold: true, size: 40 }))}</w:p>`)
  }
  if (doc.headline) {
    body.push(`<w:p>${pPr({ after: 60 })}${runs(doc.headline, rPr({ size: 24, color: '404040' }))}</w:p>`)
  }
  const contacts = (doc.contacts ?? []).filter(Boolean)
  if (contacts.length) {
    body.push(`<w:p>${pPr({ after: 200 })}${runs(contacts.join('  ·  '), rPr({ size: 19, color: '404040' }))}</w:p>`)
  }

  for (const section of doc.sections ?? []) {
    if (section.heading) {
      body.push(
        `<w:p>${pPr({ style: 'Heading2', before: 260, after: 100, border: true })}` +
          `${runs(section.heading, rPr({ bold: true, size: 23, caps: true, spacing: 10 }))}</w:p>`,
      )
    }
    for (const block of section.blocks ?? []) body.push(blockXml(block))
  }

  // A4, поля 1.9 см: плотнее — и человек, и парсер начинают спотыкаться
  const sect =
    '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/>' +
    '<w:pgMar w:top="1080" w:right="1080" w:bottom="1080" w:left="1080" w:header="708" w:footer="708" w:gutter="0"/>' +
    '</w:sectPr>'

  return `${HEAD}<w:document ${W_NS}><w:body>${body.join('')}${sect}</w:body></w:document>`
}

/* --------------------------------------------------------- служебные части */

const CONTENT_TYPES = `${HEAD}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>`

const ROOT_RELS = `${HEAD}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>`

const DOC_RELS = `${HEAD}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/></Relationships>`

/**
 * Heading 1 / Heading 2 названы именно так не для красоты: часть парсеров
 * резюме определяет секции по имени стиля, а не по кеглю.
 */
const STYLES = `${HEAD}<w:styles ${W_NS}><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri"/><w:sz w:val="21"/><w:szCs w:val="21"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="0" w:line="264" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style><w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:qFormat/><w:pPr><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:b/><w:sz w:val="40"/><w:szCs w:val="40"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:qFormat/><w:pPr><w:outlineLvl w:val="1"/></w:pPr><w:rPr><w:b/><w:caps/><w:sz w:val="23"/><w:szCs w:val="23"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="ListParagraph"><w:name w:val="List Paragraph"/><w:basedOn w:val="Normal"/><w:qFormat/></w:style></w:styles>`

/* Настоящий список, а не дефис руками: копирование в чужой шаблон и разбор
   парсером как раз на этом различии и спотыкаются. */
const NUMBERING = `${HEAD}<w:numbering ${W_NS}><w:abstractNum w:abstractNumId="0"><w:multiLevelType w:val="hybridMultilevel"/><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="bullet"/><w:lvlText w:val="&#xF0B7;"/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="340" w:hanging="200"/></w:pPr><w:rPr><w:rFonts w:ascii="Symbol" w:hAnsi="Symbol" w:hint="default"/></w:rPr></w:lvl></w:abstractNum><w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num></w:numbering>`

const coreXml = (title, author) =>
  `${HEAD}<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>${esc(title)}</dc:title><dc:creator>${esc(author)}</dc:creator><cp:lastModifiedBy>${esc(author)}</cp:lastModifiedBy></cp:coreProperties>`

/* ---------------------------------------------------------------- экспорт */

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

/** Модель резюме → Blob с .docx. */
export function buildCvDocx(doc, { title } = {}) {
  return zipBlob(
    [
      { name: '[Content_Types].xml', text: CONTENT_TYPES },
      { name: '_rels/.rels', text: ROOT_RELS },
      { name: 'docProps/core.xml', text: coreXml(title || doc.name || 'CV', doc.name || '') },
      { name: 'word/_rels/document.xml.rels', text: DOC_RELS },
      { name: 'word/styles.xml', text: STYLES },
      { name: 'word/numbering.xml', text: NUMBERING },
      { name: 'word/document.xml', text: documentXml(doc) },
    ],
    DOCX_MIME,
  )
}

/** Модель резюме → markdown: то же содержимое, но чтобы унести в редактор. */
export function cvToMarkdown(doc) {
  const out = []
  if (doc.name) out.push(`# ${doc.name}`)
  if (doc.headline) out.push(`**${doc.headline}**`)
  const contacts = (doc.contacts ?? []).filter(Boolean)
  if (contacts.length) out.push(contacts.join(' · '))
  out.push('')

  for (const section of doc.sections ?? []) {
    if (section.heading) out.push(`## ${section.heading}`, '')
    for (const block of section.blocks ?? []) {
      const text = (block.text ?? '').trim()
      if (block.type === 'bullet') {
        if (text) out.push(`- ${text}`)
      } else if (block.type === 'entry') {
        out.push('', `### ${text}${block.right ? ` — ${block.right}` : ''}`)
        if (block.meta) out.push(`*${block.meta}*`)
        out.push('')
      } else if (block.type === 'inline') {
        out.push(`**${(block.label ?? '').trim()}:** ${text}`)
      } else if (text) {
        out.push(text, '')
      }
    }
    out.push('')
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim()
}

/** Blob → скачанный файл. Ссылку освобождаем: иначе blob висит до перезагрузки. */
export function downloadBlob(blob, fileName) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** Имя файла: «CV_Roman_Merkulov_Acme.docx». Без экзотики — его увидит рекрутер. */
export function suggestFileName(doc, vacancy) {
  const clean = (value) =>
    String(value ?? '')
      .normalize('NFKD')
      .replace(/[^\p{L}\p{N}]+/gu, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 40)

  return `${['CV', clean(doc.name), clean(vacancy)].filter(Boolean).join('_')}.docx`
}
