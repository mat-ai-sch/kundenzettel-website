import { lazy, StrictMode, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import './index.css'
import { publicPortalSurface } from './publicHost'
import { isOperatorRuntime } from './runtimeMode'

// A development preview must always load the current source. Registering the
// production service worker locally can otherwise serve an old app shell.
if (!import.meta.env.DEV) {
  registerSW({ immediate: true })
}

const isPublicLanding = !isOperatorRuntime() && publicPortalSurface(window.location.hostname) === 'landing'
// Load only the requested surface, including its CSS and dependencies.
const Surface = isPublicLanding
  ? lazy(() => import('./LandingPage').then(({ LandingPage }) => ({ default: LandingPage })))
  : lazy(() => import('./App'))

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Suspense fallback={null}><Surface /></Suspense>
  </StrictMode>,
)
