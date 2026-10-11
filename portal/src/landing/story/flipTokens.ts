/**
 * FLIP-artige Daten-Tokens: ein kleines Etikett fliegt von der markierten Textstelle
 * im Chat zum Auftragsfeld. Reine DOM/WAAPI-Schicht, `aria-hidden`, ohne Abhängigkeiten.
 * Bei `prefers-reduced-motion` gibt es keinen Flug; das Feld erscheint direkt.
 */

/**
 * Feste Flugdauer (Motion-Skript 08 §1): Der Feldwert erscheint beim Ankommen des Tokens
 * (`FLIGHT_REVEAL_DELAY` in `storyFrame.ts`, knapp vor Ende), unabhängig von der Distanz.
 * Der Fortschritt ist eine reine Funktion der Zeit, deshalb darf die Dauer nicht vom Layout abhängen.
 */
export const TOKEN_MS = 480
export const TOKEN_MIN_MS = TOKEN_MS
export const TOKEN_MAX_MS = TOKEN_MS

export function tokenDurationMs(_distance: number): number {
  return TOKEN_MS
}

export type TokenFlight = { cancel: () => void }

export type FlyTokenOptions = {
  /** Positioned Container (`position: relative`), in dem das Token liegt. */
  host: HTMLElement
  from: DOMRect
  to: DOMRect
  label: string
  reducedMotion: boolean
}

const NOOP_FLIGHT: TokenFlight = { cancel: () => {} }

export function flyToken({ host, from, to, label, reducedMotion }: FlyTokenOptions): TokenFlight {
  if (reducedMotion || typeof host.animate !== 'function') return NOOP_FLIGHT

  const hostRect = host.getBoundingClientRect()
  const start = { x: from.left + from.width / 2 - hostRect.left, y: from.top + from.height / 2 - hostRect.top }
  const end = { x: to.left + Math.min(36, to.width / 2) - hostRect.left, y: to.top + to.height / 2 - hostRect.top }
  const distance = Math.hypot(end.x - start.x, end.y - start.y)
  const duration = tokenDurationMs(distance)
  // Leichter Bogen statt gerader Linie: Kontrollpunkt senkrecht zur Verbindung.
  const bend = Math.min(56, distance * 0.16)
  const mid = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 - bend }

  const token = document.createElement('span')
  token.className = 'lp-token'
  token.textContent = label
  token.setAttribute('aria-hidden', 'true')
  host.appendChild(token)

  // Nur translate und opacity (Brief §7: kein scale() in der Landing): das Token behält seine Größe.
  const at = (point: { x: number; y: number }) => `translate(${point.x}px, ${point.y}px) translate(-50%, -50%)`
  const animation = token.animate(
    [
      { transform: at(start), opacity: 0 },
      { transform: at(start), opacity: 1, offset: 0.14 },
      { transform: at(mid), opacity: 1, offset: 0.58 },
      { transform: at(end), opacity: 0.95, offset: 0.9 },
      { transform: at(end), opacity: 0 },
    ],
    { duration, easing: 'cubic-bezier(0.4, 0, 0.2, 1)', fill: 'forwards' },
  )
  const remove = () => token.remove()
  animation.addEventListener('finish', remove)
  animation.addEventListener('cancel', remove)
  return {
    cancel: () => {
      animation.cancel()
      remove()
    },
  }
}
