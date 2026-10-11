import { OperatorApiError, operatorApi, type OperatorApiStatus } from './operatorApi'
import { isOperatorRuntime, runtimeConfig } from './runtimeMode'

/**
 * WhatsApp Cloud API status adapter. Meta credentials stay in the Worker;
 * this browser module calls only the protected operator API.
 */

export type WaConnectionState = 'checking' | 'connected' | 'degraded' | 'failed' | 'access_required'

export interface WaConnectionStatus {
  state: WaConnectionState
  /** Kurzlabel für die UI */
  label: string
  /** Technischer Hinweis (Tooltip / Debug) */
  detail: string
  checkedAt: string
  /** Server-authoritative gate; false until media has separately been released. */
  mediaEnabled: boolean
  /** Protected, content-free operational timing information. */
  ingress?: OperatorApiStatus['health']
}

/** Meta Graph / WhatsApp Cloud API – Konfigurationsvertrag */
export interface MetaWhatsAppCloudConfig {
  /** Optional public setup metadata; never a token or App Secret. */
  appId: string
  /** WhatsApp Business Account ID (WABA) */
  businessAccountId: string
  /** Phone Number ID der Cloud-API-Nummer */
  phoneNumberId: string
  /** Graph-API-Version, z. B. v21.0 */
  graphApiVersion: string
  /** Protected Worker endpoint; defaults to the operator API. */
  statusEndpoint: string
  /** true = public preview, no API call permitted */
  demoMode: boolean
}

const GRAPH_BASE = 'https://graph.facebook.com'

export function readMetaWhatsAppConfig(): MetaWhatsAppCloudConfig {
  const env = import.meta.env

  return {
    appId: String(env.VITE_META_APP_ID ?? ''),
    businessAccountId: String(env.VITE_WA_BUSINESS_ACCOUNT_ID ?? ''),
    phoneNumberId: String(env.VITE_WA_PHONE_NUMBER_ID ?? ''),
    graphApiVersion: String(env.VITE_META_GRAPH_VERSION ?? 'v21.0'),
    statusEndpoint: `${runtimeConfig.apiBase}/whatsapp/status`,
    // Preview is the only fallback. A build must explicitly opt into operator.
    demoMode: !isOperatorRuntime(),
  }
}

/** Graph-URL-Bausteine für spätere Backend-Integration (nicht clientseitig mit Token aufrufen). */
export function buildPhoneNumberProbeUrl(config: MetaWhatsAppCloudConfig): string {
  const version = config.graphApiVersion.replace(/^\//, '')
  return `${GRAPH_BASE}/${version}/${config.phoneNumberId}?fields=display_phone_number,verified_name,quality_rating`
}

export function buildConnectedLabel(state: WaConnectionState): string {
  if (state === 'connected') return 'Online'
  if (state === 'degraded') return 'Eingeschränkt'
  if (state === 'checking') return 'Verbindung wird geprüft…'
  if (state === 'access_required') return 'Zugriff erforderlich'
  return 'Offline'
}

function statusOf(
  state: WaConnectionState,
  detail: string,
  mediaEnabled = false,
  checkedAt = new Date().toISOString(),
  ingress?: OperatorApiStatus['health'],
): WaConnectionStatus {
  return {
    state,
    label: buildConnectedLabel(state),
    detail,
    checkedAt,
    mediaEnabled,
    ...(ingress ? { ingress } : {}),
  }
}

/**
 * Preview: never calls an API. Operator: calls the protected Worker status
 * endpoint, which is the only component allowed to inspect Meta credentials.
 */
export async function probeWhatsAppConnection(
  config: MetaWhatsAppCloudConfig = readMetaWhatsAppConfig(),
): Promise<WaConnectionStatus> {
  if (config.demoMode) {
    return statusOf(
      'failed',
      'Öffentliche Vorschau: keine WhatsApp-Cloud-Verbindung.',
    )
  }

  try {
    const body = await operatorApi.getStatus()
    if (body.connected) {
      const health = body.health
      const observedSeconds = health?.lastInboundObservedLatencyMs === undefined
        ? undefined
        : Math.round(health.lastInboundObservedLatencyMs / 1_000)
      const p95Seconds = health?.measurements.p95LatencyMs === undefined
        ? undefined
        : Math.ceil(health.measurements.p95LatencyMs / 1_000)
      const detail = health?.ingress === 'delayed'
        ? `Cloud API antwortet · letzter Eingang nach ${observedSeconds}s gespeichert`
        : health?.ingress === 'within_target'
          ? `Cloud API antwortet · letzter Eingang in ${observedSeconds}s gespeichert`
          : health?.ingress === 'awaiting_test'
            ? 'Cloud API antwortet · Warte auf eine eingehende Testnachricht'
            : `Cloud API antwortet · geprüft ${formatCheckedAt(body.checkedAt)}`
      const proofDetail = health?.measurements.sampleCount
        ? ` · PoC ${health.measurements.withinTargetCount}/${health.measurements.sampleCount} ≤ 5s, p95 ${p95Seconds}s`
        : ''
      return statusOf(
        health?.ingress === 'delayed' ? 'degraded' : 'connected',
        `${detail}${proofDetail}`,
        body.capabilities.media,
        body.checkedAt,
        health,
      )
    }
    return statusOf(
      'failed',
      body.message || 'WhatsApp ist derzeit offline.',
      body.capabilities.media,
      body.checkedAt,
    )
  } catch (error) {
    if (error instanceof OperatorApiError && error.status === 401) {
      return statusOf('access_required', 'Geschützter Betreiberzugang erforderlich.')
    }
    return statusOf('failed', 'WhatsApp-Status konnte nicht geprüft werden.')
  }
}

function formatCheckedAt(value?: string): string {
  if (!value) return 'gerade eben'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'gerade eben'
  return new Intl.DateTimeFormat('de-DE', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}
