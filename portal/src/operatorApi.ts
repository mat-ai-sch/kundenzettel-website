import type {
  ArchivedOrder,
  ChatList,
  Conversation,
  GroupMessage,
  Message,
  MessageKind,
  OrderStatus,
  StructuredOrder,
} from './data'
import { isOperatorRuntime, runtimeConfig, type RuntimeConfig } from './runtimeMode'

/**
 * Browser-side contract for the protected Worker API.
 *
 * No Meta token, App Secret, WABA id, or phone-number id belongs here. The
 * Worker owns those secrets and exposes only the application data below.
 */
export type OperatorApiStatus = {
  connected: boolean
  checkedAt?: string
  displayPhoneNumber?: string
  message?: string
  health?: {
    lastWebhookAt?: string
    lastInboundAt?: string
    lastInboundObservedLatencyMs?: number
    measurements: {
      sampleCount: number
      withinTargetCount: number
      p95LatencyMs?: number
    }
    ingress: 'awaiting_test' | 'within_target' | 'delayed' | 'unknown'
    targetIngressLatencyMs: number
  }
  capabilities: {
    text: boolean
    media: boolean
    deleteMessage: boolean
    deleteConversation: boolean
  }
}

export type OperatorMedia = {
  id: string
  url?: string
  thumbnailUrl?: string
  contentType?: string
  fileName?: string
  sizeBytes?: number
  duration?: string
}

export type OperatorOutgoingMessage = {
  clientMessageId: string
  kind: MessageKind
  text?: string
  transcript?: string
  documentName?: string
  duration?: string
  replyToMessageId?: string
  media?: OperatorMedia
}

export type OperatorOrderPatch = {
  status?: OrderStatus
  structured?: Partial<StructuredOrder>
}

export type OperatorConversationPatch = Pick<
  Partial<Conversation>,
  'muted' | 'pinned' | 'blocked' | 'unread'
>

export type OperatorConversationResponse = {
  conversation?: Conversation
  message?: Message
}

export type OperatorGroupMessageResponse = {
  group?: ChatList
  groupMessage?: GroupMessage
}

export type OperatorArchivedOrderResponse = {
  order?: ArchivedOrder
  conversation?: Conversation
}

export type OperatorEvent =
  | { type: 'conversation'; conversationId?: string }
  | { type: 'message'; conversationId?: string; messageId?: string }
  | { type: 'status' }
  | { type: 'connected' }

export class OperatorApiError extends Error {
  readonly status: number
  readonly code?: string

  constructor(message: string, status = 0, code?: string) {
    super(message)
    this.name = 'OperatorApiError'
    this.status = status
    this.code = code
  }
}

type FetchLike = typeof fetch

function joinApiPath(base: string, path: string): string {
  const normalisedPath = path.startsWith('/') ? path : `/${path}`
  return `${base}${normalisedPath}`
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function apiErrorMessage(body: unknown, fallback: string): string {
  if (!isRecord(body)) return fallback
  if (typeof body.message === 'string' && body.message.trim()) return body.message
  if (typeof body.error === 'string' && body.error.trim()) return body.error
  if (isRecord(body.error) && typeof body.error.message === 'string' && body.error.message.trim()) {
    return body.error.message
  }
  return fallback
}

async function readJson(response: Response): Promise<unknown> {
  const type = response.headers.get('content-type') ?? ''
  if (!type.includes('application/json')) return null
  try {
    return await response.json()
  } catch {
    return null
  }
}

function ensureOperatorRuntime(config: RuntimeConfig) {
  if (config.mode !== 'operator') {
    throw new OperatorApiError(
      'Die öffentliche Vorschau darf keine Operator-Daten anfordern.',
    )
  }
}

function supportsScriptBootstrap(config: RuntimeConfig): boolean {
  return config.mode === 'operator'
    && config.apiBase === '/_v'
    && typeof window !== 'undefined'
    && typeof document !== 'undefined'
}

/**
 * The response supports the documented { conversations } envelope and a raw
 * array to keep staging migrations non-breaking.  The Worker should use the
 * envelope in production.
 */
function conversationsFromBody(body: unknown): Conversation[] {
  if (Array.isArray(body)) return body as Conversation[]
  if (isRecord(body) && Array.isArray(body.conversations)) {
    return body.conversations as Conversation[]
  }
  return []
}

function chatGroupsFromBody(body: unknown): ChatList[] {
  if (!isRecord(body) || !Array.isArray(body.groups)) return []
  return body.groups.flatMap((entry) => {
    if (!isRecord(entry) || typeof entry.id !== 'string' || typeof entry.name !== 'string') return []
    const conversationIds = Array.isArray(entry.conversationIds)
      ? entry.conversationIds.filter((value): value is string => typeof value === 'string')
      : []
    const messages = Array.isArray(entry.messages)
      ? entry.messages.flatMap((message) => {
          if (!isRecord(message) || typeof message.id !== 'string' || typeof message.text !== 'string' || typeof message.createdAt !== 'string') return []
          return [{
            id: message.id,
            text: message.text,
            createdAt: message.createdAt,
            recipientCount: typeof message.recipientCount === 'number' ? message.recipientCount : 0,
            queuedCount: typeof message.queuedCount === 'number' ? message.queuedCount : 0,
            skippedCount: typeof message.skippedCount === 'number' ? message.skippedCount : 0,
          }]
        })
      : undefined
    return [{
      id: entry.id,
      name: entry.name,
      chatIds: conversationIds,
      ...(messages ? { messages } : {}),
      ...(typeof entry.createdAt === 'string' ? { createdAt: entry.createdAt } : {}),
      ...(typeof entry.updatedAt === 'string' ? { updatedAt: entry.updatedAt } : {}),
    }]
  })
}

function archivedOrdersFromBody(body: unknown): ArchivedOrder[] {
  if (isRecord(body) && Array.isArray(body.orders)) return body.orders as ArchivedOrder[]
  return []
}

function statusFromBody(body: unknown): OperatorApiStatus {
  const capabilities = isRecord(body) && isRecord(body.capabilities)
    ? body.capabilities
    : {}
  if (!isRecord(body)) {
    return {
      connected: false,
      capabilities: { text: true, media: false, deleteMessage: true, deleteConversation: true },
    }
  }
  return {
    connected: body.connected === true,
    checkedAt: typeof body.checkedAt === 'string' ? body.checkedAt : undefined,
    displayPhoneNumber:
      typeof body.displayPhoneNumber === 'string'
        ? body.displayPhoneNumber
        : undefined,
    message: typeof body.message === 'string' ? body.message : undefined,
    health: isRecord(body.health) && (
      body.health.ingress === 'awaiting_test'
      || body.health.ingress === 'within_target'
      || body.health.ingress === 'delayed'
      || body.health.ingress === 'unknown'
    )
      ? {
          ingress: body.health.ingress,
          targetIngressLatencyMs: typeof body.health.targetIngressLatencyMs === 'number'
            ? body.health.targetIngressLatencyMs
            : 5_000,
          ...(typeof body.health.lastWebhookAt === 'string' ? { lastWebhookAt: body.health.lastWebhookAt } : {}),
          ...(typeof body.health.lastInboundAt === 'string' ? { lastInboundAt: body.health.lastInboundAt } : {}),
          ...(typeof body.health.lastInboundObservedLatencyMs === 'number'
            ? { lastInboundObservedLatencyMs: body.health.lastInboundObservedLatencyMs }
            : {}),
          measurements: isRecord(body.health.measurements)
            ? {
                sampleCount: typeof body.health.measurements.sampleCount === 'number'
                  ? body.health.measurements.sampleCount
                  : 0,
                withinTargetCount: typeof body.health.measurements.withinTargetCount === 'number'
                  ? body.health.measurements.withinTargetCount
                  : 0,
                ...(typeof body.health.measurements.p95LatencyMs === 'number'
                  ? { p95LatencyMs: body.health.measurements.p95LatencyMs }
                  : {}),
              }
            : { sampleCount: 0, withinTargetCount: 0 },
        }
      : undefined,
    capabilities: {
      text: capabilities.text !== false,
      media: capabilities.media === true,
      deleteMessage: capabilities.deleteMessage !== false,
      deleteConversation: capabilities.deleteConversation !== false,
    },
  }
}

function liveRevisionFromBody(body: unknown): string {
  if (isRecord(body) && typeof body.revision === 'string' && body.revision) return body.revision
  throw new OperatorApiError('Die Live-Aktualisierung von Kundenzettel ist nicht erreichbar.')
}

function eventFromRaw(raw: string, fallbackType: string): OperatorEvent {
  try {
    const value: unknown = JSON.parse(raw)
    if (isRecord(value)) {
      const type =
        value.type === 'conversation' || value.type === 'message' || value.type === 'status'
          ? value.type
          : fallbackType === 'status'
            ? 'status'
            : fallbackType === 'message'
              ? 'message'
              : 'conversation'
      return {
        type,
        conversationId:
          typeof value.conversationId === 'string' ? value.conversationId : undefined,
        messageId: typeof value.messageId === 'string' ? value.messageId : undefined,
      } as OperatorEvent
    }
  } catch {
    // A generic SSE event still means the local snapshot may be stale.
  }
  if (fallbackType === 'status') return { type: 'status' }
  if (fallbackType === 'message') return { type: 'message' }
  return { type: 'conversation' }
}

export class OperatorApiClient {
  private readonly config: RuntimeConfig
  private readonly request: FetchLike

  constructor(config: RuntimeConfig = runtimeConfig, request: FetchLike = fetch) {
    this.config = config
    this.request = request
  }

  private url(path: string): string {
    return joinApiPath(this.config.apiBase, path)
  }

  private async jsonRequest(
    path: string,
    init: RequestInit = {},
  ): Promise<unknown> {
    ensureOperatorRuntime(this.config)
    let response: Response
    try {
      response = await this.request(this.url(path), {
        credentials: 'include',
        // Cloudflare Access redirects unauthenticated requests to its login
        // host. Keeping the redirect visible lets the UI distinguish a
        // missing operator session from an unavailable Worker.
        redirect: 'manual',
        ...init,
        headers: {
          Accept: 'application/json',
          ...init.headers,
        },
      })
    } catch {
      throw new OperatorApiError('Die geschützte Kundenzettel-API ist nicht erreichbar.')
    }
    if (response.type === 'opaqueredirect') {
      throw new OperatorApiError('Geschützter Betreiberzugang erforderlich.', 401, 'OPERATOR_AUTH_REQUIRED')
    }
    const body = await readJson(response)
    if (!response.ok) {
      throw new OperatorApiError(
        apiErrorMessage(body, 'Die Anfrage an Kundenzettel ist fehlgeschlagen.'),
        response.status,
        isRecord(body) && typeof body.code === 'string'
          ? body.code
          : isRecord(body) && isRecord(body.error) && typeof body.error.code === 'string'
            ? body.error.code
            : undefined,
      )
    }
    return body
  }

  /**
   * Some embedded browsers reject a protected same-origin fetch before it can
   * reach Cloudflare Access. This uses a short-lived external script instead;
   * the Worker still checks Access and accepts only same-origin script loads.
   */
  private scriptBootstrap(resource: 'status' | 'conversations' | 'chat-groups' | 'live'): Promise<unknown> {
    if (!supportsScriptBootstrap(this.config)) {
      return Promise.reject(new OperatorApiError('Die geschützte Kundenzettel-API ist nicht erreichbar.'))
    }
    return new Promise((resolve, reject) => {
      const suffix = `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 14)}`
      const callback = `__kundenzettelBootstrap_${suffix}`
      const target = window as unknown as Record<string, unknown>
      const script = document.createElement('script')
      const cleanup = () => {
        delete target[callback]
        script.remove()
      }
      const timer = window.setTimeout(() => {
        cleanup()
        reject(new OperatorApiError('Die geschützte Kundenzettel-API ist nicht erreichbar.'))
      }, 10_000)
      target[callback] = (body: unknown) => {
        window.clearTimeout(timer)
        cleanup()
        resolve(body)
      }
      script.async = true
      script.onerror = () => {
        window.clearTimeout(timer)
        cleanup()
        reject(new OperatorApiError('Die geschützte Kundenzettel-API ist nicht erreichbar.'))
      }
      script.src = `${this.url('/bootstrap')}?resource=${encodeURIComponent(resource)}&callback=${encodeURIComponent(callback)}`
      document.head.append(script)
    })
  }

  /**
   * Form+iframe fallback for the one text action required in the initial
   * operator release. Unlike fetch, a regular same-origin form submission is
   * accepted by restrictive embedded browsers. The response is delivered via
   * a nonce-bound postMessage from a protected, temporary iframe.
   */
  private formBridge(operation: 'send-message' | 'send-group-message', payload: Record<string, unknown>): Promise<unknown> {
    if (!supportsScriptBootstrap(this.config)) {
      return Promise.reject(new OperatorApiError('Die geschützte Kundenzettel-API ist nicht erreichbar.'))
    }
    return new Promise((resolve, reject) => {
      const suffix = `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 14)}`
      const callback = `__kundenzettelBridge_${suffix}`
      const frame = document.createElement('iframe')
      const form = document.createElement('form')
      const cleanup = () => {
        window.clearTimeout(timer)
        window.removeEventListener('message', receive)
        form.remove()
        frame.remove()
      }
      const rejectUnavailable = () => {
        cleanup()
        reject(new OperatorApiError('Die geschützte Kundenzettel-API ist nicht erreichbar.'))
      }
      const receive = (event: MessageEvent<unknown>) => {
        if (event.origin !== window.location.origin || !isRecord(event.data)) return
        if (event.data.source !== 'kundenzettel-operator' || event.data.callback !== callback) return
        cleanup()
        const status = typeof event.data.status === 'number' ? event.data.status : 0
        const body = event.data.body
        if (event.data.ok === true) resolve(body)
        else reject(new OperatorApiError(apiErrorMessage(body, 'Die Anfrage an Kundenzettel ist fehlgeschlagen.'), status))
      }
      const timer = window.setTimeout(rejectUnavailable, 10_000)
      frame.name = callback
      frame.title = 'Kundenzettel-Betreibertransport'
      frame.hidden = true
      form.method = 'POST'
      form.action = this.url('/bridge')
      form.target = callback
      form.hidden = true
      for (const [name, value] of Object.entries({
        operation,
        callback,
        payload: JSON.stringify(payload),
      })) {
        const input = document.createElement('input')
        input.type = 'hidden'
        input.name = name
        input.value = value
        form.append(input)
      }
      window.addEventListener('message', receive)
      document.body.append(frame, form)
      form.submit()
    })
  }

  async getStatus(): Promise<OperatorApiStatus> {
    let body: unknown
    try {
      body = await this.jsonRequest('/whatsapp/status')
    } catch (error) {
      if (!(error instanceof OperatorApiError) || error.status !== 0) throw error
      body = await this.scriptBootstrap('status')
    }
    return statusFromBody(body)
  }

  async listConversations(): Promise<Conversation[]> {
    let body: unknown
    try {
      body = await this.jsonRequest('/conversations')
    } catch (error) {
      if (!(error instanceof OperatorApiError) || error.status !== 0) throw error
      body = await this.scriptBootstrap('conversations')
    }
    return conversationsFromBody(body)
  }

  async listChatGroups(): Promise<ChatList[]> {
    let body: unknown
    try {
      body = await this.jsonRequest('/chat-groups')
    } catch (error) {
      if (!(error instanceof OperatorApiError) || error.status !== 0) throw error
      body = await this.scriptBootstrap('chat-groups')
    }
    return chatGroupsFromBody(body)
  }

  async createChatGroup(name: string, conversationId?: string): Promise<ChatList | undefined> {
    const body = await this.jsonRequest('/chat-groups', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, ...(conversationId ? { conversationId } : {}) }),
    })
    return chatGroupsFromBody(isRecord(body) && isRecord(body.group) ? { groups: [body.group] } : body)[0]
  }

  async addChatToGroup(groupId: string, conversationId: string): Promise<ChatList | undefined> {
    const body = await this.jsonRequest(
      `/chat-groups/${encodeURIComponent(groupId)}/members/${encodeURIComponent(conversationId)}`,
      { method: 'POST' },
    )
    return chatGroupsFromBody(isRecord(body) && isRecord(body.group) ? { groups: [body.group] } : body)[0]
  }

  async removeChatFromGroup(groupId: string, conversationId: string): Promise<ChatList | undefined> {
    const body = await this.jsonRequest(
      `/chat-groups/${encodeURIComponent(groupId)}/members/${encodeURIComponent(conversationId)}`,
      { method: 'DELETE' },
    )
    return chatGroupsFromBody(isRecord(body) && isRecord(body.group) ? { groups: [body.group] } : body)[0]
  }

  async deleteChatGroup(groupId: string): Promise<void> {
    await this.jsonRequest(`/chat-groups/${encodeURIComponent(groupId)}`, { method: 'DELETE' })
  }

  async getChatGroup(groupId: string): Promise<ChatList | undefined> {
    const body = await this.jsonRequest(`/chat-groups/${encodeURIComponent(groupId)}`)
    return chatGroupsFromBody(isRecord(body) && isRecord(body.group) ? { groups: [body.group] } : body)[0]
  }

  async sendChatGroupMessage(
    groupId: string,
    input: { clientMessageId: string; text: string },
  ): Promise<OperatorGroupMessageResponse> {
    let body: unknown
    try {
      body = await this.jsonRequest(`/chat-groups/${encodeURIComponent(groupId)}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      })
    } catch (error) {
      if (!(error instanceof OperatorApiError) || error.status !== 0) throw error
      body = await this.formBridge('send-group-message', { groupId, message: input })
    }
    if (!isRecord(body)) return {}
    const group = chatGroupsFromBody(isRecord(body.group) ? { groups: [body.group] } : body)[0]
    const item = isRecord(body.groupMessage) ? body.groupMessage : undefined
    const groupMessage = item && typeof item.id === 'string' && typeof item.text === 'string' && typeof item.createdAt === 'string'
      ? {
          id: item.id,
          text: item.text,
          createdAt: item.createdAt,
          recipientCount: typeof item.recipientCount === 'number' ? item.recipientCount : 0,
          queuedCount: typeof item.queuedCount === 'number' ? item.queuedCount : 0,
          skippedCount: typeof item.skippedCount === 'number' ? item.skippedCount : 0,
        }
      : undefined
    return { ...(group ? { group } : {}), ...(groupMessage ? { groupMessage } : {}) }
  }

  /**
   * A minimal change marker for the one-second fallback in embedded browsers.
   * It contains no chat or customer data; the app fetches a full snapshot only
   * after the marker actually changes.
   */
  async liveRevision(): Promise<string> {
    let body: unknown
    try {
      body = await this.jsonRequest('/live')
    } catch (error) {
      if (!(error instanceof OperatorApiError) || error.status !== 0) throw error
      body = await this.scriptBootstrap('live')
    }
    return liveRevisionFromBody(body)
  }

  async sendMessage(
    conversationId: string,
    message: OperatorOutgoingMessage,
  ): Promise<OperatorConversationResponse> {
    let body: unknown
    try {
      body = await this.jsonRequest(
        `/conversations/${encodeURIComponent(conversationId)}/messages`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(message),
        },
      )
    } catch (error) {
      if (!(error instanceof OperatorApiError) || error.status !== 0) throw error
      body = await this.formBridge('send-message', { conversationId, message })
    }
    return isRecord(body) ? (body as OperatorConversationResponse) : {}
  }

  async patchOrder(
    conversationId: string,
    patch: OperatorOrderPatch,
  ): Promise<OperatorConversationResponse> {
    const body = await this.jsonRequest(
      `/conversations/${encodeURIComponent(conversationId)}/order`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      },
    )
    return isRecord(body) ? (body as OperatorConversationResponse) : {}
  }

  async patchConversation(
    conversationId: string,
    patch: OperatorConversationPatch,
  ): Promise<OperatorConversationResponse> {
    const body = await this.jsonRequest(
      `/conversations/${encodeURIComponent(conversationId)}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      },
    )
    return isRecord(body) ? (body as OperatorConversationResponse) : {}
  }

  async listArchivedOrders(conversationId: string): Promise<ArchivedOrder[]> {
    const body = await this.jsonRequest(`/conversations/${encodeURIComponent(conversationId)}/orders`)
    return archivedOrdersFromBody(body)
  }

  async archiveOrder(conversationId: string, version?: number): Promise<OperatorArchivedOrderResponse> {
    const body = await this.jsonRequest(`/conversations/${encodeURIComponent(conversationId)}/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(version === undefined ? {} : { version }),
    })
    return isRecord(body) ? (body as OperatorArchivedOrderResponse) : {}
  }

  async startOrderDraftAfterMessage(
    conversationId: string,
    messageId: string,
    version?: number,
  ): Promise<OperatorConversationResponse> {
    const body = await this.jsonRequest(
      `/conversations/${encodeURIComponent(conversationId)}/order-boundary`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messageId, ...(version === undefined ? {} : { version }) }),
      },
    )
    return isRecord(body) ? (body as OperatorConversationResponse) : {}
  }

  async uploadMedia(file: File): Promise<OperatorMedia> {
    ensureOperatorRuntime(this.config)
    const form = new FormData()
    form.set('file', file, file.name)
    const body = await this.jsonRequest('/media', {
      method: 'POST',
      body: form,
    })
    if (isRecord(body) && isRecord(body.media) && typeof body.media.id === 'string') {
      return body.media as unknown as OperatorMedia
    }
    if (isRecord(body) && typeof body.id === 'string') return body as unknown as OperatorMedia
    throw new OperatorApiError('Die Medienantwort von Kundenzettel ist unvollständig.')
  }

  async deleteMessage(conversationId: string, messageId: string, version?: number): Promise<void> {
    await this.jsonRequest(
      `/conversations/${encodeURIComponent(conversationId)}/messages/${encodeURIComponent(messageId)}`,
      {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(version === undefined ? {} : { version }),
      },
    )
  }

  async deleteConversation(conversationId: string, version?: number): Promise<void> {
    await this.jsonRequest(`/conversations/${encodeURIComponent(conversationId)}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(version === undefined ? {} : { version }),
    })
  }

  async deleteConversations(
    conversations: Array<{ conversationId: string; version?: number }>,
  ): Promise<void> {
    await this.jsonRequest('/conversations', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conversations }),
    })
  }

  /**
   * SSE only ever triggers a fresh server snapshot; event payloads are not
   * treated as authoritative customer data in the browser.
   */
  subscribe(
    onEvent: (event: OperatorEvent) => void,
    onError?: () => void,
    onOpen?: () => void,
  ): (() => void) | null {
    if (this.config.mode !== 'operator' || !this.config.eventsEnabled) return null
    if (typeof EventSource === 'undefined') return null

    const source = new EventSource(this.url('/events'), { withCredentials: true })
    const receive = (event: MessageEvent<string>) => onEvent(eventFromRaw(event.data, event.type))
    source.addEventListener('conversation', receive)
    source.addEventListener('message', receive)
    source.addEventListener('status', receive)
    source.onmessage = (event) => onEvent(eventFromRaw(event.data, 'conversation'))
    source.onopen = () => onOpen?.()
    source.onerror = () => onError?.()
    return () => source.close()
  }
}

export const operatorApi = new OperatorApiClient()

/** Useful for tests and avoids accidental fetches from the public build. */
export function operatorApiIsEnabled(): boolean {
  return isOperatorRuntime()
}
