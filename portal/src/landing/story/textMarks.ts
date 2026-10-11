import type { StoryMark } from './storyFrame'

/**
 * Markierungen im echten Nachrichtentext über die CSS Custom Highlight API.
 * Das DOM der Bubbles bleibt unverändert (React-sicher). Ohne API entfällt nur die Markierung.
 */

type HighlightRegistry = { set(name: string, value: unknown): void; delete(name: string): boolean }

function registry(): HighlightRegistry | undefined {
  if (typeof CSS === 'undefined') return undefined
  return (CSS as unknown as { highlights?: HighlightRegistry }).highlights
}

function highlightCtor(): (new (...ranges: Range[]) => unknown) | undefined {
  return (globalThis as unknown as { Highlight?: new (...ranges: Range[]) => unknown }).Highlight
}

export const MARK_HIGHLIGHT = 'lp-mark'
/** Eigener Highlight-Name der Trust-Ebene, damit sich Hero und Beleg nicht überschreiben. */
export const PROOF_HIGHLIGHT = 'lp-proof-mark'

/**
 * Textspalte einer Nachricht unterhalb von `root`. Die DOM-`id` der Bubble ist je Bereich eindeutig
 * (`msg-hero-mk12`, `msg-trust-mk12`), deshalb wird über `data-msg-id` der Fixture-ID gesucht.
 */
export function findMessageCaption(root: Element, messageId: string): Element | null {
  return root.querySelector(`[data-msg-id="${messageId}"] .caption`)
}

/** Erstes Vorkommen von `needle` im sichtbaren Text unterhalb von `root`. */
export function findTextRange(root: Element, needle: string): Range | null {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const index = (node.nodeValue ?? '').indexOf(needle)
    if (index >= 0) {
      const range = document.createRange()
      range.setStart(node, index)
      range.setEnd(node, index + needle.length)
      return range
    }
  }
  return null
}

/** Setzt die Markierungen; gibt eine Aufräumfunktion zurück. */
export function applyTextMarks(
  stage: Element,
  marks: readonly StoryMark[],
  name: string = MARK_HIGHLIGHT,
): () => void {
  const highlights = registry()
  const Ctor = highlightCtor()
  if (!highlights || !Ctor || marks.length === 0) return () => {}
  const ranges: Range[] = []
  for (const mark of marks) {
    const row = findMessageCaption(stage, mark.messageId)
    if (!row) continue
    for (const text of mark.texts) {
      const range = findTextRange(row, text)
      if (range) ranges.push(range)
    }
  }
  if (ranges.length === 0) return () => {}
  highlights.set(name, new Ctor(...ranges))
  return () => {
    highlights.delete(name)
  }
}
