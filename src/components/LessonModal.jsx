import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { generateExplanation, generateQuiz, generateRecruiterQuestions } from '../lib/openrouter'
import { Markdown } from '../lib/markdown'
import { useI18n } from '../i18n'
import { Icon, Spinner } from './ui'

// v3: урок собирается по частям, кэш прошлых версий не подходит
const CACHE_PREFIX = 'skill-dossier.lesson.v3.'
const TIMEOUT_MS = 120000

function readCache(slug, lang) {
  try {
    const raw = localStorage.getItem(`${CACHE_PREFIX}${lang}.${slug}`)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function writeCache(slug, lang, lesson) {
  try {
    localStorage.setItem(`${CACHE_PREFIX}${lang}.${slug}`, JSON.stringify(lesson))
  } catch {
    /* переполнилось хранилище — не критично */
  }
}

/** Плашка для части, которая ещё не запрашивалась: грузится по кнопке. */
function LoadPrompt({ label, hint, onLoad }) {
  return (
    <div className="load-prompt">
      <button className="btn btn-accent btn-sm" onClick={onLoad}>
        <Icon name="spark" size={13} /> {label}
      </button>
      <span className="mono">{hint}</span>
    </div>
  )
}

/** Заголовок блока с индикатором: каждая часть грузится и падает независимо. */
function BlockHead({ title, state, onRetry, retryLabel }) {
  return (
    <div className="row" style={{ gap: 9, marginBottom: 12 }}>
      <h3 className="lesson-h" style={{ margin: 0 }}>{title}</h3>
      {state === 'loading' && <Spinner />}
      {state === 'error' && (
        <button className="btn btn-ghost btn-sm" onClick={onRetry}>
          <Icon name="refresh" size={12} /> {retryLabel}
        </button>
      )}
      <span className="spacer" />
    </div>
  )
}

export default function LessonModal({ skill, settings, onClose, onPatch, toast }) {
  const { t, lang } = useI18n()
  const cached = readCache(skill.slug, lang)

  const [questions, setQuestions] = useState(cached?.questions ?? null)
  const [explanation, setExplanation] = useState(cached?.explanation ?? '')
  const [quiz, setQuiz] = useState(cached?.quiz ?? null)
  const [state, setState] = useState({ questions: 'idle', explanation: 'idle', quiz: 'idle' })

  const [answers, setAnswers] = useState({})
  const [checked, setChecked] = useState(false)
  const [sourced, setSourced] = useState(false) // объяснение дополнено веб-поиском
  // у каждой части свой контроллер: один общий переиспользовать нельзя —
  // после отмены (в т.ч. двойного вызова эффекта в StrictMode) он остаётся
  // «отменённым навсегда», и следующий запрос падает не начавшись
  const controllers = useRef(new Set())
  const bodyRef = useRef(null)
  const latest = useRef({ questions: cached?.questions ?? null, explanation: cached?.explanation ?? '', quiz: cached?.quiz ?? null })

  const setPart = (key, value) => setState((prev) => ({ ...prev, [key]: value }))

  function cache() {
    const { questions: q, explanation: e, quiz: z } = latest.current
    if (q || e || z) writeCache(skill.slug, lang, { questions: q, explanation: e, quiz: z })
  }

  // закрытие по Escape + блокировка прокрутки страницы под попапом
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
      abortAll()
    }
  }, [onClose])

  function abortAll() {
    for (const c of controllers.current) c.abort()
    controllers.current.clear()
  }

  /** Общая обёртка: свой контроллер, таймаут, состояние блока, запись в кэш. */
  async function run(key, task) {
    const controller = new AbortController()
    controllers.current.add(controller)
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
    setPart(key, 'loading')
    try {
      await task(controller.signal)
      setPart(key, 'done')
      cache()
    } catch (e) {
      // отмену не показываем как ошибку: попап закрыли или пошёл повторный запрос
      if (e.name === 'AbortError') return
      setPart(key, 'error')
      toast(e.message, 'error')
    } finally {
      clearTimeout(timer)
      controllers.current.delete(controller)
    }
  }

  const loadQuestions = () =>
    run('questions', async (signal) => {
      const data = await generateRecruiterQuestions({ apiKey: settings.apiKey, model: settings.fastModel, skill, lang, signal })
      latest.current.questions = data
      setQuestions(data)
    })

  const loadExplanation = ({ web = false } = {}) =>
    run('explanation', async (signal) => {
      let acc = ''
      setExplanation('')
      const full = await generateExplanation(
        { apiKey: settings.apiKey, model: settings.model, skill, lang, web, signal },
        (delta) => {
          acc += delta
          setExplanation(acc)
        },
      )
      latest.current.explanation = full || acc
      setExplanation(full || acc)
      setSourced(web)
    })

  const loadQuiz = () =>
    run('quiz', async (signal) => {
      const data = await generateQuiz({ apiKey: settings.apiKey, model: settings.fastModel, skill, lang, signal })
      latest.current.quiz = data
      setQuiz(data)
      setAnswers({})
      setChecked(false)
    })

  /*
   * Сразу грузим только объяснение. Вопросы рекрутера и квиз — по кнопке:
   * это отдельные запросы к модели, и платить за них имеет смысл лишь тогда,
   * когда они действительно нужны.
   */
  useEffect(() => {
    if (!cached?.explanation) loadExplanation()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function regenerate() {
    abortAll()
    const hadQuestions = Boolean(questions?.length)
    const hadQuiz = Boolean(quiz?.length)
    latest.current = { questions: null, explanation: '', quiz: null }
    setQuestions(null)
    setExplanation('')
    setQuiz(null)
    setAnswers({})
    setChecked(false)
    setState({ questions: 'idle', explanation: 'idle', quiz: 'idle' })
    bodyRef.current?.scrollTo({ top: 0 })
    loadExplanation()
    // то, что пользователь уже открывал, обновляем тоже; остальное — по кнопке
    if (hadQuestions) loadQuestions()
    if (hadQuiz) loadQuiz()
  }

  const quizItems = quiz ?? []
  const answeredAll = quizItems.length > 0 && quizItems.every((_, i) => answers[i] !== undefined)
  const score = quizItems.reduce((acc, q, i) => acc + (answers[i] === q.correct ? 1 : 0), 0)
  const passed = quizItems.length > 0 && score >= Math.ceil(quizItems.length * 0.8)
  const busy = Object.values(state).some((v) => v === 'loading')

  /*
   * Портал в body обязателен: у <main> есть анимация с transform, а такой
   * элемент становится containing block для position: fixed — попап уезжал
   * вниз страницы вместо центра экрана.
   */
  return createPortal(
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={skill.name}>
        <header className="modal-head">
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="mono">{t('lesson.eyebrow')}</div>
            <h2 className="modal-title">{skill.name}</h2>
          </div>
          <div className="row" style={{ gap: 4 }}>
            <button className="btn btn-sm btn-ghost" onClick={regenerate} disabled={busy} title={t('lesson.refresh')}>
              <Icon name="refresh" size={13} /> {t('lesson.refresh')}
            </button>
            <button className="icon-btn" onClick={onClose} aria-label={t('lesson.close')} title={t('lesson.close')}>
              <Icon name="close" size={14} />
            </button>
          </div>
        </header>

        <div className="modal-body" ref={bodyRef}>
          {/* -------------------------------------- 1. вопросы рекрутера */}
          <section className="rq">
            <BlockHead
              title={t('lesson.recruiter')}
              state={state.questions}
              onRetry={loadQuestions}
              retryLabel={t('lesson.retry')}
            />
            {questions?.length > 0
              ? questions.map((q, i) => (
                  <div className="rq-card" key={i}>
                    <div className="rq-question">
                      <span className="rq-quote serif">“</span>
                      {q.question}
                    </div>
                    {q.checks && (
                      <div className="rq-row">
                        <span className="rq-label mono">{t('lesson.checks')}</span>
                        <span>{q.checks}</span>
                      </div>
                    )}
                    {q.answer && (
                      <div className="rq-row">
                        <span className="rq-label mono">{t('lesson.howToAnswer')}</span>
                        <span>{q.answer}</span>
                      </div>
                    )}
                  </div>
                ))
              : state.questions === 'loading' ? (
                  <div style={{ display: 'grid', gap: 8 }}>
                    {[0, 1, 2].map((i) => (
                      <div key={i} className="skeleton" style={{ height: 92, animationDelay: `${i * 0.1}s` }} />
                    ))}
                  </div>
                ) : (
                  state.questions === 'idle' && (
                    <LoadPrompt
                      label={t('lesson.loadQuestions')}
                      hint={t('lesson.onDemandHint')}
                      onLoad={loadQuestions}
                    />
                  )
                )}
            {state.questions === 'error' && <p className="muted" style={{ fontSize: 13.5 }}>{t('lesson.partFailed')}</p>}
          </section>

          {/* -------------------------------------- 2. объяснение (стрим) */}
          <section className="lesson-block">
            <div className="row" style={{ gap: 9, marginBottom: 12 }}>
              <h3 className="lesson-h" style={{ margin: 0 }}>{t('lesson.explanation')}</h3>
              {state.explanation === 'loading' && <Spinner />}
              <span className="spacer" />
              {state.explanation === 'error' && (
                <button className="btn btn-ghost btn-sm" onClick={() => loadExplanation()}>
                  <Icon name="refresh" size={12} /> {t('lesson.retry')}
                </button>
              )}
              {state.explanation === 'done' && !sourced && (
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => loadExplanation({ web: true })}
                  title={t('lesson.addSourcesHint')}
                >
                  <Icon name="search" size={12} /> {t('lesson.addSources')}
                </button>
              )}
            </div>
            {explanation ? (
              <div className={`lesson-text${state.explanation === 'loading' ? ' cursor-blink' : ''}`}>
                <Markdown text={explanation} />
              </div>
            ) : state.explanation === 'loading' ? (
              <>
                <span className="mono" style={{ display: 'block', marginBottom: 10 }}>{t('lesson.searching')}</span>
                <div style={{ display: 'grid', gap: 8 }}>
                  {[0, 1, 2].map((i) => (
                    <div key={i} className="skeleton" style={{ height: 58, animationDelay: `${i * 0.1}s` }} />
                  ))}
                </div>
              </>
            ) : (
              <p className="muted" style={{ fontSize: 13.5 }}>{t('lesson.partFailed')}</p>
            )}
          </section>

          {/* -------------------------------------- 3. квиз */}
          <section className="lesson-block quiz">
            <BlockHead
              title={t('lesson.quiz')}
              state={state.quiz}
              onRetry={loadQuiz}
              retryLabel={t('lesson.retry')}
            />

            {quizItems.length === 0 && state.quiz === 'loading' && (
              <div style={{ display: 'grid', gap: 8 }}>
                {[0, 1].map((i) => (
                  <div key={i} className="skeleton" style={{ height: 120, animationDelay: `${i * 0.1}s` }} />
                ))}
              </div>
            )}
            {quizItems.length === 0 && state.quiz === 'idle' && (
              <LoadPrompt label={t('lesson.loadQuiz')} hint={t('lesson.onDemandHint')} onLoad={loadQuiz} />
            )}
            {quizItems.length === 0 && state.quiz === 'error' && (
              <p className="muted" style={{ fontSize: 13.5 }}>{t('lesson.partFailed')}</p>
            )}

            {quizItems.length > 0 && (
              <>
                <div className="row" style={{ marginBottom: 4 }}>
                  <span className="spacer" />
                  <span className="mono">
                    {t('lesson.answered', { n: Object.keys(answers).length, total: quizItems.length })}
                  </span>
                </div>

                {quizItems.map((q, qi) => {
                  const picked = answers[qi]
                  return (
                    <div className="quiz-q" key={qi}>
                      <div className="quiz-question">
                        <span className="quiz-num mono">{qi + 1}</span>
                        {q.question}
                      </div>
                      <div className="quiz-options">
                        {q.options.map((opt, oi) => {
                          const isPicked = picked === oi
                          const optionState = !checked
                            ? isPicked
                              ? 'picked'
                              : 'idle'
                            : oi === q.correct
                              ? 'correct'
                              : isPicked
                                ? 'wrong'
                                : 'idle'
                          return (
                            <button
                              key={oi}
                              type="button"
                              className="quiz-option"
                              data-state={optionState}
                              disabled={checked}
                              onClick={() => setAnswers((prev) => ({ ...prev, [qi]: oi }))}
                            >
                              <span className="quiz-marker mono">{String.fromCharCode(65 + oi)}</span>
                              <span>{opt}</span>
                            </button>
                          )
                        })}
                      </div>
                      {checked && q.explanation && (
                        <div className="quiz-explain" data-ok={picked === q.correct}>
                          {q.explanation}
                        </div>
                      )}
                    </div>
                  )
                })}

                <div className="quiz-foot">
                  {!checked ? (
                    <button className="btn btn-primary" disabled={!answeredAll} onClick={() => setChecked(true)}>
                      <Icon name="check" size={13} /> {t('lesson.check')}
                    </button>
                  ) : (
                    <>
                      <div className={`quiz-score${passed ? ' ok' : ''}`}>
                        {t('lesson.score', { score, total: quizItems.length })}
                      </div>
                      <span className="spacer" />
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => {
                          setAnswers({})
                          setChecked(false)
                        }}
                      >
                        {t('lesson.again')}
                      </button>
                      {passed && !skill.learned && (
                        <button
                          className="btn btn-accent"
                          onClick={() => {
                            onPatch(skill.id, { learned: true, level: Math.max(skill.level ?? 0, 3) })
                            toast(t('lesson.marked', { name: skill.name }), 'success')
                            onClose()
                          }}
                        >
                          <Icon name="check" size={13} /> {t('lesson.markLearned')}
                        </button>
                      )}
                    </>
                  )}
                </div>
              </>
            )}
          </section>
        </div>
      </div>
    </div>,
    document.body,
  )
}
