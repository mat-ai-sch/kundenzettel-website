import type { Message, StructuredOrder } from '../../data'
import { LANDING_MESSAGES } from './landingFixture'

/**
 * Landing-only Zuordnung Auftragsfeld → Chat-Nachrichten (Marie, Landing-Fixture).
 * Präsentationsschicht, kein Live-Feature des Produkts (02 §8). Die Quellenansicht gibt es nur in der
 * Trust-Ebene und nur für `budget` und `preisVereinbart` (X-10, X-11); im Hero gibt es keine
 * Quellenauswahl. `termin`, `preisBegruendung` und `blumenauswahl` sind keine Quellfelder.
 */
export type SourceKey = Extract<keyof StructuredOrder, 'budget' | 'preisVereinbart'>

export const MARIE_SOURCE_MAP: Readonly<Record<SourceKey, readonly string[]>> = {
  budget: ['mk12'],
  preisVereinbart: ['mk13', 'mk14'],
}

export const SOURCE_KEYS = Object.keys(MARIE_SOURCE_MAP) as readonly SourceKey[]

export function isSourceKey(key: string | null | undefined): key is SourceKey {
  return !!key && Object.prototype.hasOwnProperty.call(MARIE_SOURCE_MAP, key)
}

/** Nachrichten-IDs der Quelle, optional beschränkt auf aktuell sichtbare Nachrichten. */
export function sourceMessageIds(key: string | null | undefined, visible?: ReadonlySet<string>): string[] {
  if (!isSourceKey(key)) return []
  const ids = MARIE_SOURCE_MAP[key]
  return visible ? ids.filter((id) => visible.has(id)) : [...ids]
}

/** Echte Nachrichten hinter einem Feld, in Chat-Reihenfolge. */
export function sourceMessages(key: string | null | undefined): Message[] {
  const ids = new Set(sourceMessageIds(key))
  return LANDING_MESSAGES.filter((message) => ids.has(message.id))
}

/** Textstellen, die im Hero markiert werden (wörtliche Teilstrings der Nachrichtentexte, 06b C-05). */
export const SOURCE_MARKS: Readonly<Record<string, readonly string[]>> = {
  mk12: ['Mittwoch', '65€'],
  mk13: ['75€'],
  mk14: ['Das ist es mir wert'],
}
