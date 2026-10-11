import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { OrderFields } from '../components/order/OrderFields'
import { openInterestLeadOnClick } from '../InterestLead'
import { landingCopy, landingLinks } from '../landingCopy'
import { StaticBubble } from './StaticBubble'
import { LANDING_MESSAGES } from './story/landingFixture'
import { endFrame } from './story/storyFrame'
import { PROOF_ENTER_MS, PROOF_MARKS, PROOF_STEPS, type ProofStep } from './story/proofSequence'
import { sourceMessageIds } from './story/sourceMap'
import { prefersReducedMotion } from './story/storyProgress'
import { applyTextMarks, findMessageCaption, findTextRange, PROOF_HIGHLIGHT } from './story/textMarks'
import { useSourceSelection } from './story/useSourceSelection'

const PROOF_MESSAGE_IDS = ['mk12', 'mk13', 'mk14'] as const
const PROOF_FIELDS: ReadonlySet<string> = new Set(['budget', 'preisVereinbart'])
const SOURCE_FIELDS: ReadonlySet<string> = new Set(['budget', 'preisVereinbart'])
const SUPERSEDED: ReadonlySet<string> = new Set(['budget'])
const EMPTY_IDS: readonly string[] = []

type Connector = { d: string; key: string }

/** Zweite Sektion: Quellenbeleg läuft beim Eintritt einmal von selbst, danach per Hover oder Tap vertiefbar. */
export const TrustSection = memo(function TrustSection() {
  const { active, onSourceActive } = useSourceSelection()
  const snapshot = useMemo(() => endFrame().orderSnapshot, [])
  const messages = useMemo(
    () => LANDING_MESSAGES.filter((message) => (PROOF_MESSAGE_IDS as readonly string[]).includes(message.id)),
    [],
  )

  const proofRef = useRef<HTMLDivElement>(null)
  const [entered, setEntered] = useState(false)
  const [stepIndex, setStepIndex] = useState(-1)
  const sequenceTimers = useRef<number[]>([])
  const [connector, setConnector] = useState<Connector | null>(null)

  const cancelSequence = useCallback(() => {
    sequenceTimers.current.forEach((timer) => window.clearTimeout(timer))
    sequenceTimers.current = []
    setStepIndex(-1)
  }, [])

  // Hover, Fokus oder Tap übernehmen die Führung: die Automatik endet sofort.
  const handleSourceActive = useCallback(
    (key: string | null, via: 'hover' | 'focus' | 'tap') => {
      if (key !== null) cancelSequence()
      onSourceActive(key, via)
    },
    [cancelSequence, onSourceActive],
  )

  // Bei etwa einem Drittel Sichtbarkeit: Eintritt (Chat von links, Auftrag von rechts), dann ca. 3 s Beweis.
  useEffect(() => {
    const element = proofRef.current
    if (!element) return
    const begin = () => {
      setEntered(true)
      // Reduced Motion: kein Ablauf, aber die sichtbare Standardauswahl (Preis ← Zustimmung in mk14), Brief §4.4.
      if (prefersReducedMotion()) {
        setStepIndex(PROOF_STEPS.length - 1)
        return
      }
      let at = PROOF_ENTER_MS
      PROOF_STEPS.forEach((step, index) => {
        sequenceTimers.current.push(window.setTimeout(() => setStepIndex(index), at))
        at += step.durationMs
      })
      // Nach der Folge bleibt die Zustimmung als ruhige Linie stehen. Hover ersetzt sie.
    }
    if (typeof IntersectionObserver === 'undefined') {
      begin()
      return () => sequenceTimers.current.forEach((timer) => window.clearTimeout(timer))
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return
        observer.disconnect()
        begin()
      },
      { threshold: 0.33 },
    )
    observer.observe(element)
    return () => {
      observer.disconnect()
      sequenceTimers.current.forEach((timer) => window.clearTimeout(timer))
      sequenceTimers.current = []
    }
  }, [])

  const step: ProofStep | null = stepIndex >= 0 ? PROOF_STEPS[stepIndex] : null
  const hoverKey = active?.key ?? null
  const activeField = hoverKey ?? step?.field ?? null
  const hoverIds = useMemo(() => sourceMessageIds(hoverKey).filter((id) => id in PROOF_MARKS), [hoverKey])
  const hitIds: readonly string[] = step ? [step.messageId] : hoverIds.length ? hoverIds : EMPTY_IDS
  const hitKey = hitIds.join(',')
  const hits = new Set(hitIds)

  // Markierte Textstellen der gerade gezeigten Quelle.
  useEffect(() => {
    const root = proofRef.current
    if (!root || !hitKey) return
    const marks = hitKey.split(',').map((messageId) => ({ messageId, texts: PROOF_MARKS[messageId] ?? [] }))
    return applyTextMarks(root, marks, PROOF_HIGHLIGHT)
  }, [hitKey])

  // Dünne Linie von der markierten Stelle zum Auftragsfeld (nur die aktuelle Quelle).
  const connectField = step?.field ?? hoverKey
  const connectMessage = step?.messageId ?? hoverIds[hoverIds.length - 1] ?? null
  const connectMark = connectMessage ? PROOF_MARKS[connectMessage]?.[0] : undefined
  useLayoutEffect(() => {
    const root = proofRef.current
    if (!root || !connectField || !connectMessage || !connectMark) {
      setConnector(null)
      return
    }
    const measure = () => {
      const caption = findMessageCaption(root, connectMessage)
      const range = caption ? findTextRange(caption, connectMark) : null
      const field = root.querySelector(`[data-order-field="${connectField}"]`)
      if (!range || !field) return setConnector(null)
      const base = root.getBoundingClientRect()
      const from = range.getBoundingClientRect()
      const to = field.getBoundingClientRect()
      if (from.width === 0 || to.width === 0) return setConnector(null)
      const sideBySide = to.left > from.right + 12
      let d: string
      if (sideBySide) {
        const x1 = from.right - base.left
        const y1 = from.top + from.height / 2 - base.top
        const x2 = to.left - base.left
        const y2 = to.top + Math.min(to.height / 2, 28) - base.top
        const mid = (x1 + x2) / 2
        d = `M ${x1} ${y1} C ${mid} ${y1}, ${mid} ${y2}, ${x2} ${y2}`
      } else {
        const x1 = from.left + from.width / 2 - base.left
        const y1 = from.bottom - base.top
        const x2 = to.left + 24 - base.left
        const y2 = to.top - base.top
        const mid = (y1 + y2) / 2
        d = `M ${x1} ${y1} C ${x1} ${mid}, ${x2} ${mid}, ${x2} ${y2}`
      }
      setConnector({ d, key: `${connectMessage}-${connectField}` })
    }
    measure()
    const observer = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(measure)
    observer?.observe(root)
    return () => observer?.disconnect()
  }, [connectField, connectMessage, connectMark])

  const caption = step
    ? step.id === 'budget'
      ? landingCopy.trustStepBudget
      : step.id === 'price'
        ? landingCopy.trustStepPrice
        : landingCopy.trustStepConfirm
    : // Hover, Fokus oder Tap zeigen dieselbe Quellen-Bildunterschrift wie der Auto-Beweis (X-06: keine Anleitung).
      hoverKey === 'budget'
      ? landingCopy.trustStepBudget
      : hoverKey === 'preisVereinbart'
        ? landingCopy.trustStepConfirm
        : ''

  return (
    <section className="lp-trust" id="lp-trust" aria-labelledby="lp-trust-title">
      <div className="lp-trust-inner">
        <h2 id="lp-trust-title" className="lp-trust-title" tabIndex={-1}>
          {landingCopy.trustTitle}
        </h2>

        <div
          className="lp-proof"
          ref={proofRef}
          data-entered={entered ? '' : undefined}
          data-active={hits.size ? '' : undefined}
          data-active-field={activeField ?? undefined}
        >
          <div className="lp-proof-chat chat">
            <div className="messages">
              {messages.map((message) => (
                <StaticBubble
                  key={message.id}
                  message={message}
                  scope="trust"
                  source={hits.size ? (hits.has(message.id) ? 'hit' : 'dim') : undefined}
                />
              ))}
            </div>
          </div>
          <div className="lp-proof-order">
            <OrderFields
              structured={snapshot}
              fieldKeys={PROOF_FIELDS}
              hideNotes
              wrapValues
              supersededFields={SUPERSEDED}
              sourceFields={SOURCE_FIELDS}
              onSourceActive={handleSourceActive}
            />
          </div>
          {connector && (
            <svg className="lp-proof-line" aria-hidden="true" focusable="false">
              <path key={connector.key} d={connector.d} pathLength={1} />
            </svg>
          )}
        </div>

        {/* Sichtbare Quellen-Bildunterschrift (Höhe reserviert). */}
        <p className="lp-trust-hint">{caption}</p>
        {/* Ansage nur beim Schlusssatz des Beweises oder bei Nutzerwahl, nicht im Sekundentakt (WCAG 2.2.2). */}
        <p className="lp-sr-only" role="status" aria-live="polite">
          {hoverKey || stepIndex === PROOF_STEPS.length - 1 ? caption : ''}
        </p>

        <div className="lp-cta">
          <a className="lp-btn lp-btn-primary" href={landingLinks.pilot} onClick={openInterestLeadOnClick}>
            {landingCopy.primaryCta}
          </a>
          <a className="lp-hero-demo" href={landingLinks.demo}>
            {landingCopy.secondaryCta}
          </a>
        </div>
      </div>
    </section>
  )
})
