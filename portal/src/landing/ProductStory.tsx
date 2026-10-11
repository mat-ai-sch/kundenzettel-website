import { memo, useEffect, useMemo, useRef, useSyncExternalStore } from 'react'
import { landingCopy } from '../landingCopy'
import { LandingPresentationMode } from './LandingPresentationMode'
import { useContainerWidth } from './useContainerWidth'
import { useMediaQuery } from './useMediaQuery'
import { landingConversation } from './story/landingFixture'
import { CHAT_ORDER_RATIO, computeFrame, endFrame, FLIGHT_REVEAL_DELAY, STORY_FLIGHTS, type StoryFrame } from './story/storyFrame'
import { flyToken, type TokenFlight } from './story/flipTokens'
import { prefersReducedMotion, type ProgressSource } from './story/storyProgress'
import { SOURCE_MARKS } from './story/sourceMap'
import { applyTextMarks, findMessageCaption, findTextRange } from './story/textMarks'

/**
 * Die Bühne der Product Story: echte Demo-Komponenten (Chat | Auftrag) plus Story-Effekte.
 * Inhalte stammen aus dem Landing-Fixture (`landingFixture.ts`, ohne Telefon und Anschrift); Auftragswerte
 * und Status sind aus der Produktlogik abgeleitet (`storyFrame.ts`). Der Hero hat keine Quellenauswahl,
 * kein Sheet und keinen Peek (Brief X-09, X-11): das „Woher“ zeigt nur die Trust-Ebene.
 */
/** Unter dieser Bühnenbreite (px) steht der Auftrag unter dem Chat (vertikaler Split, kein Sheet). */
export const STACK_BELOW_STAGE_PX = 640
/**
 * Mobil: so viele Nachrichten bleiben im Endzustand voll sichtbar (Brief §4.3: mindestens 2, Ziel 3).
 * R1: 2 (Antwort mit 75 € und Zustimmung = die Pointe), damit Preis und Status im ersten Bild stehen.
 * Die Anfrage (mk12) ist beim Token-Flug von „Mittwoch“ und „65 €“ noch voll sichtbar und weicht erst danach nach oben.
 */
export const STACK_CHAT_BUBBLES = 2

/**
 * Ghost-Kopie des Endzustands: ihre Props ändern sich nur mit dem Layout (Split/Stack), nie mit dem Fortschritt.
 * `memo` erspart ihr den Neuaufbau bei jedem Fortschrittsschritt der Story.
 */
const GhostStage = memo(function GhostStage({
  ghost,
  ghostIds,
  isStack,
}: {
  ghost: ReturnType<typeof endFrame>
  ghostIds: readonly string[]
  isStack: boolean
}) {
  return (
    <div className="lp-stage-ghost" aria-hidden="true" inert>
      <LandingPresentationMode
        mode="landing-story"
        scope="ghost"
        conversation={landingConversation}
        orderSnapshot={ghost.orderSnapshot}
        visibleMessageIds={ghostIds}
        chatOrderRatio={CHAT_ORDER_RATIO}
        status={ghost.status}
        fieldKeys={ghost.fieldKeys}
        supersededFields={ghost.supersededFields}
        layout={isStack ? 'stack' : 'split'}
        className="lp-presentation-ghost"
      />
    </div>
  )
})

/** Sichtbare Wechsel, nicht der rohe Tick. Gleiche Signatur behält denselben Frame. */
function presentationKey(frame: StoryFrame, isStack: boolean): string {
  return [
    frame.visibleIds.join(','),
    frame.typingIndicator ? '1' : '0',
    frame.composerText,
    frame.composerFull,
    frame.status,
    frame.orderSnapshot.termin ?? '',
    frame.orderSnapshot.budget ?? '',
    frame.orderSnapshot.preisVereinbart ?? '',
    [...frame.supersededFields].join(','),
    frame.marks.map((mark) => mark.messageId).join(','),
    frame.liveFields.join(','),
    String(frame.liveTick),
    isStack ? 'stack' : 'split',
  ].join('\u001f')
}

export function ProductStory({ progressSource }: { progressSource: ProgressSource }) {
  const progress = useSyncExternalStore(progressSource.subscribe, progressSource.get, progressSource.get)
  const stageRef = useRef<HTMLDivElement>(null)
  const tokensRef = useRef<HTMLDivElement>(null)
  const stageWidth = useContainerWidth(stageRef)
  const isStack = stageWidth > 0 && stageWidth < STACK_BELOW_STAGE_PX
  const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)')

  const frame = useMemo(() => computeFrame(progress, { reducedMotion }), [progress, reducedMotion])
  const shownKey = presentationKey(frame, isStack)
  const shown = useMemo(
    () => ({
      frame,
      emphasis: { liveFields: frame.liveFields, tick: frame.liveTick },
    }),
    // Nur sichtbare Wechsel zeichnen die Bühne neu. Dazwischen bleibt der Frame stehen.
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- der Schlüssel bündelt den Frame
    [shownKey],
  )
  // Ghost-Sizing (Wire 06 §5): Die Bühnenhöhe kommt aus dem Endzustand, nie aus dem Story-Zustand.
  // Mobil (vertikaler Split) reserviert das Chatfenster für die letzten drei Nachrichten (Brief §4.3: Ziel 3,
  // mindestens 2 volle Bubbles). Ältere (mk11) weichen oben unter die Fade-Maske; mk12 bleibt als Quelle voll sichtbar.
  const ghost = useMemo(() => endFrame(), [])
  const ghostIds = useMemo(
    () => (isStack ? ghost.visibleIds.slice(-STACK_CHAT_BUBBLES) : ghost.visibleIds),
    [ghost, isStack],
  )

  const view = shown.frame
  const liveAnnouncement =
    view.announcement === 'confirmed'
      ? landingCopy.liveConfirmed
      : view.announcement === 'extraction'
        ? landingCopy.liveExtraction
        : ''

  // Markierungen im echten Nachrichtentext.
  const markKey = view.marks.map((mark) => mark.messageId).join(',')
  useEffect(() => {
    const stage = stageRef.current
    if (!stage) return
    // Nur die IDs steuern den Effekt, damit er nicht bei jedem Fortschrittsschritt neu läuft.
    const marks = markKey
      ? markKey.split(',').map((messageId) => ({ messageId, texts: SOURCE_MARKS[messageId] ?? [] }))
      : []
    return applyTextMarks(stage, marks)
  }, [markKey, isStack])

  // Daten-Tokens: Flug einmal beim Überschreiten des Schwellwerts; beim Wiederholen wieder scharf.
  const fired = useRef(new Set<string>())
  const flights = useRef(new Set<TokenFlight>())
  useEffect(() => {
    const stage = stageRef.current
    const host = tokensRef.current
    if (!stage || !host) return
    for (const flight of STORY_FLIGHTS) {
      // Das Token startet bei `flight.at`; der Feldwert erscheint beim Ankommen (`FLIGHT_REVEAL_DELAY` in `computeFrame`).
      if (progress < flight.at - 0.004) {
        fired.current.delete(flight.id)
        continue
      }
      if (progress < flight.at || fired.current.has(flight.id)) continue
      fired.current.add(flight.id)
      // Nach einem Sprung (Endzustand, Skip, Reduced Motion) gibt es keinen nachträglichen Flug.
      if (progress - flight.at > FLIGHT_REVEAL_DELAY + 0.05) continue
      const source = findMessageCaption(stage, flight.messageId)
      const range = source ? findTextRange(source, flight.mark) : null
      const target = stage.querySelector(`[data-order-field="${flight.field}"] :is(input, textarea)`)
      if (!range || !target) continue
      const from = range.getBoundingClientRect()
      const to = target.getBoundingClientRect()
      if (from.width === 0 || to.width === 0) continue
      const run = flyToken({ host, from, to, label: flight.label, reducedMotion: prefersReducedMotion() })
      flights.current.add(run)
    }
  }, [progress])
  useEffect(() => {
    const running = flights.current
    return () => {
      running.forEach((run) => run.cancel())
      running.clear()
    }
  }, [])

  return (
    <div className="lp-stage" ref={stageRef} role="group" aria-label={landingCopy.storyLabel}>
      <LandingPresentationMode
        mode="landing-story"
        scope="hero"
        conversation={landingConversation}
        orderSnapshot={view.orderSnapshot}
        visibleMessageIds={view.visibleIds}
        orderEmphasis={shown.emphasis}
        chatOrderRatio={CHAT_ORDER_RATIO}
        status={view.status}
        fieldKeys={view.fieldKeys}
        supersededFields={view.supersededFields}
        typingIndicator={view.typingIndicator}
        composerText={view.composerText}
        composerFull={view.composerFull}
        layout={isStack ? 'stack' : 'split'}
        className="lp-presentation-live"
      />
      {/* Unsichtbare, inerte Kopie des Endzustands: gibt der Bühne ihre Größe (steht im DOM nach der echten Bühne). */}
      <GhostStage ghost={ghost} ghostIds={ghostIds} isStack={isStack} />
      <div className="lp-tokens" ref={tokensRef} aria-hidden="true" />
      <p className="lp-sr-only" role="status" aria-live="polite">
        {liveAnnouncement}
      </p>
    </div>
  )
}