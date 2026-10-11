export type MessageKind = 'text' | 'voice' | 'image' | 'video' | 'document'
export type OrderStatus = 'anfrage' | 'angebot' | 'bestaetigt' | 'arbeit' | 'fertig'
export type MessageDeliveryStatus =
  | 'queued'
  | 'sent'
  | 'delivered'
  | 'read'
  | 'failed'

/**
 * Private-media metadata supplied by the protected API. `url` is a short-lived
 * protected URL, never a public object-store location.
 */
export interface MessageMedia {
  id: string
  url?: string
  thumbnailUrl?: string
  contentType?: string
  fileName?: string
  sizeBytes?: number
}

export interface Message {
  id: string
  /** Stable WhatsApp/Meta id (wamid) once Meta has accepted the message. */
  externalId?: string
  /** Full server timestamp; `at` remains the compact display label. */
  createdAt?: string
  updatedAt?: string
  from: 'kunde' | 'atelier'
  kind: MessageKind
  text?: string
  transcript?: string
  image?: string
  video?: string
  audio?: string
  documentName?: string
  fileUrl?: string
  media?: MessageMedia
  duration?: string
  at: string
  status?: MessageDeliveryStatus
  /** Safe, human-readable sending failure supplied by the protected API. */
  error?: string
  reactions?: string[]
  starred?: boolean
  pinned?: boolean
  forwarded?: boolean
  /** Optional, nur Vorname. WhatsApp zeigt oft nur „Weitergeleitet“. */
  forwardedFrom?: string
  /** Quellenangabe für freie Referenzbilder (Lizenz / Urheber). */
  attribution?: string
  /** Nachricht für alle gelöscht → Platzhalter wie bei WhatsApp */
  deletedForEveryone?: boolean
  replyTo?: {
    id: string
    preview: string
    from: 'kunde' | 'atelier'
  }
}

export interface StructuredOrder {
  produkt: string
  /** Erster klarer Kundenwunsch (vor Pivot/Ablehnung). */
  ursprungswunsch?: string
  groesse?: string
  variante?: string
  anlass?: string
  termin?: string
  lieferung?: string
  adresse?: string
  abholung?: string
  budget?: string
  preisVereinbart?: string
  preisBegruendung?: string
  rohling?: string
  stil?: string
  farben?: string
  abgelehnt?: string
  referenz?: string
  blumenauswahl?: string
  medien?: string
  kanal?: string
  notizen: string
  konfidenz: number
  sku?: string
}

export const orderFieldLabels: Record<string, string> = {
  produkt: 'Produkt',
  ursprungswunsch: 'Ursprungswunsch',
  sku: 'Auftrags-Nr.',
  groesse: 'Größe',
  rohling: 'Rohling',
  stil: 'Stil',
  farben: 'Farbwelt',
  variante: 'Variante',
  abgelehnt: 'Abgelehnt',
  referenz: 'Referenzen',
  blumenauswahl: 'Blumenauswahl',
  anlass: 'Anlass',
  termin: 'Termin',
  abholung: 'Abholung',
  lieferung: 'Lieferung',
  adresse: 'Adresse',
  budget: 'Budget (Wunsch)',
  preisVereinbart: 'Preis (vereinbart)',
  preisBegruendung: 'Preisanpassung',
  medien: 'Medien aus Chat',
  kanal: 'Kanal',
  notizen: 'Zusammenfassung',
}

export interface Conversation {
  id: string
  /** Stable server-side conversation id, when different from the UI id. */
  externalId?: string
  createdAt?: string
  updatedAt?: string
  /** Optimistic-concurrency version supplied by the protected API. */
  version?: number
  /**
   * Server-authoritative boundary of the mutable order draft. Messages up to
   * and including this id belong to an already archived order and must never
   * bleed into the next live extraction.
   */
  draftStartAfterMessageId?: string
  draftStartAfterAt?: string
  /** Server-authoritative Meta 24-hour customer-service window for free text. */
  replyWindowOpen?: boolean
  systemRole?: 'info'
  kunde: string
  telefon: string
  online: boolean
  unread: number
  lastPreview: string
  lastAt: string
  status: OrderStatus
  produktBild?: string
  structured: StructuredOrder
  messages: Message[]
  muted?: boolean
  pinned?: boolean
  blocked?: boolean
}

/** A confirmed, immutable order case captured from a bounded chat section. */
export interface ArchivedOrder {
  id: string
  conversationId: string
  orderNumber: string
  sequence: number
  status: OrderStatus
  structured: StructuredOrder
  source: {
    startMessageId?: string
    endMessageId?: string
    startAt?: string
    endAt?: string
    messageCount: number
    snapshot: Array<{
      id: string
      externalId?: string
      direction: 'inbound' | 'outbound'
      kind: MessageKind
      text: string
      createdAt: string
    }>
  }
  createdAt: string
  archivedAt: string
}

export const KUNDENZETTEL_INFO_CHAT_ID = 'kundenzettel-info'

export interface TodoItem {
  id: string
  title: string
  relatedTo?: string
  due: string
  done: boolean
  kind: 'todo' | 'reminder'
}

export const statusLabel: Record<OrderStatus, string> = {
  anfrage: 'Anfrage',
  angebot: 'Angebot',
  bestaetigt: 'Bestätigt',
  arbeit: 'In Arbeit',
  fertig: 'Fertig',
}

export type SemanticGroup = 'offen' | 'bearbeitung' | 'abgeschlossen'

export const semanticGroupLabel: Record<SemanticGroup, string> = {
  offen: 'Offen',
  bearbeitung: 'In Bearbeitung',
  abgeschlossen: 'Fertig',
}

/** Repräsentativer OrderStatus je semantischer Gruppe (STATUS-Menü). */
export const semanticGroupToStatus: Record<SemanticGroup, OrderStatus> = {
  offen: 'anfrage',
  bearbeitung: 'arbeit',
  abgeschlossen: 'fertig',
}

export function getSemanticGroup(status: OrderStatus): SemanticGroup {
  if (status === 'anfrage' || status === 'angebot') return 'offen'
  if (status === 'bestaetigt' || status === 'arbeit') return 'bearbeitung'
  return 'abgeschlossen'
}

export interface ChatList {
  id: string
  name: string
  chatIds: string[]
  /**
   * A group is an internal Kundenzettel workspace, not a native WhatsApp
   * group.  Every entry records one intentionally submitted group message;
   * the Worker then queues an individual WhatsApp message per eligible member.
   */
  messages?: GroupMessage[]
  createdAt?: string
  updatedAt?: string
}

export interface GroupMessage {
  id: string
  text: string
  createdAt: string
  recipientCount: number
  queuedCount: number
  skippedCount: number
}

export const initialChatLists: ChatList[] = []

/** Ein Kanal bündelt mehrere interne Chatgruppen. */
export interface ChatChannel {
  id: string
  name: string
  groupIds: string[]
}

export interface Announcement {
  id: string
  title: string
  text: string
  audienceLabel: string
  createdAt: string
}

export const products = [
  { id: 'blickfang', name: 'Blickfang', image: '/products/blickfang.jpg', price: 'ab € 32,95', sku: 'KZ-BF-35' },
  { id: 'traumtaenzer', name: 'Traumtänzer', image: '/products/traumtaenzer.jpg', price: 'ab € 38,95', sku: 'KZ-TT-40' },
  { id: 'augenweide', name: 'Augenweide', image: '/products/augenweide.jpg', price: '€ 40,95', sku: 'KZ-AW-30' },
  { id: 'zarte-umarmung', name: 'Zarte Umarmung', image: '/products/zarte-umarmung.jpg', price: 'ab € 34,95', sku: 'KZ-ZU-35' },
  { id: 'leises-fluestern', name: 'Leises Flüstern', image: '/products/leises-fluestern.jpg', price: 'ab € 36,95', sku: 'KZ-LF-32' },
  { id: 'wunderfein', name: 'Wunderfein', image: '/products/wunderfein.jpg', price: 'ab € 29,95', sku: 'KZ-WF-28' },
  { id: 'glueckskind', name: 'Glückskind', image: '/products/glueckskind.jpg', price: 'ab € 42,95', sku: 'KZ-GK-38' },
  { id: 'kombi-set', name: 'Kombi-Set', image: '/products/kombi-set.jpg', price: 'ab € 69,95', sku: 'KZ-KS-01' },
]

/** Geprüfte WhatsApp-Sprachnachricht (natürliche Stimme, 16 s). */
export const MARIE_VOICE_NOTE = {
  audio: '/media/demo/WhatsApp_Sprachnachricht.mp3',
  duration: '0:16',
  transcript:
    'Hey, das meinte ich. Diesen Kranz hatte Julia bei Florawerk am Dienstag gekauft. Der Rohling gefällt mir, aber die Blüten und der Eukalyptus sind eine Katastrophe. Ich möchte ihn viel frühlingshafter haben, mit saftigem Grün, Altrosa und cremeweißen Blüten. Für ein paar Farbakzente nutze bitte dunkelrote Knospen. Kriegst du das hin?',
} as const
