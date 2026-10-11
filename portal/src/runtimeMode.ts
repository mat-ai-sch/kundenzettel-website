/**
 * Runtime boundary between the public GitHub Pages preview and the protected
 * operator application.  The public build must opt in to nothing: preview is
 * deliberately the fallback whenever this variable is absent or malformed.
 */
export type RuntimeMode = 'preview' | 'operator'

export type RuntimeConfig = {
  mode: RuntimeMode
  /** Base path of the protected Worker API, without a trailing slash. */
  apiBase: string
  /** Enables EventSource updates for the protected application. */
  eventsEnabled: boolean
  /** Media shipping is deliberately opt-in after the text-only launch. */
  mediaEnabled: boolean
}

type RuntimeEnv = Record<string, string | boolean | undefined>

function readString(env: RuntimeEnv, key: string): string {
  const value = env[key]
  return typeof value === 'string' ? value.trim() : ''
}

function normaliseApiBase(value: string): string {
  const base = value.trim().replace(/\/+$/, '')
  return base || '/api'
}

/**
 * Kept pure so the safety-critical preview fallback can be tested without
 * depending on Vite's import.meta.env.
 */
export function readRuntimeConfig(env: RuntimeEnv = (import.meta.env ?? {})): RuntimeConfig {
  const requestedMode = readString(env, 'VITE_RUNTIME_MODE').toLowerCase()
  const mode: RuntimeMode = requestedMode === 'operator' ? 'operator' : 'preview'
  const eventsFlag = readString(env, 'VITE_OPERATOR_EVENTS')
  const mediaFlag = readString(env, 'VITE_OPERATOR_MEDIA_ENABLED').toLowerCase()

  return {
    mode,
    apiBase: normaliseApiBase(readString(env, 'VITE_OPERATOR_API_BASE')),
    // SSE is on for the operator app unless it was explicitly turned off.
    eventsEnabled: mode === 'operator' && eventsFlag !== 'false',
    // The protected app must explicitly opt in. Preview media stays local demo
    // content and never reaches the protected API.
    mediaEnabled: mode === 'operator' && mediaFlag === 'true',
  }
}

export const runtimeConfig = readRuntimeConfig()

export function isOperatorRuntime(): boolean {
  return runtimeConfig.mode === 'operator'
}
