import { useEffect, useState } from 'react'
import { PRODUCT_NAME } from './productConfig'
import { brandWordmarkUrl } from './brandAssets'

const DISMISS_KEY = 'kz-pwa-install-dismissed'

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

function isStandaloneDisplay(): boolean {
  if (typeof window === 'undefined') return false
  const mq = window.matchMedia('(display-mode: standalone)').matches
  const iosStandalone =
    'standalone' in navigator &&
    Boolean((navigator as Navigator & { standalone?: boolean }).standalone)
  return mq || iosStandalone
}

function isIosSafari(): boolean {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent
  const iOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  const webkit = /WebKit/.test(ua)
  const chrome = /CriOS|FxiOS|EdgiOS/.test(ua)
  return iOS && webkit && !chrome
}

export function InstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null)
  const [visible, setVisible] = useState(false)
  const [iosHint, setIosHint] = useState(false)

  useEffect(() => {
    if (isStandaloneDisplay()) return
    if (sessionStorage.getItem(DISMISS_KEY) === '1') return

    const onBip = (e: Event) => {
      e.preventDefault()
      setDeferred(e as BeforeInstallPromptEvent)
      setVisible(true)
      setIosHint(false)
    }

    window.addEventListener('beforeinstallprompt', onBip)

    // iOS: kein beforeinstallprompt — sanfter Hinweis nach kurzer Verzögerung
    const iosTimer = window.setTimeout(() => {
      if (!deferred && isIosSafari() && !isStandaloneDisplay()) {
        setIosHint(true)
        setVisible(true)
      }
    }, 12_000)

    return () => {
      window.removeEventListener('beforeinstallprompt', onBip)
      window.clearTimeout(iosTimer)
    }
  }, [deferred])

  function dismiss() {
    setVisible(false)
    setDeferred(null)
    setIosHint(false)
    sessionStorage.setItem(DISMISS_KEY, '1')
  }

  async function install() {
    if (!deferred) return
    await deferred.prompt()
    await deferred.userChoice
    dismiss()
  }

  if (!visible) return null

  return (
    <div className="pwa-install" role="dialog" aria-labelledby="pwa-install-title">
      <img
        className="pwa-install-icon"
        src={brandWordmarkUrl}
        alt=""
        width={120}
        height={40}
      />
      <div className="pwa-install-copy">
        <strong id="pwa-install-title">{PRODUCT_NAME} installieren</strong>
        {iosHint ? (
          <p>
            Tippe auf Teilen und dann „Zum Home-Bildschirm“.
          </p>
        ) : (
          <p>Als App speichern — voller Bildschirm, eigenes Icon, schneller Start.</p>
        )}
      </div>
      <div className="pwa-install-actions">
        {!iosHint && deferred && (
          <button type="button" className="pwa-install-primary" onClick={() => void install()}>
            Installieren
          </button>
        )}
        <button type="button" className="pwa-install-dismiss" onClick={dismiss}>
          Später
        </button>
      </div>
    </div>
  )
}
