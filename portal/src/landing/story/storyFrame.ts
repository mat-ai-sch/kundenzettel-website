import type { OrderStatus, StructuredOrder } from '../../data'
import { emptyStructuredOrder } from '../../orderFromChat'
import { LANDING_PRODUCT_NAME, landingMessage } from './landingFixture'
import { deriveLandingOrder, statusRank } from './orderDerivation'
import { SOURCE_MARKS } from './sourceMap'
import { STORY_MS } from './storyProgress'
import { bandOf, clamp01, type StoryState as StoryStateValue } from './storyStates'
import { buildTypingTimeline, typedTextAt } from './typingSequence'

/**
 * Reine Funktion: Zeit-Fortschritt (0–1 über `STORY_MS`) → vollständiger Bühnenzustand.
 *
 * Produktwahrheit (02 §3/§4, 06b C-04): Auftragswerte und Status werden NICHT gesetzt, sondern aus
 * `deriveOrderFromChat` auf dem sichtbaren Präfix `[mk11..mkN]` abgeleitet (`orderDerivation.ts`).
 * Die Darstellung darf verzögert sein (Token-Flug), die Vorwegnahme nie. Nachrichten stammen aus dem
 * Landing-Fixture ohne Telefon und Anschrift (`landingFixture.ts`).
 *
 * Zeitplan nach Brief §5 (B0 bis B9) bei 8,0 s, siehe `T`.
 */

/** Zeitpunkte in Sekunden der Hero-Story (Soll 8,0 s). Reihenfolge und Kausalität sind bindend. */
export const T = {
  /** B1: Tipp-Indikator vor mk12 (≤ 500 ms, Landing-only-Dramaturgie), danach erscheint mk12. */
  requestIndicator: 0.4,
  requestVisible: 0.88,
  /** B2: Mittwoch und 65€ in mk12 markiert, Token fliegen nacheinander ins Feld. */
  extractMarks: 1.2,
  flightTermin: 1.3,
  /** ≥ 680 ms nach dem ersten Flug: höchstens ein Token gleichzeitig. */
  flightBudget: 2.0,
  /** B4: Composer tippt mk13 (≤ 1,0 s), Senden, Bubble erscheint. */
  composeStart: 3.2,
  composeEnd: 4.2,
  replyVisible: 4.3,
  /** B5: 75€ in mk13 markiert. Preis (vereinbart) bleibt leer, Budget bleibt stehen. */
  replyMark: 4.6,
  /** B6: Tipp-Indikator, dann mk14 (Zustimmung). */
  confirmIndicator: 5.6,
  confirmVisible: 6.05,
  /** B7: Pointe. Token 75€ fliegt in Preis (vereinbart), Status wird Bestätigt. */
  flightPrice: 6.4,
  /** B8: Wunschbudget durchgestrichen (Landing-only), ≥ 240 ms nach dem Füllen von Preis (vereinbart). */
  superseded: 7.4,
} as const

/** Sekunden → Fortschritt 0–1. */
const sec = (seconds: number): number => (seconds * 1000) / STORY_MS

export type StoryFlight = {
  readonly id: string
  /** Fortschritt, ab dem das Token fliegt. */
  readonly at: number
  readonly messageId: string
  /** Wörtlicher Teilstring der Quellnachricht (06b C-05): `Mittwoch`, `65€`, `75€`. */
  readonly mark: string
  readonly field: keyof StructuredOrder
  /** Text des fliegenden Tokens = `mark`, nie der Feldwert. */
  readonly label: string
}

/** Token-Flüge Nachricht → Auftragsfeld (Präsentationsschicht). */
export const STORY_FLIGHTS: readonly StoryFlight[] = [
  { id: 'termin', at: sec(T.flightTermin), messageId: 'mk12', mark: 'Mittwoch', field: 'termin', label: 'Mittwoch' },
  { id: 'budget', at: sec(T.flightBudget), messageId: 'mk12', mark: '65€', field: 'budget', label: '65€' },
  { id: 'price', at: sec(T.flightPrice), messageId: 'mk13', mark: '75€', field: 'preisVereinbart', label: '75€' },
]

/** Ein Feld wird erst beim Ankommen des Tokens sichtbar (Flug 480 ms, `flipTokens.TOKEN_MS`; Wert bei 464 ms). */
export const FLIGHT_REVEAL_DELAY = 0.058

/** Chat | Auftrag steht fest auf 52 | 48 und ändert sich während der Story nie (Brief §4.2, VA-04). */
export const CHAT_ORDER_RATIO = 0.52

/** Hero-Feld-Subset (X-01): reservierte Zeilen von Beginn an, Wert leer bis zur Quelle. */
export const HERO_FIELD_KEYS: ReadonlySet<string> = new Set(['termin', 'budget', 'preisVereinbart'])

export type StoryMark = { readonly messageId: string; readonly texts: readonly string[] }
export type StoryAnnouncement = 'extraction' | 'confirmed'

export type StoryFrame = {
  readonly progress: number
  readonly state: StoryStateValue
  readonly visibleIds: readonly string[]
  readonly typingIndicator: boolean
  readonly composerText: string
  /** Voller Composer-Text während des Tippens, damit die Zeile nicht bei jedem Umbruch springt. */
  readonly composerFull: string
  readonly orderSnapshot: StructuredOrder
  readonly fieldKeys: ReadonlySet<string>
  readonly supersededFields: ReadonlySet<string>
  readonly liveFields: readonly string[]
  readonly liveTick: number
  readonly status: OrderStatus
  readonly marks: readonly StoryMark[]
  /** Live-Ansage nur bei echten Zustandswechseln (Texte: `landingCopy`, Copy PASS Phase 12). */
  readonly announcement: StoryAnnouncement | null
}

export type FrameOptions = {
  /** Kein Typing-Indikator, kein Composer-Typewriting: Nachrichten erscheinen direkt. */
  reducedMotion?: boolean
}

const EMPTY_FIELDS: ReadonlySet<string> = new Set()
const SUPERSEDED_FIELDS: ReadonlySet<string> = new Set(['budget'])
const LIVE_WINDOW = 0.04

const typingCache = new Map<string, ReturnType<typeof buildTypingTimeline>>()
function timelineFor(id: string, text: string) {
  let timeline = typingCache.get(id)
  if (!timeline) {
    timeline = buildTypingTimeline(text)
    typingCache.set(id, timeline)
  }
  return timeline
}

/** Vorsichtiger Status: nie höher als `limit`. */
function cappedStatus(status: OrderStatus, limit: OrderStatus): OrderStatus {
  return statusRank(status) <= statusRank(limit) ? status : limit
}

export function computeFrame(progress: number, options: FrameOptions = {}): StoryFrame {
  const p = clamp01(progress)
  const reduced = options.reducedMotion === true
  const at = (seconds: number) => p >= sec(seconds)

  const visible: string[] = ['mk11']
  let typingIndicator = false
  let composerText = ''
  let composerFull = ''

  // B1: eingehend, Indikator, dann volle Bubble (kein Typewriting).
  if (at(T.requestIndicator)) {
    if (!reduced && !at(T.requestVisible)) typingIndicator = true
    else visible.push('mk12')
  }

  // B4: ausgehend, Composer-Typewriting (≤ 1,0 s), Senden, dann Bubble.
  if (at(T.composeStart) && visible.includes('mk12')) {
    if (!reduced && !at(T.replyVisible)) {
      const text = landingMessage('mk13').text ?? ''
      const typed = (p - sec(T.composeStart)) / (sec(T.composeEnd) - sec(T.composeStart))
      composerText = typedTextAt(text, timelineFor('mk13', text), typed)
      composerFull = text
    } else {
      visible.push('mk13')
    }
  }

  // B6: eingehend, Indikator, dann mk14.
  if (at(T.confirmIndicator) && visible.includes('mk13')) {
    if (!reduced && !at(T.confirmVisible)) typingIndicator = true
    else visible.push('mk14')
  }

  // Ableitung auf dem sichtbaren Präfix; die Anzeige folgt erst nach dem Token-Flug.
  const derived = deriveLandingOrder(visible.length)
  const revealed = (flightId: string) => {
    const flight = STORY_FLIGHTS.find((candidate) => candidate.id === flightId)!
    return p >= flight.at + FLIGHT_REVEAL_DELAY
  }
  const terminShown = derived.termin !== '' && revealed('termin')
  const budgetShown = derived.budget !== '' && revealed('budget')
  const priceShown = derived.preisVereinbart !== '' && revealed('price')

  const snapshot = emptyStructuredOrder({
    produkt: LANDING_PRODUCT_NAME,
    ...(terminShown ? { termin: derived.termin } : {}),
    ...(budgetShown ? { budget: derived.budget } : {}),
    ...(priceShown ? { preisVereinbart: derived.preisVereinbart } : {}),
  })

  // Status: `inferStatus` (abgeleitet), aber nie vor dem Füllen von Budget (Angebot) bzw. Preis (Bestätigt).
  const status: OrderStatus = priceShown
    ? derived.status
    : budgetShown
      ? cappedStatus(derived.status, 'angebot')
      : 'anfrage'

  const supersededFields = priceShown && at(T.superseded) ? SUPERSEDED_FIELDS : EMPTY_FIELDS

  const live: string[] = []
  let tick = 0
  STORY_FLIGHTS.forEach((flight, index) => {
    const start = flight.at + FLIGHT_REVEAL_DELAY
    if (p >= start && p < start + LIVE_WINDOW) {
      live.push(flight.field)
      tick = index + 1
    }
  })

  // Markierungen im echten Nachrichtentext, nur an sichtbaren Nachrichten.
  const markFrom: Readonly<Record<string, number>> = {
    mk12: T.extractMarks,
    mk13: T.replyMark,
    mk14: T.flightPrice,
  }
  const marks: StoryMark[] = []
  for (const [messageId, from] of Object.entries(markFrom)) {
    if (at(from) && visible.includes(messageId) && SOURCE_MARKS[messageId]) {
      marks.push({ messageId, texts: SOURCE_MARKS[messageId] })
    }
  }

  return {
    progress: p,
    state: bandOf(p).state,
    visibleIds: visible,
    typingIndicator,
    composerText,
    composerFull,
    orderSnapshot: snapshot,
    fieldKeys: HERO_FIELD_KEYS,
    supersededFields,
    liveFields: live,
    liveTick: tick,
    status,
    marks,
    announcement: priceShown ? 'confirmed' : budgetShown ? 'extraction' : null,
  }
}

/** Endzustand B9 (Reduced Motion, `?autoplay=0`, Skip, Trust). */
export function endFrame(): StoryFrame {
  return computeFrame(1, { reducedMotion: true })
}