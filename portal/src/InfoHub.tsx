import { useEffect, useRef, useState, type FormEvent } from 'react'
import { infoExampleQuestions, infoTopics, localInfoAnswer, type InfoQaAnswer } from './infoKnowledge'
import { isOperatorRuntime, runtimeConfig } from './runtimeMode'

declare global {
  interface Window {
    turnstile?: {
      render: (element: HTMLElement, options: {
        sitekey: string
        theme?: 'light'
        callback: (token: string) => void
        'error-callback'?: () => void
        'expired-callback'?: () => void
      }) => string
      reset: (widgetId?: string) => void
    }
  }
}

type QaState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'answer'; value: InfoQaAnswer }
  | { kind: 'error'; message: string }

const publicQaEndpoint = 'https://api.kundenzettel.de/public/info/qa'

function Chevron({ open }: { open: boolean }) {
  return (
    <svg className={`info-topic-chevron${open ? ' is-open' : ''}`} viewBox="0 0 16 16" aria-hidden="true">
      <path d="m4 6 4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function TopicGlyph({ id }: { id: string }) {
  const common = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.55, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
  if (id === 'nachrichten') return <svg viewBox="0 0 24 24" aria-hidden="true"><path {...common} d="M5 5.5h14v10H9l-4 3v-13Z" /><path {...common} d="M8 9h8M8 12h5" /></svg>
  if (id === 'entwurf') return <svg viewBox="0 0 24 24" aria-hidden="true"><path {...common} d="M6 3.5h9l3 3v14H6z" /><path {...common} d="M15 3.5v3h3M9 11h6M9 14h6M9 17h4" /></svg>
  if (id === 'archiv') return <svg viewBox="0 0 24 24" aria-hidden="true"><path {...common} d="M4.5 7h15v12h-15zM3.5 4h17v3h-17zM9 11h6" /></svg>
  if (id === 'status') return <svg viewBox="0 0 24 24" aria-hidden="true"><path {...common} d="M5 18.5V13M12 18.5V8M19 18.5V4" /><path {...common} d="M3.5 20h17" /></svg>
  if (id === 'gruppen') return <svg viewBox="0 0 24 24" aria-hidden="true"><circle {...common} cx="9" cy="8" r="2.8" /><path {...common} d="M3.5 19c.4-3.2 2.2-4.8 5.5-4.8s5.1 1.6 5.5 4.8M16 6c1.6 0 2.8 1.2 2.8 2.8S17.6 11.6 16 11.6M17 14.3c2.1.2 3.2 1.8 3.5 4.7" /></svg>
  if (id === 'fixieren') return <svg viewBox="0 0 24 24" aria-hidden="true"><path {...common} d="m15.8 4.5 3.7 3.7-2.2 2.2-1.1 4.3-2.6-2.6-4.2 4.2-1.5-1.5 4.2-4.2-2.6-2.6 4.3-1.1 2-2.4Z" /></svg>
  if (id === 'sprachnachrichten') return <svg viewBox="0 0 24 24" aria-hidden="true"><rect {...common} x="9" y="3.5" width="6" height="10" rx="3" /><path {...common} d="M6.5 10.5a5.5 5.5 0 0 0 11 0M12 16v4M9 20h6" /></svg>
  if (id === 'loeschen') return <svg viewBox="0 0 24 24" aria-hidden="true"><path {...common} d="M5.5 7.5h13M9 7.5V5h6v2.5M7 7.5l.7 12h8.6l.7-12M10 11v5M14 11v5" /></svg>
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path {...common} d="M12 3.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 0 0 0-17Z" /><path {...common} d="M12 10v5M12 7.2h.01" /></svg>
}

function BrandWatermark() {
  return (
    <span className="info-watermark" aria-hidden="true">
      <img src="/brand/kundenzettel-mark.png" alt="" />
    </span>
  )
}

function TopicAnswer({ answer, emphasis }: { answer: string; emphasis?: string }) {
  if (!emphasis || !answer.includes(emphasis)) return <p>{answer}</p>
  const [before, after] = answer.split(emphasis)
  return <p>{before}<em>{emphasis}</em>{after}</p>
}

function apiErrorMessage(body: unknown, fallback: string) {
  if (!body || typeof body !== 'object') return fallback
  const candidate = (body as { error?: { message?: unknown } }).error?.message
  return typeof candidate === 'string' && candidate.trim() ? candidate : fallback
}

function Turnstile({ onToken }: { onToken: (value: string | undefined) => void }) {
  const hostRef = useRef<HTMLDivElement>(null)
  const widgetRef = useRef<string | undefined>(undefined)
  const siteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined

  useEffect(() => {
    if (!siteKey || !hostRef.current || import.meta.env.DEV) return
    let cancelled = false
    const mount = () => {
      if (cancelled || !hostRef.current || !window.turnstile || widgetRef.current) return
      widgetRef.current = window.turnstile.render(hostRef.current, {
        sitekey: siteKey,
        theme: 'light',
        callback: (token) => onToken(token),
        'error-callback': () => onToken(undefined),
        'expired-callback': () => onToken(undefined),
      })
    }
    if (window.turnstile) mount()
    else {
      const script = document.createElement('script')
      script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
      script.async = true
      script.defer = true
      script.onload = mount
      document.head.appendChild(script)
    }
    return () => { cancelled = true }
  }, [onToken, siteKey])

  if (import.meta.env.DEV || !siteKey) return null
  return <div className="info-turnstile" ref={hostRef} aria-label="Sicherheitscheck" />
}

export function InfoHub() {
  const [openTopic, setOpenTopic] = useState('')
  const [question, setQuestion] = useState('')
  const [turnstileToken, setTurnstileToken] = useState<string>()
  const [qaState, setQaState] = useState<QaState>({ kind: 'idle' })
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const operator = isOperatorRuntime()

  async function ask(rawQuestion: string) {
    const trimmed = rawQuestion.trim()
    if (!trimmed) {
      inputRef.current?.focus()
      return
    }
    if (trimmed.length > 500) {
      setQaState({ kind: 'error', message: 'Bitte formuliere deine Frage mit maximal 500 Zeichen.' })
      return
    }
    setQuestion(trimmed)
    setQaState({ kind: 'loading' })

    if (import.meta.env.DEV) {
      window.setTimeout(() => setQaState({ kind: 'answer', value: localInfoAnswer(trimmed) }), 280)
      return
    }

    try {
      const endpoint = operator ? `${runtimeConfig.apiBase}/info/qa` : publicQaEndpoint
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: operator ? 'include' : 'omit',
        body: JSON.stringify({ question: trimmed, ...(operator ? {} : { turnstileToken }) }),
      })
      const body: unknown = await response.json().catch(() => null)
      if (!response.ok) throw new Error(apiErrorMessage(body, 'Die Antwort ist gerade nicht verfügbar.'))
      const answer = body as Partial<InfoQaAnswer>
      if (typeof answer.answer !== 'string') throw new Error('Die Antwort ist gerade nicht verfügbar.')
      setQaState({
        kind: 'answer',
        value: {
          answer: answer.answer,
          sources: Array.isArray(answer.sources) ? answer.sources.filter((item): item is string => typeof item === 'string') : [],
          suggestions: Array.isArray(answer.suggestions) ? answer.suggestions.filter((item): item is string => typeof item === 'string') : [],
        },
      })
    } catch (error) {
      setQaState({ kind: 'error', message: error instanceof Error ? error.message : 'Die Antwort ist gerade nicht verfügbar.' })
    }
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    void ask(question)
  }

  function resizeQuestionField(field: HTMLTextAreaElement) {
    field.style.height = 'auto'
    field.style.height = `${Math.min(field.scrollHeight, 96)}px`
  }

  return (
    <section className="info-hub" aria-label="Kundenzettel Informationen und Fragen">
      <div className="info-hero">
        <BrandWatermark />
        <h1>Informationen zu Kundenzettel</h1>
        <p>Hier findest du Antworten zu Nachrichten, Aufträgen und der Nutzung von Kundenzettel.</p>
      </div>

      <div className="info-main">
        <div className="info-accordion" aria-label="Häufige Fragen">
          <div className="info-section-label">Themen</div>
          {infoTopics.map((topic) => {
            const expanded = topic.id === openTopic
            return (
              <article className={`info-topic${expanded ? ' is-open' : ''}`} key={topic.id}>
                <button
                  type="button"
                  className="info-topic-trigger"
                  aria-expanded={expanded}
                  onClick={() => setOpenTopic(expanded ? '' : topic.id)}
                >
                  <span className="info-topic-title"><span className="info-topic-icon"><TopicGlyph id={topic.id} /></span>{topic.title}</span>
                  <Chevron open={expanded} />
                </button>
                {expanded && <TopicAnswer answer={topic.answer} emphasis={topic.emphasis} />}
              </article>
            )
          })}
        </div>

        <section className="info-ask" aria-labelledby="info-ask-title">
          <div className="info-ask-head">
            <div>
              <span className="info-eyebrow">Fragen &amp; Antworten</span>
              <h2 id="info-ask-title">Was möchtest du wissen?</h2>
            </div>
            {qaState.kind === 'answer' && (
              <button type="button" className="info-clear" onClick={() => setQaState({ kind: 'idle' })}>Schließen</button>
            )}
          </div>

          <div className={`info-dialogue${qaState.kind === 'idle' ? ' is-idle' : ' has-response'}`} aria-live="polite">
            {qaState.kind === 'idle' && <p className="info-dialogue-empty">Wähle ein Thema oder stelle eine Frage.</p>}
            {qaState.kind === 'loading' && <div className="info-answer is-loading" role="status">Die Antwort wird vorbereitet.</div>}
            {qaState.kind === 'error' && <div className="info-answer is-error" role="alert">{qaState.message}</div>}
            {qaState.kind === 'answer' && (
              <article className="info-answer">
                <span className="info-answer-label">Antwort</span>
                <p>{qaState.value.answer}</p>
                {!!qaState.value.suggestions.length && (
                  <div className="info-suggestions" aria-label="Weitere Fragen">
                    {qaState.value.suggestions.map((suggestion) => <button type="button" key={suggestion} onClick={() => void ask(suggestion)}>{suggestion}</button>)}
                  </div>
                )}
              </article>
            )}
          </div>

          <div className="info-examples" aria-label="Beispielfragen">
            {infoExampleQuestions.map((example) => (
              <button key={example} type="button" onClick={() => void ask(example)}>{example}</button>
            ))}
          </div>
          <form className="info-ask-form" onSubmit={onSubmit}>
            <textarea
              ref={inputRef}
              value={question}
              rows={1}
              maxLength={500}
              onChange={(event) => {
                setQuestion(event.target.value)
                resizeQuestionField(event.currentTarget)
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault()
                  event.currentTarget.form?.requestSubmit()
                }
              }}
              placeholder="Frage zu Kundenzettel eingeben …"
              aria-label="Frage zu Kundenzettel"
            />
            <button type="submit" disabled={qaState.kind === 'loading'} aria-label={qaState.kind === 'loading' ? 'Antwort wird geladen' : 'Frage senden'} title="Frage senden">
              {qaState.kind === 'loading' ? <span className="info-send-loader" aria-hidden="true" /> : (
                <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 15V5M6.5 8.5 10 5l3.5 3.5" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" /></svg>
              )}
            </button>
          </form>
          <p className="info-privacy-note">Bitte gib hier keine Namen, Telefonnummern oder Angaben zu Aufträgen ein.</p>
          {!operator && <Turnstile onToken={setTurnstileToken} />}
        </section>
      </div>
    </section>
  )
}
