import type { OrderStatus } from '../../data'
import { deriveOrderFromChat, emptyStructuredOrder } from '../../orderFromChat'
import { LANDING_MESSAGE_IDS, landingConversation } from './landingFixture'

/**
 * Auftragswerte der Landing: nie handgesetzt, immer die Produktableitung (`deriveOrderFromChat`)
 * auf dem sichtbaren Nachrichten-Präfix `[mk11..mkN]`, mit leerem Ausgangsstand und `status: 'anfrage'`
 * (02 §3/§4, 06b C-04). Das Fixture-Literal der Demo ist nie der Ausgangsstand (06b §1 C).
 */

export type DerivedLandingOrder = {
  readonly termin: string
  readonly budget: string
  readonly preisVereinbart: string
  readonly status: OrderStatus
}

/** Reihenfolge der Status-Leiste der Demo (`statusLabel`). */
export const STATUS_ORDER: readonly OrderStatus[] = ['anfrage', 'angebot', 'bestaetigt', 'arbeit', 'fertig']

const EMPTY: DerivedLandingOrder = { termin: '', budget: '', preisVereinbart: '', status: 'anfrage' }
const cache = new Map<number, DerivedLandingOrder>()

/** Ableitung auf den ersten `count` Nachrichten des Fixtures (`mk11` = 1 … `mk14` = 4). */
export function deriveLandingOrder(count: number): DerivedLandingOrder {
  const size = Math.max(0, Math.min(LANDING_MESSAGE_IDS.length, Math.floor(count)))
  if (size === 0) return EMPTY
  const cached = cache.get(size)
  if (cached) return cached
  const derived = deriveOrderFromChat({
    ...landingConversation,
    status: 'anfrage',
    structured: emptyStructuredOrder(),
    messages: landingConversation.messages.slice(0, size),
  })
  const result: DerivedLandingOrder = {
    termin: derived.structured.termin ?? '',
    budget: derived.structured.budget ?? '',
    preisVereinbart: derived.structured.preisVereinbart ?? '',
    status: derived.status,
  }
  cache.set(size, result)
  return result
}

/** Der höhere von zwei Status (nach Leistenreihenfolge). */
export function statusRank(status: OrderStatus): number {
  return STATUS_ORDER.indexOf(status)
}
