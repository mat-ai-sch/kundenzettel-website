import { useEffect, useState, type MouseEvent } from 'react'
import { PRODUCT_NAME } from './productConfig'
import { landingHomeUrl } from './publicHost'
import './InterestLead.css'

export const INTEREST_EMAIL = 'info@kundenzettel.de'

const openListeners = new Set<() => void>()

/** Öffnet den Interesse-Dialog (z. B. aus dem Header-Button). */
export function openInterestLead() {
  openListeners.forEach((listener) => listener())
}

/**
 * Click handler for contact links (landing "Pilot anfragen", footer mail, ...).  Opens the same
 * dialog as the demo's "Kontakt" button; the mailto href stays as fallback for modified clicks.
 */
export function openInterestLeadOnClick(event: MouseEvent<HTMLElement>) {
  if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
  event.preventDefault()
  openInterestLead()
}

export function InterestLead() {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const openDialog = () => setOpen(true)
    openListeners.add(openDialog)
    return () => {
      openListeners.delete(openDialog)
    }
  }, [])

  useEffect(() => {
    if (!open) return
    function onKey(event: KeyboardEvent) {
      if (event.key !== 'Escape') return
      event.preventDefault()
      setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  function closePopup() {
    setOpen(false)
  }

  if (!open) return null

  return (
    <div className="interest-backdrop" role="presentation" onClick={closePopup}>
      <div
        className="interest-glass"
        role="dialog"
        aria-modal="true"
        aria-labelledby="interest-title"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          className="interest-close"
          aria-label="Schließen"
          onClick={closePopup}
        >
          <svg viewBox="0 0 24 24" aria-hidden>
            <path
              d="M6.4 6.4 17.6 17.6M17.6 6.4 6.4 17.6"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
            />
          </svg>
        </button>

        <a className="interest-mark" href={landingHomeUrl(window.location.hostname)} aria-label={`${PRODUCT_NAME} – zur Startseite`}>
          <img
            src="/brand/kundenzettel-mark.png"
            alt=""
            aria-hidden
            className="interest-logo-mark"
          />
          <span className="interest-logo-word">{PRODUCT_NAME}</span>
        </a>

        <h2 id="interest-title" className="interest-title">
          Interesse bekunden
        </h2>

        <div className="interest-divider" aria-hidden />

        <p className="interest-label">Email-Adresse</p>
        <a className="interest-mail" href={`mailto:${INTEREST_EMAIL}`}>
          <span className="interest-mail-icon" aria-hidden>
            <svg viewBox="0 0 24 24">
              <path
                fill="currentColor"
                d="M3.5 6.75A2.25 2.25 0 0 1 5.75 4.5h12.5a2.25 2.25 0 0 1 2.25 2.25v10.5a2.25 2.25 0 0 1-2.25 2.25H5.75a2.25 2.25 0 0 1-2.25-2.25V6.75zm2.1.75 6.15 4.55a.75.75 0 0 0 .9 0L18.4 7.5H5.6zm13.15 1.66-5.7 4.22a2.25 2.25 0 0 1-2.7 0L4.65 9.16v8.09c0 .414.336.75.75.75h12.5a.75.75 0 0 0 .75-.75V9.16z"
              />
            </svg>
          </span>
          <span className="interest-mail-text">{INTEREST_EMAIL}</span>
        </a>
      </div>
    </div>
  )
}
