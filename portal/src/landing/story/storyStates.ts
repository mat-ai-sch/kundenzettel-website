/**
 * Story-Zustände der Landing-Szene (Marie, 65 € → 75 €).
 * `erasableSyntaxOnly` ist aktiv, daher Konstantenobjekt statt `enum`.
 */
export const StoryState = {
  INTRO: 'INTRO',
  CUSTOMER_REQUEST: 'CUSTOMER_REQUEST',
  INITIAL_EXTRACTION: 'INITIAL_EXTRACTION',
  MERCHANT_RESPONSE: 'MERCHANT_RESPONSE',
  /** Atelier hat 75€ genannt (Zahl markiert). Noch nichts vereinbart, nichts ersetzt. */
  PRICE_REVISION: 'PRICE_REVISION',
  /** Kundin schreibt mk14 (Hinführung zur Pointe). */
  CUSTOMER_CONFIRMATION: 'CUSTOMER_CONFIRMATION',
  /** Pointe: erst jetzt gilt `Preis (vereinbart)`, Status Bestätigt (PT-V1). */
  PRICE_AGREED: 'PRICE_AGREED',
  /** Ersetzt (Streichung des Wunschbudgets, Landing-only) und ruhiger Endzustand. */
  ORDER_COMPLETE: 'ORDER_COMPLETE',
} as const

export type StoryState = (typeof StoryState)[keyof typeof StoryState]

export type StoryBand = { readonly state: StoryState; readonly from: number; readonly to: number }

/**
 * Zeit-Bänder der Hero-Story (0 = Start, 1 = Endzustand nach `STORY_MS`, siehe `storyProgress.ts`),
 * abgeleitet aus den Beats B0 bis B9 des Briefs (`05-creative-brief.md` §5) bei 8,0 s:
 * INTRO 0–0,4 s (B0) · CUSTOMER_REQUEST bis 1,2 s (B1) · INITIAL_EXTRACTION bis 3,2 s (B2, B3) ·
 * MERCHANT_RESPONSE bis 4,6 s (B4) · PRICE_REVISION bis 5,6 s (B5) · CUSTOMER_CONFIRMATION bis 6,4 s (B6) ·
 * PRICE_AGREED bis 7,4 s (B7) · ORDER_COMPLETE bis 8,0 s (B8, B9).
 * Die Zeitpunkte in Sekunden stehen in `storyFrame.ts` (`T`). Der Wechsel zur Trust-Ebene ist
 * normales Scrollen, kein Hero-Band.
 */
export const STORY_BANDS: readonly StoryBand[] = [
  { state: StoryState.INTRO, from: 0.0, to: 0.05 },
  { state: StoryState.CUSTOMER_REQUEST, from: 0.05, to: 0.15 },
  { state: StoryState.INITIAL_EXTRACTION, from: 0.15, to: 0.4 },
  { state: StoryState.MERCHANT_RESPONSE, from: 0.4, to: 0.575 },
  { state: StoryState.PRICE_REVISION, from: 0.575, to: 0.7 },
  { state: StoryState.CUSTOMER_CONFIRMATION, from: 0.7, to: 0.8 },
  { state: StoryState.PRICE_AGREED, from: 0.8, to: 0.925 },
  { state: StoryState.ORDER_COMPLETE, from: 0.925, to: 1.0 },
]

export function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.min(1, Math.max(0, value)) + 0 // `+ 0` normalisiert -0
}

export function bandOf(progress: number): StoryBand {
  const p = clamp01(progress)
  for (const band of STORY_BANDS) {
    if (p < band.to) return band
  }
  return STORY_BANDS[STORY_BANDS.length - 1]
}

export function stateAt(progress: number): StoryState {
  return bandOf(progress).state
}

/** Fortschritt 0–1 innerhalb des Bandes, in dem `progress` liegt. */
export function bandProgress(progress: number, band: StoryBand = bandOf(progress)): number {
  const span = band.to - band.from
  return span <= 0 ? 1 : clamp01((progress - band.from) / span)
}

export function bandFor(state: StoryState): StoryBand {
  const band = STORY_BANDS.find((candidate) => candidate.state === state)
  if (!band) throw new Error(`Unbekannter Story-Zustand: ${state}`)
  return band
}

/** Fortschritt eines beliebigen Zustands, unabhängig vom aktuellen Band (0 vor, 1 nach dem Band). */
export function progressWithin(progress: number, state: StoryState): number {
  return bandProgress(progress, bandFor(state))
}

/** Stückweise lineare Interpolation über Stützpunkte `[progress, value]`. */
export function lerpKeys(progress: number, keys: ReadonlyArray<readonly [number, number]>): number {
  const p = clamp01(progress)
  if (p <= keys[0][0]) return keys[0][1]
  for (let i = 1; i < keys.length; i += 1) {
    const [x1, y1] = keys[i]
    if (p <= x1) {
      const [x0, y0] = keys[i - 1]
      return x1 === x0 ? y1 : y0 + ((y1 - y0) * (p - x0)) / (x1 - x0)
    }
  }
  return keys[keys.length - 1][1]
}
