import { clamp01 } from './storyStates'

/**
 * Tippen wird nur für die ausgehende Atelier-Antwort inszeniert.
 * Eingehende Kundennachrichten erscheinen nach einem kurzen Typing-Indikator als volle Bubble.
 */

/** Brief §5: kurzer Tipp-Indikator vor mk12 und mk14, höchstens 500 ms (Landing-only-Dramaturgie). */
export const INCOMING_INDICATOR_MS = { min: 300, max: 500 } as const

/** Dauer des Typing-Indikators vor einer eingehenden Nachricht (300–500 ms, nach Länge). */
export function incomingIndicatorMs(text: string): number {
  const ms = INCOMING_INDICATOR_MS.min + text.length * 4
  return Math.round(Math.min(INCOMING_INDICATOR_MS.max, Math.max(INCOMING_INDICATOR_MS.min, ms)))
}

export type TypingSegment = {
  /** Text endet nach diesem Segment bei `endChar` (exklusiv). */
  readonly endChar: number
  /** Anteil der Gesamtzeit (0–1) bei Segmentbeginn und -ende. */
  readonly from: number
  readonly to: number
}

/**
 * Segmentiert Text in Wörter plus Satzzeichen-Pausen. Die Gesamtzeit ist normiert auf 0–1,
 * damit dieselbe Timeline sowohl scroll- als auch zeitgesteuert nutzbar ist.
 */
export function buildTypingTimeline(text: string): readonly TypingSegment[] {
  const pieces = text.match(/\S+\s*/gu) ?? []
  if (pieces.length === 0) return []
  const weights = pieces.map((piece) => {
    const trimmed = piece.trim()
    const pause = /[.!?]$/u.test(trimmed) ? 5 : /[,;:]$/u.test(trimmed) ? 2.5 : 0
    return Math.max(2, trimmed.length) + pause
  })
  const total = weights.reduce((sum, weight) => sum + weight, 0)
  const segments: TypingSegment[] = []
  let char = 0
  let acc = 0
  pieces.forEach((piece, index) => {
    char += piece.length
    const from = acc / total
    acc += weights[index]
    segments.push({ endChar: char, from, to: acc / total })
  })
  return segments
}

/** Bereits getippter Text bei Fortschritt `t` (0–1). Innerhalb eines Wortes wird zeichenweise interpoliert. */
export function typedTextAt(text: string, timeline: readonly TypingSegment[], t: number): string {
  const p = clamp01(t)
  if (p <= 0 || timeline.length === 0) return ''
  if (p >= 1) return text
  let startChar = 0
  for (const segment of timeline) {
    if (p <= segment.to) {
      const span = segment.to - segment.from
      const local = span <= 0 ? 1 : clamp01((p - segment.from) / span)
      // Zeichen laufen gleichmäßig durch das Wort. Die Satzpause steckt in der Segmentlänge, nicht in einem Stillstand.
      const chars = Math.ceil((segment.endChar - startChar) * local)
      return text.slice(0, startChar + chars)
    }
    startChar = segment.endChar
  }
  return text
}
