import { lazy, StrictMode, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { publicPortalSurface } from './publicHost'
import { isOperatorRuntime } from './runtimeMode'

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
