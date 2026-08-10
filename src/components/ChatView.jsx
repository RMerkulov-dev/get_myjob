import { useEffect, useMemo, useRef, useState } from 'react'
import { streamComplete } from '../lib/openrouter'
import { clearChat, fetchChatMessages, saveChatMessage } from '../lib/db'
import { Markdown } from '../lib/markdown'
import { useI18n } from '../i18n'
import { Icon, PageHead } from './ui'

const LANG_NAMES = { en: 'English', uk: 'Ukrainian' }

/** Компактный дамп базы для контекста модели. */
function buildContext(skills, vacancies, t) {
  const rows = skills.map((s) => ({
    name: s.name,
    category: t(`categories.${s.category}`),
    level: s.level ?? 0,
    level_text: t(`levels.${Math.max(0, Math.min(5, s.level ?? 0))}`),
    learned: s.learned,
    must: s.importance === 'must',
    mentions: s.mentions ?? 0,
    positions: s.positions ?? [],
    notes: s.notes || undefined,
  }))

  const vacs = vacancies.slice(0, 40).map((v) => ({
    title: v.title,
    company: v.company || undefined,
    position: v.position_type,
    seniority: v.seniority || undefined,
    requirements: (v.vacancy_skills ?? []).map((l) => l.skills?.name).filter(Boolean),
  }))

  const learned = rows.filter((r) => r.learned).length
  const gaps = rows.filter((r) => !r.learned && r.level <= 1)

  return `CURRENT STATE OF THE USER'S DATABASE

Summary: ${rows.length} requirements total, ${learned} marked as learned, ${gaps.length} critical gaps (level 0-1 and not learned), ${vacancies.length} vacancies parsed.

REQUIREMENTS (JSON):
${JSON.stringify(rows)}

VACANCIES (JSON):
${JSON.stringify(vacs)}`
}

function systemPrompt(lang) {
  return `You are a personal career coach and learning mentor for a specialist looking for a Project Manager / Business Analyst job.

You have access to their personal database of requirements extracted from job ads: requirement name, category, self-assessed level (0-5), a "learned" flag, importance (must/nice), how many vacancies mentioned it, and which positions it belongs to (PM/BA).

How to answer:
— Rely ONLY on the data from the database; if something is missing, say so directly and suggest what to add.
— Compute priority like this: the more often a requirement appears and the more important it is (must), combined with a low knowledge level, the higher the priority.
— Answer in ${LANG_NAMES[lang] ?? 'English'}. Be specific and concrete. No filler, no generic motivational lines.
— Use short lists and clear structure. Write requirement names exactly as they appear in the database.
— When proposing a study plan, give timing, order and what counts as done.
— Never invent numbers: if you count, count from the data.`
}

export default function ChatView({ skills, vacancies, settings, toast }) {
  const { t, lang } = useI18n()
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [draft, setDraft] = useState('')
  const [loading, setLoading] = useState(true)
  const logRef = useRef(null)
  const abortRef = useRef(null)

  const context = useMemo(() => buildContext(skills, vacancies, t), [skills, vacancies, t])
  const suggestions = t('chat.suggestions')

  useEffect(() => {
    fetchChatMessages()
      .then(setMessages)
      .catch((e) => toast(e.message, 'error'))
      .finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const el = logRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages, draft])

  async function send(text) {
    const content = String(text ?? '').trim()
    if (!content || streaming) return

    setInput('')
    const userMsg = { id: `local-${messages.length}`, role: 'user', content }
    const history = [...messages, userMsg]
    setMessages(history)
    setStreaming(true)
    setDraft('')

    const controller = new AbortController()
    abortRef.current = controller
    let acc = ''

    try {
      saveChatMessage({ role: 'user', content }).catch(() => {})

      const full = await streamComplete(
        {
          apiKey: settings.apiKey,
          model: settings.model,
          signal: controller.signal,
          messages: [
            { role: 'system', content: systemPrompt(lang) },
            { role: 'system', content: context },
            ...history.slice(-16).map((m) => ({ role: m.role, content: m.content })),
          ],
        },
        (delta) => {
          acc += delta
          setDraft(acc)
        },
      )

      const answer = full || acc
      setMessages((prev) => [...prev, { id: `local-a-${prev.length}`, role: 'assistant', content: answer }])
      saveChatMessage({ role: 'assistant', content: answer }).catch(() => {})
    } catch (e) {
      if (e.name === 'AbortError') {
        if (acc.trim()) {
          setMessages((prev) => [...prev, { id: `local-a-${prev.length}`, role: 'assistant', content: acc }])
          saveChatMessage({ role: 'assistant', content: acc }).catch(() => {})
        }
      } else {
        toast(e.message, 'error')
      }
    } finally {
      setDraft('')
      setStreaming(false)
      abortRef.current = null
    }
  }

  async function handleClear() {
    if (!confirm(t('chat.clearConfirm'))) return
    try {
      await clearChat()
      setMessages([])
    } catch (e) {
      toast(e.message, 'error')
    }
  }

  return (
    <>
      <PageHead
        title={t('chat.title')}
        accent={t('chat.titleAccent')}
        aside={
          <div className="row" style={{ gap: 6 }}>
            {messages.length > 0 && (
              <button className="btn btn-sm btn-ghost btn-danger" onClick={handleClear} disabled={streaming}>
                <Icon name="trash" size={13} /> {t('chat.clear')}
              </button>
            )}
          </div>
        }
      >
        {t('chat.lead')}
      </PageHead>

      {messages.length === 0 && !loading && (
        <div className="suggestions">
          {suggestions.map((s) => (
            <button key={s} className="suggestion" onClick={() => send(s)} disabled={streaming}>
              {s}
            </button>
          ))}
        </div>
      )}

      <div className="chat">
        <div className="chat-log" ref={logRef}>
          {loading && <span className="mono">{t('chat.loading')}</span>}

          {!loading && messages.length === 0 && (
            <div style={{ margin: 'auto', textAlign: 'center', maxWidth: '40ch' }}>
              <div className="serif" style={{ fontSize: 30, marginBottom: 8 }}>
                {t('chat.contextTitle', { n: skills.length })}
              </div>
              <p className="muted" style={{ fontSize: 13.5 }}>
                {skills.length ? t('chat.contextHint') : t('chat.emptyHint')}
              </p>
            </div>
          )}

          {messages.map((m) => (
            <div className="msg" data-role={m.role} key={m.id ?? `${m.role}-${m.created_at}`}>
              <div className="msg-who">{m.role === 'user' ? t('chat.me') : t('chat.ai')}</div>
              <div className="msg-body">{m.role === 'assistant' ? <Markdown text={m.content} /> : m.content}</div>
            </div>
          ))}

          {streaming && (
            <div className="msg" data-role="assistant">
              <div className="msg-who">{t('chat.ai')}</div>
              <div className={`msg-body${draft ? ' cursor-blink' : ''}`}>
                {draft ? <Markdown text={draft} /> : <span className="mono">{t('chat.thinking')}</span>}
              </div>
            </div>
          )}
        </div>

        <form
          className="chat-form"
          onSubmit={(e) => {
            e.preventDefault()
            send(input)
          }}
        >
          <textarea
            className="chat-input"
            placeholder={t('chat.placeholder')}
            value={input}
            rows={1}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                send(input)
              }
            }}
          />
          {streaming ? (
            <button type="button" className="btn" onClick={() => abortRef.current?.abort()}>
              <Icon name="close" size={13} /> {t('chat.stop')}
            </button>
          ) : (
            <button type="submit" className="btn btn-primary" disabled={!input.trim()}>
              <Icon name="send" size={14} /> {t('chat.send')}
            </button>
          )}
        </form>
      </div>

      <div className="mono" style={{ marginTop: 10 }}>
        {t('chat.footer', { skills: skills.length, vacancies: vacancies.length, model: settings.model })}
      </div>
    </>
  )
}
