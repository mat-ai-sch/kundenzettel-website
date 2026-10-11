import { memo, useLayoutEffect, useMemo, useRef, type CSSProperties } from 'react'
import '../App.css'
import './LandingPresentationMode.css'
import { statusLabel, type Conversation, type OrderStatus, type StructuredOrder } from '../data'
import { StaticBubble, type BubbleScope } from './StaticBubble'
import { OrderFields } from '../components/order/OrderFields'

/** Hervorhebung einzelner Auftragsfelder (Landing-Story, rein präsentativ). */
export type OrderEmphasis = {
  /** Feldschlüssel mit `.is-live`-Highlight (z. B. `['preisVereinbart']`). */
  liveFields?: readonly string[]
  /** Erhöhen, um die Live-Animation erneut auszulösen. */
  tick?: number
}

/** Platzhalter des echten Composers (`Composer.tsx`, 06b C-06). Kein Marketingtext. */
export const COMPOSER_PLACEHOLDER = 'Gib eine Nachricht ein'

export type LandingPresentationModeProps = {
  mode: 'landing-story'
  /** Nachrichten und Kopfdaten: das Landing-Fixture (`landingConversation`), nie die Demo-Konversation. */
  conversation: Conversation
  /** Aktueller Stand der strukturierten Felder (aus `computeFrame`, abgeleitet). */
  orderSnapshot: StructuredOrder
  /** Sichtbare Nachrichten-IDs; Reihenfolge folgt `conversation.messages`. */
  visibleMessageIds: readonly string[]
  orderEmphasis?: OrderEmphasis
  /** Anteil der Chat-Spalte an der Stage, 0–1. Fest 0,52 (ändert sich während der Story nie). */
  chatOrderRatio?: number
  /** Status-Leiste im Auftrag; Standard `conversation.status`. */
  status?: OrderStatus
  className?: string
  /** Nur diese Auftragsfelder zeigen (Produkt steht im Kopfstreifen). Fehlt = alle. */
  fieldKeys?: ReadonlySet<string>
  /** Wunschwerte, die durch eine spätere Einigung ersetzt wurden (durchgestrichen, Landing-only). */
  supersededFields?: ReadonlySet<string>
  /** Eingehender Typing-Indikator am Ende des Chats. */
  typingIndicator?: boolean
  /** Text im Composer (ausgehende Antwort wird getippt); leer = Platzhalter. */
  composerText?: string
  /** Voller Text dazu, reserviert die Höhe, während Zeichen für Zeichen erscheinen. */
  composerFull?: string
  /** `split` = Chat | Auftrag nebeneinander, `stack` = Chat über Auftrag (schmale Bühne, kein Sheet, X-09). */
  layout?: 'split' | 'stack'
  /** Bereich für eindeutige Bubble-IDs. */
  scope?: BubbleScope
}

const EMPTY: readonly string[] = []
/** Weicher Auslauf ohne harten Antritt: die Lesepausen bleiben in der Timeline. */
const ENTER_MS = 880
const ENTER_EASE = 'cubic-bezier(0.33, 0, 0.2, 1)'

function releaseHeight(node: HTMLElement) {
  node.style.height = ''
  node.style.overflow = ''
}

function translateYOf(node: HTMLElement): number {
  const value = getComputedStyle(node).transform
  if (!value || value === 'none') return 0
  const match = /matrix\(([^)]+)\)/.exec(value)
  if (!match) return 0
  const parts = match[1].split(',')
  return parts.length >= 6 ? Number.parseFloat(parts[5]) || 0 : 0
}

/** Geschwister per Transform verschieben. Höhe zu animieren schneidet den Text und ruckelt. */
function glideY(node: HTMLElement, dy: number) {
  if (Math.abs(dy) < 0.6) return
  node.animate(
    [{ transform: `translateY(${dy}px)` }, { transform: 'translateY(0px)' }],
    { duration: ENTER_MS, easing: ENTER_EASE, fill: 'none' },
  )
}

/** Composer-Höhe folgt derselben Kurve, damit der Faden nicht bei jedem Zeilenumbruch springt. */
function glideHeight(node: HTMLElement, from: number, to: number) {
  if (Math.abs(to - from) < 2) return
  node.style.overflow = 'hidden'
  node.style.height = `${from}px`
  const animation = node.animate([{ height: `${from}px` }, { height: `${to}px` }], {
    duration: ENTER_MS,
    easing: ENTER_EASE,
    fill: 'forwards',
  })
  let settled = false
  const release = () => {
    if (settled) return
    settled = true
    animation.cancel()
    releaseHeight(node)
  }
  animation.addEventListener('finish', release)
  animation.addEventListener('cancel', release)
}

/**
 * Eine zusammenhängende Stage „Chat | Auftrag“ aus den echten Demo-Komponenten.
 * Keine Chatliste; Menüs, Medien und Eingabe sind deaktiviert. Der Hero hat keine Quellenauswahl:
 * Auftragsfelder sind `inert`, das „Woher“ zeigt nur die Trust-Ebene.
 */
export const LandingPresentationMode = memo(function LandingPresentationMode({
  conversation,
  orderSnapshot,
  visibleMessageIds,
  orderEmphasis,
  chatOrderRatio = 0.52,
  status,
  className,
  fieldKeys,
  supersededFields,
  typingIndicator = false,
  composerText = '',
  composerFull = '',
  layout = 'split',
  scope = 'hero',
}: LandingPresentationModeProps) {
  const rootRef = useRef<HTMLDivElement>(null)
  const motionMemory = useRef({
    key: '',
    layout: new Map<string, number>(),
    composer: -1,
  })
  const motionKey = `${visibleMessageIds.join('\u001f')}\u001f${typingIndicator ? 1 : 0}\u001f${composerText ? 1 : 0}\u001f${layout}`

  useLayoutEffect(() => {
    if (scope !== 'hero') return
    const root = rootRef.current
    if (!root) return
    const memory = motionMemory.current
    if (memory.key === motionKey) return
    memory.key = motionKey

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const phase = root.closest('.lp-hero')?.getAttribute('data-flow')
    const motion = !reduced && (phase === 'PLAYING' || phase === 'REPLAYING')
    const nodes = [...root.querySelectorAll<HTMLElement>('.lp-presentation-chat [data-flip]')]
    const field = root.querySelector<HTMLElement>('.lp-composer-field')

    const visual = new Map<string, number>()
    for (const node of nodes) {
      const id = node.dataset.flip ?? ''
      const stored = memory.layout.get(id)
      if (stored === undefined) continue
      visual.set(id, stored + translateYOf(node))
    }
    for (const node of nodes) {
      for (const anim of node.getAnimations()) anim.cancel()
    }

    const typingGone = memory.layout.has('typing') && !nodes.some((node) => node.dataset.flip === 'typing')
    const next = new Map<string, number>()
    for (const node of nodes) next.set(node.dataset.flip ?? '', node.getBoundingClientRect().top)

    let removed = 0
    for (const id of memory.layout.keys()) if (!next.has(id)) removed += 1
    const added = nodes.filter((node) => !memory.layout.has(node.dataset.flip ?? ''))
    const forward = motion && added.length > 0 && removed <= added.length

    if (forward) {
      for (const node of nodes) {
        const id = node.dataset.flip ?? ''
        const from = visual.get(id)
        if (from === undefined) continue
        glideY(node, from - (next.get(id) ?? from))
      }
      for (const node of added) {
        node.classList.add('is-entering')
        if (typingGone && node.dataset.flip !== 'typing') node.classList.add('is-handoff')
      }
    }

    if (field) {
      const natural = field.getBoundingClientRect().height
      if (!forward && motion && memory.composer >= 0) glideHeight(field, memory.composer, natural)
      memory.composer = natural
    }
    memory.layout = next
  }, [motionKey, scope])
  const ratio = Math.min(0.85, Math.max(0.3, chatOrderRatio))
  const visible = useMemo(() => new Set(visibleMessageIds), [visibleMessageIds])
  const messages = useMemo(
    () => conversation.messages.filter((m) => visible.has(m.id)),
    [conversation.messages, visible],
  )
  const liveFields = useMemo(
    () => new Set(orderEmphasis?.liveFields ?? EMPTY),
    [orderEmphasis?.liveFields],
  )
  const currentStatus = status ?? conversation.status
  const isStack = layout === 'stack'

  const style = {
    gridTemplateColumns: isStack ? 'minmax(0, 1fr)' : `minmax(0, ${ratio}fr) minmax(0, ${1 - ratio}fr)`,
  } as CSSProperties

  return (
    <div
      ref={rootRef}
      className={`lp-presentation${className ? ` ${className}` : ''}`}
      data-mode="landing-story"
      data-layout={layout}
      style={style}
    >
      <section className="col chat lp-presentation-chat" aria-label={`Chat mit ${conversation.kunde}`}>
        <div className="chat-head">
          <div className="meta">
            <h2>{conversation.kunde}</h2>
          </div>
        </div>
        <div className="messages">
          <div className="msg-toolbar">
            <div className="day-chip">Heute</div>
          </div>
          {messages.map((m) => (
            <div className="lp-flip" data-flip={m.id} key={m.id}>
              <StaticBubble message={m} scope={scope} poster={conversation.produktBild} />
            </div>
          ))}
          {typingIndicator && (
            <div className="lp-flip lp-typing-slot" data-flip="typing">
              <div className="bubble-row kunde lp-typing" aria-hidden="true">
                <div className="bubble">
                  <span className="lp-typing-dots">
                    <i />
                    <i />
                    <i />
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
        <div className="lp-composer" aria-hidden="true">
          <div className={`lp-composer-field${composerText ? ' is-typing' : ''}`}>
            {composerText ? (
              <span className="lp-composer-stack">
                {composerFull ? (
                  <span className="lp-composer-sizer" aria-hidden="true">
                    {composerFull}
                  </span>
                ) : null}
                <span className="lp-composer-text">
                  {composerText}
                  <i className="lp-caret" />
                </span>
              </span>
            ) : (
              <span className="lp-composer-placeholder">{COMPOSER_PLACEHOLDER}</span>
            )}
          </div>
          <span className={`lp-composer-send${composerText ? ' is-ready' : ''}`}>
            <svg viewBox="0 0 24 24" width="20" height="20">
              <path fill="currentColor" d="M3 20.5v-17L21.5 12 3 20.5Zm2-3.1L16.3 12 5 6.6v3.7l6 1.7-6 1.7v3.7Z" />
            </svg>
          </span>
        </div>
      </section>

      <section className="col order-col order is-inline lp-presentation-order" aria-label="Auftrag">
        <div className="col-head">
          <div className="col-head-title">
            <h2>Auftrag</h2>
          </div>
        </div>
        <div className="order-inner">
          {/* Produktkopf konstant (02 §8). Zeile 2 (Auftrags-Nr., Größe) und KI-Badge werden nicht gerendert. */}
          <div className={`product-strip${liveFields.has('produkt') ? ' is-live' : ''}`}>
            {conversation.produktBild ? (
              <img src={conversation.produktBild} alt="" width={56} height={56} decoding="async" />
            ) : (
              <div className="product-strip-ph" aria-hidden />
            )}
            <div>
              <h3>{orderSnapshot.produkt}</h3>
            </div>
          </div>
          {/* Im Hero rein präsentativ: weder fokussierbar noch im Accessibility-Baum (keine Quellenauswahl). */}
          <div className="lp-fields-host" inert>
            <OrderFields
              structured={orderSnapshot}
              liveFields={liveFields}
              liveTick={orderEmphasis?.tick ?? 0}
              fieldKeys={fieldKeys}
              hideNotes
              wrapValues
              supersededFields={supersededFields}
            />
          </div>
          {/* Die echte Leiste der Demo mit allen fünf Labels (06b C-03). */}
          <div className="status-track" aria-hidden="true" inert>
            {(Object.keys(statusLabel) as OrderStatus[]).map((s) => (
              <button key={s} type="button" tabIndex={-1} className={currentStatus === s ? 'is-on' : ''}>
                {statusLabel[s]}
              </button>
            ))}
          </div>
        </div>
      </section>
    </div>
  )
})
