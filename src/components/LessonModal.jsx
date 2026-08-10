import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { generateLesson } from '../lib/openrouter'
import { Markdown } from '../lib/markdown'
import { useI18n } from '../i18n'
import { Icon, Spinner } from './ui'

// v2: в уроке появились вопросы рекрутера, старый кэш не подходит
const CACHE_PREFIX = 'skill-dossier.lesson.v2.'

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

export default function LessonModal({ skill, settings, onClose, onPatch, toast }) {
  const { t, lang } = useI18n()
  const [lesson, setLesson] = useState(() => readCache(skill.slug, lang))
  const [loading, setLoading] = useState(false)
  const [answers, setAnswers] = useState({}) // { [индекс вопроса]: индекс варианта }
  const [checked, setChecked] = useState(false)
  const abortRef = useRef(null)
  const bodyRef = useRef(null)

  // закрытие по Escape + блокировка прокрутки страницы под попапом
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
      abortRef.current?.abort()
    }
  }, [onClose])

  async function load({ refresh = false } = {}) {
    setLoading(true)
    setChecked(false)
    setAnswers({})
    if (refresh) setLesson(null)

    const controller = new AbortController()
    abortRef.current = controller

    try {
      const next = await generateLesson({
        apiKey: settings.apiKey,
        model: settings.model,
        skill,
        lang,
        signal: controller.signal,
      })
      setLesson(next)
      writeCache(skill.slug, lang, next)
      bodyRef.current?.scrollTo({ top: 0 })
    } catch (e) {
      if (e.name !== 'AbortError') toast(e.message, 'error')
    } finally {
      setLoading(false)
      abortRef.current = null
    }
  }

  useEffect(() => {
    if (!lesson) load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const quiz = lesson?.quiz ?? []
  const answeredAll = quiz.length > 0 && quiz.every((_, i) => answers[i] !== undefined)
  const score = quiz.reduce((acc, q, i) => acc + (answers[i] === q.correct ? 1 : 0), 0)
  const passed = quiz.length > 0 && score >= Math.ceil(quiz.length * 0.8)

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
            {lesson && !loading && (
              <button className="btn btn-sm btn-ghost" onClick={() => load({ refresh: true })} title={t('lesson.refresh')}>
                <Icon name="refresh" size={13} /> {t('lesson.refresh')}
              </button>
            )}
            <button className="icon-btn" onClick={onClose} aria-label={t('lesson.close')} title={t('lesson.close')}>
              <Icon name="close" size={14} />
            </button>
          </div>
        </header>

        <div className="modal-body" ref={bodyRef}>
          {loading && !lesson && (
            <div className="lesson-loading">
              <span className="row mono" style={{ gap: 9, marginBottom: 18 }}>
                <Spinner /> {t('lesson.loading')}
              </span>
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="skeleton" style={{ height: i === 0 ? 26 : 78, animationDelay: `${i * 0.1}s` }} />
              ))}
            </div>
          )}

          {!loading && !lesson && (
            <div style={{ textAlign: 'center', padding: '40px 10px' }}>
              <p className="muted" style={{ marginBottom: 16 }}>{t('lesson.failed')}</p>
              <button className="btn btn-accent" onClick={() => load({ refresh: true })}>
                <Icon name="spark" /> {t('lesson.retry')}
              </button>
            </div>
          )}

          {lesson && (
            <>
              {lesson.summary && <p className="lesson-summary">{lesson.summary}</p>}

              {lesson.recruiterQuestions?.length > 0 && (
                <section className="rq">
                  <h3 className="lesson-h">{t('lesson.recruiter')}</h3>
                  {lesson.recruiterQuestions.map((q, i) => (
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
                  ))}
                </section>
              )}

              {lesson.explanation && (
                <section className="lesson-block">
                  <h3 className="lesson-h">{t('lesson.explanation')}</h3>
                  <div className="lesson-text">
                    <Markdown text={lesson.explanation} />
                  </div>
                </section>
              )}

              {lesson.interviewTips.length > 0 && (
                <section className="lesson-block">
                  <h3 className="lesson-h">{t('lesson.interview')}</h3>
                  <ul className="lesson-tips">
                    {lesson.interviewTips.map((tip, i) => (
                      <li key={i}>{tip}</li>
                    ))}
                  </ul>
                </section>
              )}

              {lesson.sources.length > 0 && (
                <section className="lesson-block">
                  <h3 className="lesson-h">{t('lesson.sources')}</h3>
                  <ul className="lesson-sources">
                    {lesson.sources.map((s) => (
                      <li key={s.url}>
                        <a href={s.url} target="_blank" rel="noreferrer">{s.title}</a>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {quiz.length > 0 && (
                <section className="lesson-block quiz">
                  <div className="row" style={{ marginBottom: 4 }}>
                    <h3 className="lesson-h" style={{ margin: 0 }}>{t('lesson.quiz')}</h3>
                    <span className="spacer" />
                    <span className="mono">
                      {t('lesson.answered', { n: Object.keys(answers).length, total: quiz.length })}
                    </span>
                  </div>

                  {quiz.map((q, qi) => {
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
                            const state = !checked
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
                                data-state={state}
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
                          {t('lesson.score', { score, total: quiz.length })}
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
                </section>
              )}
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}
