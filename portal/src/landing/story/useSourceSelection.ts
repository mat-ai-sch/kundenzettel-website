import { useCallback, useEffect, useState } from 'react'

export type SourceVia = 'hover' | 'focus' | 'tap'
export type ActiveSource = { key: string; via: SourceVia }

/**
 * Auswahl eines Auftragsfeldes, dessen Quelle gezeigt wird.
 * Hover/Fokus gelten nur solange sie anhalten; ein Tap bleibt, bis erneut getippt oder Esc gedrückt wird.
 */
export function useSourceSelection(): {
  active: ActiveSource | null
  onSourceActive: (key: string | null, via: SourceVia) => void
  clear: () => void
} {
  const [active, setActive] = useState<ActiveSource | null>(null)

  const onSourceActive = useCallback((key: string | null, via: SourceVia) => {
    setActive((current) => {
      if (key === null) return current && current.via === via ? null : current
      if (via === 'tap' && current?.key === key && current.via === 'tap') return null
      return { key, via }
    })
  }, [])
  const clear = useCallback(() => setActive(null), [])

  useEffect(() => {
    if (!active) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setActive(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [active])

  return { active, onSourceActive, clear }
}
