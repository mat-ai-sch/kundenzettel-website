import { useCallback, useEffect, useRef, useState, type MouseEvent } from 'react'
import { brandWordmarkUrl } from './brandAssets'
import { InterestLead, openInterestLeadOnClick } from './InterestLead'
import { landingCopy, landingLinks } from './landingCopy'
import { LegalMenu } from './LegalMenu'
import { ProductStory } from './landing/ProductStory'
import { StoryTransport } from './landing/StoryTransport'
import { TrustSection } from './landing/TrustSection'
import { prefersReducedMotion, useStoryTimeline } from './landing/story/storyProgress'
import './LandingPage.css'

function claimLines(title: string): [string, string] | null {
  const needle = ' werden '
  const index = title.indexOf(needle)
  if (index <= 0) return null
  return [title.slice(0, index), title.slice(index + 1)]
}

/**
 * Öffentliche Landingpage: Header → Hero (Claim und Produkt) → Trust → Footer.
 * Der Hero steht vollständig, bevor jemand den Ablauf startet. Scrollen wechselt die Ebene.
 */
export function LandingPage() {
  const pageRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const { progressSource, scrolled, paused, flow, play, replay, pause, resume } = useStoryTimeline(stageRef)
  const [receding, setReceding] = useState(false)
  const [trustNear, setTrustNear] = useState(false)
  const flowRef = useRef(flow)
  const recedeTimer = useRef(0)
  useEffect(() => {
    flowRef.current = flow
  }, [flow])

  // Zustandswechsel des Transports als Live-Ansage (nicht sichtbar): Pause und Fortsetzen, nie beim ersten Rendern.
  const [transportNote, setTransportNote] = useState('')
  const lastPaused = useRef(false)
  useEffect(() => {
    if (lastPaused.current === paused) return
    lastPaused.current = paused
    setTransportNote(paused ? landingCopy.liveTransportPaused : landingCopy.liveTransportResumed)
  }, [paused])

  useEffect(() => {
    const page = pageRef.current
    if (!page || prefersReducedMotion()) return
    let frame = 0
    let x = 72
    let y = 14
    const paint = () => {
      frame = 0
      page.style.setProperty('--lp-lx', `${x.toFixed(2)}%`)
      page.style.setProperty('--lp-ly', `${y.toFixed(2)}%`)
    }
    const onMove = (event: PointerEvent) => {
      if (event.pointerType !== 'mouse') return
      x = 72 + (event.clientX / window.innerWidth - 0.5) * 8
      y = 14 + (event.clientY / window.innerHeight - 0.5) * 5
      if (!frame) frame = window.requestAnimationFrame(paint)
    }
    window.addEventListener('pointermove', onMove, { passive: true })
    return () => {
      window.removeEventListener('pointermove', onMove)
      if (frame) window.cancelAnimationFrame(frame)
    }
  }, [])

  const beginFlow = useCallback(() => {
    const current = flowRef.current
    if (current === 'REDUCED_MOTION' || current === 'PLAYING' || current === 'REPLAYING' || current === 'PAUSED') return
    if (recedeTimer.current) return
    const replayNow = current === 'COMPLETED'
    setReceding(true)
    recedeTimer.current = window.setTimeout(() => {
      if (replayNow) replay()
      else play()
      recedeTimer.current = window.setTimeout(() => {
        recedeTimer.current = 0
        setReceding(false)
      }, prefersReducedMotion() ? 0 : 40)
    }, prefersReducedMotion() ? 0 : 340)
  }, [play, replay])

  const replayFlow = useCallback(() => {
    if (flowRef.current === 'REDUCED_MOTION' || recedeTimer.current) return
    setReceding(true)
    recedeTimer.current = window.setTimeout(() => {
      replay()
      recedeTimer.current = window.setTimeout(() => {
        recedeTimer.current = 0
        setReceding(false)
      }, prefersReducedMotion() ? 0 : 40)
    }, prefersReducedMotion() ? 0 : 340)
  }, [replay])

  useEffect(() => () => window.clearTimeout(recedeTimer.current), [])

  useEffect(() => {
    const trust = document.getElementById('lp-trust')
    if (!trust || typeof IntersectionObserver === 'undefined') return
    const observer = new IntersectionObserver(
      ([entry]) => setTrustNear(entry.isIntersecting && entry.intersectionRatio >= 0.15),
      { threshold: [0, 0.15, 0.35] },
    )
    observer.observe(trust)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    document.documentElement.classList.add('landing-document')
    document.body.classList.add('landing-document')
    const viewport = document.querySelector<HTMLMetaElement>('meta[name="viewport"]')
    const previousViewport = viewport?.content
    if (viewport) viewport.content = 'width=device-width, initial-scale=1.0, viewport-fit=cover'

    return () => {
      document.documentElement.classList.remove('landing-document')
      document.body.classList.remove('landing-document')
      if (viewport && previousViewport) viewport.content = previousViewport
    }
  }, [])

  const scrollToTrust = useCallback((event: MouseEvent) => {
    event.preventDefault()
    document.getElementById('lp-trust')?.scrollIntoView({
      behavior: prefersReducedMotion() ? 'auto' : 'smooth',
      block: 'start',
    })
    // Tastatur und Screenreader setzen in der Trust-Ebene fort (04 §8).
    document.getElementById('lp-trust-title')?.focus({ preventScroll: true })
  }, [])

  const claim = claimLines(landingCopy.title)

  return (
    <div className="lp-page" ref={pageRef} data-trust={trustNear ? '' : undefined}>
      <header className={`lp-header${scrolled ? ' is-scrolled' : ''}`}>
        <div className="lp-header-inner">
          <a className="lp-brand" href="/" aria-label="Kundenzettel, Startseite">
            <img src={brandWordmarkUrl} alt="Kundenzettel" fetchPriority="high" />
          </a>
          <nav className="lp-nav" aria-label="Hauptnavigation">
            <a className="lp-nav-link" href={landingLinks.demo}>
              {landingCopy.navDemo}
            </a>
            <a className="lp-btn lp-btn-primary lp-btn-compact" href={landingLinks.pilot} onClick={openInterestLeadOnClick}>
              {landingCopy.navPilot}
            </a>
          </nav>
        </div>
      </header>

      <main>
        <section className="lp-hero" aria-labelledby="lp-title" data-flow={flow}>
          <div className="lp-hero-grid">
            <div className="lp-copy">
              <h1 id="lp-title" className="lp-title">
                {claim ? (
                  <>
                    <span className="lp-title-line">{claim[0]}</span>
                    <span className="lp-title-line">{claim[1]}</span>
                  </>
                ) : (
                  landingCopy.title
                )}
              </h1>
              <p className="lp-subtitle">{landingCopy.subtitle}</p>
              {/* CTA-Zeile: nur Desktop und gestapelt; mobil bleibt der Header-CTA (Brief §4.3). */}
              <div className="lp-hero-cta">
                <a className="lp-btn lp-btn-primary" href={landingLinks.pilot} onClick={openInterestLeadOnClick}>
                  {landingCopy.primaryCta}
                </a>
                <a className="lp-hero-demo" href={landingLinks.demo}>
                  {landingCopy.secondaryCta}
                </a>
              </div>
              {/* Vor der Bühne im DOM (Tastatur erreicht den Transport vor den Bühnenfeldern). */}
              <StoryTransport phase={flow} onPlay={beginFlow} onPause={pause} onResume={resume} onReplay={replayFlow} />
            </div>
            <div className={`lp-stage-wrap${receding ? ' is-receding' : ''}`} ref={stageRef}>
              <ProductStory progressSource={progressSource} />
            </div>
          </div>
          <div className="lp-hero-foot">
            {/* Statischer Scroll-Cue: immer vorhanden, keine Animation (IX-V2), Fokus folgt in die Trust-Ebene. */}
            <a className="lp-next" href="#lp-trust" onClick={scrollToTrust} aria-label={landingCopy.nextAria}>
              <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">
                <path d="M12 4v15m0 0-6-6m6 6 6-6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </a>
          </div>
          <p className="lp-sr-only">{landingCopy.storySummary}</p>
          <p className="lp-sr-only" role="status" aria-live="polite">
            {transportNote}
          </p>
        </section>

        <TrustSection />
      </main>

      <footer className="lp-footer">
        <div className="lp-footer-inner">
          <div className="lp-footer-identity">
            <img className="lp-footer-brand" src={brandWordmarkUrl} alt="Kundenzettel" loading="lazy" />
            <p className="lp-footer-provider">
              Anbieterin des geplanten Dienstes: <a href="/anbieter/">WUNDERWERKstatt – Damaris Schürmann</a>
            </p>
          </div>
          <nav className="lp-footer-links" aria-label="Rechtliches und Kontakt">
            <a href="#impressum">{landingCopy.footerImprint}</a>
            <a href="#datenschutz">{landingCopy.footerPrivacy}</a>
            <a className="lp-footer-mail" href={landingLinks.mail} onClick={openInterestLeadOnClick}>
              {landingCopy.footerMail}
            </a>
          </nav>
        </div>
      </footer>
      {/* Bestehende Rechtstexte der Anwendung, geöffnet per #impressum / #datenschutz. */}
      <LegalMenu />
      {/* Derselbe Kontakt-Dialog wie „Kontakt“ in der Demo (InterestLead). */}
      <InterestLead />
    </div>
  )
}
