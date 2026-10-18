import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { PRODUCT_NAME } from './productConfig'
import { landingHomeUrl } from './publicHost'

type LegalDocument = 'impressum' | 'datenschutz'

function legalDocumentFromHash(): LegalDocument | null {
  if (window.location.hash === '#impressum') return 'impressum'
  if (window.location.hash === '#datenschutz') return 'datenschutz'
  return null
}

export function LegalMenu() {
  const [menuOpen, setMenuOpen] = useState(false)
  const [legalDocument, setLegalDocument] = useState<LegalDocument | null>(() => legalDocumentFromHash())
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const openMenu = () => setMenuOpen(true)
    window.addEventListener('kundenzettel:legal-menu', openMenu)
    return () => {
      window.removeEventListener('kundenzettel:legal-menu', openMenu)
    }
  }, [])

  useEffect(() => {
    const syncHash = () => setLegalDocument(legalDocumentFromHash())
    window.addEventListener('hashchange', syncHash)
    return () => window.removeEventListener('hashchange', syncHash)
  }, [])

  useEffect(() => {
    if (!menuOpen) return
    const onOutsideClick = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', onOutsideClick)
    return () => document.removeEventListener('mousedown', onOutsideClick)
  }, [menuOpen])

  useEffect(() => {
    if (!menuOpen && !legalDocument) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      if (legalDocument) closeDocument()
      else setMenuOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [menuOpen, legalDocument])

  function openDocument(next: LegalDocument) {
    window.history.pushState(null, '', `#${next}`)
    setLegalDocument(next)
    setMenuOpen(false)
  }

  function closeDocument() {
    window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`)
    setLegalDocument(null)
  }

  return (
    <>
      <div className="legal-menu" ref={menuRef}>
        {menuOpen && (
          <div className="legal-popover" role="menu" aria-label="Rechtliches">
            <button type="button" role="menuitem" onClick={() => openDocument('impressum')}>
              Impressum
            </button>
            <button type="button" role="menuitem" onClick={() => openDocument('datenschutz')}>
              Datenschutz
            </button>
          </div>
        )}
      </div>

      {legalDocument &&
        createPortal(
          <div className="legal-backdrop" role="presentation" onClick={closeDocument}>
            <article
              className="legal-dialog"
              role="dialog"
              aria-modal="true"
              aria-labelledby="legal-title"
              onClick={(event) => event.stopPropagation()}
            >
              <header className="legal-dialog-header">
                <a className="legal-brand" href={landingHomeUrl(window.location.hostname)} aria-label={`${PRODUCT_NAME} – zur Startseite`}>
                  <img src="/brand/kundenzettel-mark.png" alt="" />
                  <span>{PRODUCT_NAME}</span>
                </a>
                <button type="button" className="legal-close" aria-label="Schließen" onClick={closeDocument}>
                  <svg viewBox="0 0 24 24" aria-hidden>
                    <path d="M6.5 6.5 17.5 17.5M17.5 6.5 6.5 17.5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
                  </svg>
                </button>
              </header>

              <div className="legal-content">
                {legalDocument === 'impressum' ? <Impressum /> : <Datenschutz />}
              </div>
            </article>
          </div>,
          document.body,
        )}
    </>
  )
}

function Impressum() {
  return (
    <>
      <h1 id="legal-title">Impressum</h1>
      <p className="legal-intro">Angaben gemäß § 5 DDG</p>

      <h2>Betreiber dieser Website</h2>
      <address>
        Matthias Schürmann<br />
        Am Lunapark 5<br />
        41749 Viersen
      </address>

      <h2>Anbieterin des Kundenzettel-Dienstes</h2>
      <p>
        WUNDERWERKstatt – Damaris Schürmann ist Anbieterin des geplanten Kundenzettel-Dienstes.
        Der Dienst befindet sich in einer geschlossenen Pilotphase. <a href="/anbieter/">Angaben zur Dienstanbieterin</a>
      </p>

      <h2>Kontakt</h2>
      <p>
        E-Mail: <a href="mailto:info@kundenzettel.de">info@kundenzettel.de</a>
      </p>

      <h2>Verantwortlich für den Inhalt</h2>
      <p>Verantwortlich nach § 18 Abs. 2 MStV: Matthias Schürmann, Anschrift wie oben.</p>
    </>
  )
}

function Datenschutz() {
  return (
    <>
      <h1 id="legal-title">Datenschutz</h1>
      <p className="legal-intro">
        Diese Hinweise betreffen die öffentliche Website unter kundenzettel.de und
        www.kundenzettel.de einschließlich der Anbieter-Seite sowie die Demo unter
        demo.kundenzettel.de und www.demo.kundenzettel.de. Die geschützte Betreiber-App und die
        Verarbeitung im Kundenzettel-Dienst sind hiervon nicht erfasst.
      </p>

      <h2>Verantwortlicher für Website und Demo</h2>
      <p>Verantwortlich für die Datenverarbeitung auf den hier genannten öffentlichen Seiten ist:</p>
      <address>
        Matthias Schürmann<br />
        Am Lunapark 5<br />
        41749 Viersen
        <br />
        E-Mail: <a href="mailto:info@kundenzettel.de">info@kundenzettel.de</a>
      </address>

      <h2>Hosting und Server-Logfiles</h2>
      <p>
        Die Dateien der öffentlichen Website und Demo werden über GitHub Pages ausgeliefert.
        Dabei fallen für die technische Übertragung insbesondere IP-Adresse, Zeitpunkt,
        angeforderte Ressource und Browserangaben an. Die Fragefunktion der Demo verwendet zusätzlich
        den unten genannten API-Endpunkt.
      </p>

      <h2>Öffentliche Website und Demo</h2>
      <p>
        kundenzettel.de und www.kundenzettel.de zeigen die öffentliche Website. demo.kundenzettel.de und
        www.demo.kundenzettel.de zeigen eine Demonstration mit fiktiven Beispieldaten. Chats, Aufträge
        und Kontakte der Demo bleiben im Browser und werden nicht an WhatsApp oder Meta übermittelt.
        Echte Kundenakten werden dort nicht geführt. Für Fragen an die Demo gilt der folgende Abschnitt.
      </p>

      <h2>Fragefunktion der Demo</h2>
      <p>
        Wenn Sie in der Demo eine eigene Frage senden oder eine Beispielfrage auswählen, übermittelt
        Ihr Browser den Fragetext und technische Verbindungsdaten an api.kundenzettel.de/public/info/qa,
        um eine Antwort zu erhalten. Bitte geben Sie dort keine Namen, Telefonnummern oder Angaben zu
        Aufträgen ein. Wenn ein Cloudflare-Turnstile-Sicherheitscheck für die Demo aktiviert ist,
        verbindet sich Ihr Browser außerdem mit challenges.cloudflare.com; ein daraus stammender
        Prüfwert wird mit der Frage übertragen.
      </p>

      <h2>Cookies</h2>
      <p>
        Auf diesen Seiten werden keine Cookies zu Analyse- oder Marketingzwecken gesetzt.
      </p>

      <h2>Google Fonts</h2>
      <p>
        Die öffentliche Hauptseite und Demo laden Google Fonts (Google Ireland Limited). Dabei wird
        eine Verbindung zu Servern von Google hergestellt; Ihre IP-Adresse kann übermittelt werden.
        Die eigenständige Anbieter-Seite verwendet Systemschriften. Rechtsgrundlage ist Art. 6 Abs. 1
        lit. f DSGVO.
      </p>

      <h2>Kontakt per E-Mail</h2>
      <p>
        Wenn Sie uns per E-Mail kontaktieren, werden die übermittelten Angaben zur Bearbeitung Ihrer
        Nachricht verarbeitet (Art. 6 Abs. 1 lit. b oder f DSGVO).
      </p>

      <h2>Ihre Rechte</h2>
      <p>
        Sie haben das Recht auf Auskunft, Berichtigung, Löschung, Einschränkung der Verarbeitung,
        Datenübertragbarkeit und Widerspruch. Zur Ausübung dieser Rechte genügt eine E-Mail an die oben
        genannte Adresse. Außerdem besteht ein Beschwerderecht bei einer Datenschutzaufsichtsbehörde.
      </p>
    </>
  )
}
