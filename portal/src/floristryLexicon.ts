/**
 * Gemeinsames Floristik-Lexikon für Anwender (Atelier) und Bots.
 * Deckt die Website-Kollektion und Produkte außerhalb davon gleichermaßen.
 *
 * Familien nicht vermischen:
 * - Blumenhoop / Loop: Metallring, oft teilweise belegt
 * - Kranz: Wand-/Tisch-/Tür-/Fenster-/Adventskranz (Strohrömer, Weide, …)
 * - Gesteck, Girlande, Strauß, Bouquet, Herz — eigene Formen
 */

import { products } from './data'

export type FloristryKind =
  | 'blumenhoop'
  | 'wandkranz'
  | 'tischkranz'
  | 'tuerkranz'
  | 'fensterkranz'
  | 'adventskranz'
  | 'gesteck'
  | 'girlande'
  | 'strauss'
  | 'bouquet'
  | 'herz'
  | 'kranz'
  | 'katalog'

export type FloristryEntry = {
  kind: FloristryKind
  /** Anzeigename im Auftrag / Chat */
  label: string
  /** In der Website-Kollektion? */
  inCollection: boolean
  /** Kurze Fachnotiz */
  note: string
  /** Erkennung im Chat (bereits gefaltet gedacht) */
  patterns: readonly RegExp[]
}

function fold(value: string): string {
  return value
    .toLowerCase()
    .replace(/ß/g, 'ss')
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
}

/** Spezifisch vor generisch — Reihenfolge zählt bei der Erkennung. */
export const FLORISTRY_LEXICON: readonly FloristryEntry[] = [
  {
    kind: 'blumenhoop',
    label: 'Blumenhoop',
    inCollection: false,
    note: 'Dünner Metallring, oft asymmetrisch mit Trockenblumen; Ring bleibt sichtbar.',
    patterns: [
      /\bblumenhoop\b/,
      /\bflower\s*hoop\b/,
      /\bfloral\s*hoop\b/,
      /\bblumenring\b/,
      /\bloop\s*kranz\b/,
      /\bloops?\b/,
      /\bhoops?\b/,
    ],
  },
  {
    kind: 'wandkranz',
    label: 'Wandkranz',
    inCollection: false,
    note: 'Frontal, zum Aufhängen; Strohrömer oder Weide.',
    patterns: [/\bwandkraenz(?:e|en)?\b/, /\bwandkranz(?:e|en)?\b/, /\bwand[- ]+oder\b/],
  },
  {
    kind: 'tischkranz',
    label: 'Tischkranz',
    inCollection: false,
    note: '360°-Wirkung, Mitte oft frei für Kerze.',
    patterns: [/\btischkraenz(?:e|en)?\b/, /\btischkranz(?:e|en)?\b/],
  },
  {
    kind: 'tuerkranz',
    label: 'Türkranz',
    inCollection: false,
    note: 'Flach, leicht, wettergeschützt.',
    patterns: [
      /\btuerkraenz(?:e|en)?\b/,
      /\btuerkranz(?:e|en)?\b/,
      /\btuerkrank(?:e|en)?\b/,
      /\bturkraenz(?:e|en)?\b/,
      /\bturkranz(?:e|en)?\b/,
    ],
  },
  {
    kind: 'fensterkranz',
    label: 'Fensterkranz',
    inCollection: false,
    note: 'Kleiner, oft luftiger als Türkranz.',
    patterns: [/\bfensterkraenz(?:e|en)?\b/, /\bfensterkranz(?:e|en)?\b/],
  },
  {
    kind: 'adventskranz',
    label: 'Adventskranz',
    inCollection: false,
    note: 'Vier Kerzen; Tanne oder Trockenmaterial.',
    patterns: [/\badventskraenz(?:e|en)?\b/, /\badventskranz(?:e|en)?\b/],
  },
  {
    kind: 'gesteck',
    label: 'Tischgesteck',
    inCollection: false,
    note: 'Schale/Steckmasse, nicht rund gebunden.',
    patterns: [/\btischgesteck(?:e|en)?\b/, /\bgesteck(?:e|en)?\b/],
  },
  {
    kind: 'girlande',
    label: 'Girlande',
    inCollection: false,
    note: 'Länglich; Sideboard, Treppe, Tischkante.',
    patterns: [/\bgirlande(?:n)?\b/],
  },
  {
    kind: 'strauss',
    label: 'Strauß',
    inCollection: false,
    note: 'Gebundener Strauß, Handarbeit.',
    // fold: ü→ue → „Sträuße“ / „Blumensträuße“; strip-Variante „strausse“
    patterns: [
      /\bblumenstraeuss(?:e|en)?\b/,
      /\bblumenstrauss(?:e|en)?\b/,
      /\bherbststraeuss(?:e|en)?\b/,
      /\bherbststrauss(?:e|en)?\b/,
      /\bfruehlingsstraeuss(?:e|en)?\b/,
      /\bfruehlingsstrauss(?:e|en)?\b/,
      /\bstraeuss(?:e|en)?\b/,
      /\bstrauss(?:e|en)?\b/,
      /\bbrautstraeuss\b/,
      /\bbrautstrauss\b/,
    ],
  },
  {
    kind: 'bouquet',
    label: 'Bouquet',
    inCollection: false,
    note: 'Bouquet / Handbouquet.',
    patterns: [/\bbouquets?\b/],
  },
  {
    kind: 'herz',
    label: 'Herz',
    inCollection: false,
    note: 'Herzform, oft Trauer oder Anlass.',
    patterns: [/\bherzen?\b/],
  },
  {
    kind: 'kranz',
    label: 'Kranz',
    inCollection: false,
    note: 'Generischer Kranz, wenn keine Unterart genannt ist.',
    patterns: [/\bkranzrohling(?:e|en)?\b/, /\bkraenz(?:e|en)?\b/, /\bkranz(?:e|en)?\b/],
  },
] as const

export function collectionProductNames(): string[] {
  return products.map((product) => product.name)
}

/** Katalogtreffer (Blickfang, …) — inCollection. */
export function detectCatalogProduct(text: string): string | undefined {
  const folded = fold(text)
  for (const product of products) {
    const name = fold(product.name)
    const index = folded.indexOf(name)
    if (index < 0) continue
    const before = folded.slice(Math.max(0, index - 42), index)
    if (
      /\b(mein|meine|meins|altes|alte|damals|letztes|voriges|wie beim|wie das|wie mein|vom)\s*$/.test(
        before,
      )
    ) {
      continue
    }
    return product.name
  }
  return undefined
}

export type FloristryHit = {
  kind: FloristryKind
  label: string
  inCollection: boolean
  note: string
  source: 'katalog' | 'lexikon'
}

/**
 * Erkennt Floristik-Produkt in einer Nachricht — Atelier und Kunde gleich.
 * Katalognamen schlagen Lexikon, wenn beides vorkommt.
 */
export function detectFloristryProduct(text: string): FloristryHit | undefined {
  const catalog = detectCatalogProduct(text)
  if (catalog) {
    const folded = fold(catalog)
    const hoopish = /blickfang/.test(folded)
    return {
      kind: hoopish ? 'blumenhoop' : 'katalog',
      label: catalog,
      inCollection: true,
      note: hoopish
        ? 'Kollektions-Blumenhoop (Blickfang).'
        : 'Stück aus der Website-Kollektion.',
      source: 'katalog',
    }
  }

  const folded = fold(text)
  for (const entry of FLORISTRY_LEXICON) {
    for (const pattern of entry.patterns) {
      if (pattern.test(folded)) {
        return {
          kind: entry.kind,
          label: entry.label,
          inCollection: entry.inCollection,
          note: entry.note,
          source: 'lexikon',
        }
      }
    }
  }

  // Deixis ohne Familienwort: Goldring + Pampas → Blumenhoop
  if (
    /\bgoldring\b/.test(folded) &&
    (/\bpampas\b/.test(folded) || /\btrockenblumen\b/.test(folded) || /\bring\b/.test(folded))
  ) {
    return {
      kind: 'blumenhoop',
      label: 'Blumenhoop',
      inCollection: false,
      note: 'Aus Goldring/Pampas geschlossen — Blumenhoop, kein klassischer Kranz.',
      source: 'lexikon',
    }
  }

  return undefined
}

/** Alle Produktarten in einem Text (Reihenfolge = Lexikon, dedupliziert). */
export function detectAllFloristryKinds(text: string): FloristryKind[] {
  const folded = fold(text)
  const found: FloristryKind[] = []
  const seen = new Set<FloristryKind>()

  const catalog = detectCatalogProduct(text)
  if (catalog) {
    const hoopish = /blickfang/.test(fold(catalog))
    const kind: FloristryKind = hoopish ? 'blumenhoop' : 'katalog'
    seen.add(kind)
    found.push(kind)
  }

  for (const entry of FLORISTRY_LEXICON) {
    if (seen.has(entry.kind)) continue
    for (const pattern of entry.patterns) {
      if (pattern.test(folded)) {
        seen.add(entry.kind)
        found.push(entry.kind)
        break
      }
    }
  }

  if (
    !seen.has('blumenhoop') &&
    /\bgoldring\b/.test(folded) &&
    (/\bpampas\b/.test(folded) || /\btrockenblumen\b/.test(folded) || /\bring\b/.test(folded))
  ) {
    found.push('blumenhoop')
  }

  return found
}

export function isKranzFamilyKind(kind: FloristryKind | undefined): boolean {
  if (!kind) return false
  return (
    kind === 'kranz' ||
    kind === 'wandkranz' ||
    kind === 'tischkranz' ||
    kind === 'tuerkranz' ||
    kind === 'fensterkranz' ||
    kind === 'adventskranz'
  )
}

/** Für orderFromChat: Label-String, spezifisch vor generisch. */
export function productLabelFromText(text: string): string | undefined {
  return detectFloristryProduct(text)?.label
}

/** Off-Kollektion-Einträge (ohne generisches „Kranz“ als eigene Chat-Absicht). */
export const OFF_COLLECTION_CHAT_KINDS: readonly FloristryKind[] = [
  'wandkranz',
  'tischkranz',
  'tuerkranz',
  'fensterkranz',
  'adventskranz',
  'gesteck',
  'girlande',
] as const

export function isHoopKind(kind: FloristryKind | undefined): boolean {
  return kind === 'blumenhoop'
}

export function labelForKind(kind: FloristryKind): string {
  if (kind === 'katalog') return 'Kollektionsstück'
  const entry = FLORISTRY_LEXICON.find((item) => item.kind === kind)
  return entry?.label ?? kind
}
