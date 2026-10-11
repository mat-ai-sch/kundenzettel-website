import type { CustomerRecord } from './customerStore'
import type { ChatList, Conversation, TodoItem } from './data'
import { products, statusLabel } from './data'

/** Kleinbuchstaben, ß→ss, Umlaute ohne Diakritik — „Kobbler“ findet „Köbbler“. */
export function foldSearchText(value: string): string {
  return value
    .toLowerCase()
    .replace(/ß/g, 'ss')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
}

export function textMatchesQuery(haystack: string, query: string): boolean {
  const q = foldSearchText(query.trim())
  if (!q) return false
  return foldSearchText(haystack).includes(q)
}

export type SiteView =
  | 'home'
  | 'auftraege'
  | 'whatsapp'
  | 'agenda'
  | 'kunden'
  | 'kollektion'

const SITE_PAGES: {
  view: SiteView
  title: string
  subtitle: string
  keywords: string
}[] = [
  {
    view: 'home',
    title: 'Home',
    subtitle: 'Start und Übersicht',
    keywords: 'start übersicht dashboard willkommen',
  },
  {
    view: 'whatsapp',
    title: 'WhatsApp',
    subtitle: 'Chats und Nachrichten',
    keywords: 'chat nachrichten whatsapp',
  },
  {
    view: 'auftraege',
    title: 'Aufträge',
    subtitle: 'Bestellungen und Dossiers',
    keywords: 'auftrag bestellung dossier werkstück',
  },
  {
    view: 'agenda',
    title: 'Agenda',
    subtitle: 'Termine und Erinnerungen',
    keywords: 'agenda termine todos erinnerungen',
  },
  {
    view: 'kunden',
    title: 'Kunden',
    subtitle: 'Personen und Kontakte',
    keywords: 'kunden kontakte personen adressen',
  },
  {
    view: 'kollektion',
    title: 'Kollektion',
    subtitle: 'Produkte und Werkstücke',
    keywords: 'kollektion produkte shop werkstücke',
  },
]

export function customerMatchesQuery(
  customer: CustomerRecord,
  query: string,
): boolean {
  if (!query.trim()) return false
  return (
    textMatchesQuery(customer.name, query) ||
    textMatchesQuery(customer.telefon, query) ||
    textMatchesQuery(customer.strasse, query) ||
    textMatchesQuery(customer.plzOrt, query) ||
    textMatchesQuery(customer.kundenNr, query) ||
    textMatchesQuery(customer.anrede, query)
  )
}

/** Chatliste: Einzelchats, Gruppen, Schlagworte aus dem Textverlauf. */
export function conversationMatchesChatListQuery(
  conversation: Conversation,
  query: string,
  chatLists: ChatList[],
): boolean {
  if (!query.trim()) return true
  if (textMatchesQuery(conversation.kunde, query)) return true
  if (
    chatLists.some(
      (list) =>
        list.chatIds.includes(conversation.id) &&
        textMatchesQuery(list.name, query),
    )
  ) {
    return true
  }
  return conversation.messages.some((message) =>
    textMatchesQuery(
      [message.text, message.transcript, message.documentName]
        .filter(Boolean)
        .join(' '),
      query,
    ),
  )
}

export type HeaderSearchHit = {
  key: string
  kind: 'page' | 'person' | 'chat' | 'order' | 'product' | 'agenda'
  section: string
  title: string
  subtitle: string
  view?: SiteView
  conversationId?: string
  customer?: CustomerRecord
  productId?: string
  todoId?: string
}

function orderHaystack(conversation: Conversation): string {
  const fields = Object.values(conversation.structured).filter(
    (value): value is string => typeof value === 'string',
  )
  return [
    conversation.kunde,
    conversation.telefon,
    statusLabel[conversation.status],
    ...fields,
  ].join(' ')
}

export function parseNewChatCommand(query: string): { active: boolean; name: string } {
  const trimmed = query.trim()
  const match = trimmed.match(/^\/\s*test(?:\s+(.*))?$/i)
  if (!match) return { active: false, name: '' }
  return { active: true, name: (match[1] ?? '').trim() }
}

export function collectHeaderSearchHits(input: {
  query: string
  conversations: Conversation[]
  customers: CustomerRecord[]
  todos: TodoItem[]
}): HeaderSearchHit[] {
  const query = input.query.trim()
  if (!query) return []

  const hits: HeaderSearchHit[] = []

  for (const customer of input.customers) {
    if (!customerMatchesQuery(customer, query)) continue
    hits.push({
      kind: 'person',
      key: `person:${customer.kundenNr}`,
      section: 'Personen',
      title: customer.name,
      subtitle:
        [customer.telefon, customer.plzOrt].filter(Boolean).join(' · ') ||
        'Kontakt',
      customer,
      conversationId: customer.conversationId,
      view: customer.conversationId ? 'whatsapp' : 'kunden',
    })
  }

  for (const page of SITE_PAGES) {
    if (
      !textMatchesQuery(page.title, query) &&
      !textMatchesQuery(page.subtitle, query) &&
      !textMatchesQuery(page.keywords, query)
    ) {
      continue
    }
    hits.push({
      kind: 'page',
      key: `page:${page.view}`,
      section: 'Seiten',
      title: page.title,
      subtitle: page.subtitle,
      view: page.view,
    })
  }

  for (const conversation of input.conversations) {
    if (
      !textMatchesQuery(conversation.kunde, query) &&
      !textMatchesQuery(conversation.telefon, query)
    ) {
      continue
    }
    hits.push({
      kind: 'chat',
      key: `chat:${conversation.id}`,
      section: 'Chats',
      title: conversation.kunde,
      subtitle: conversation.telefon || 'WhatsApp',
      conversationId: conversation.id,
      view: 'whatsapp',
    })
  }

  for (const conversation of input.conversations) {
    if (!textMatchesQuery(orderHaystack(conversation), query)) continue
    hits.push({
      kind: 'order',
      key: `order:${conversation.id}`,
      section: 'Aufträge',
      title: conversation.structured.produkt || 'Auftrag',
      subtitle: [conversation.kunde, conversation.structured.sku]
        .filter(Boolean)
        .join(' · '),
      conversationId: conversation.id,
      view: 'auftraege',
    })
  }

  for (const product of products) {
    if (
      !textMatchesQuery(product.name, query) &&
      !textMatchesQuery(product.sku, query) &&
      !textMatchesQuery(product.price, query)
    ) {
      continue
    }
    hits.push({
      kind: 'product',
      key: `product:${product.id}`,
      section: 'Kollektion',
      title: product.name,
      subtitle: [product.sku, product.price].filter(Boolean).join(' · '),
      productId: product.id,
      view: 'kollektion',
    })
  }

  for (const todo of input.todos) {
    if (
      !textMatchesQuery(todo.title, query) &&
      !textMatchesQuery(todo.relatedTo ?? '', query) &&
      !textMatchesQuery(todo.due, query)
    ) {
      continue
    }
    hits.push({
      kind: 'agenda',
      key: `agenda:${todo.id}`,
      section: 'Agenda',
      title: todo.title,
      subtitle: [todo.relatedTo, todo.due].filter(Boolean).join(' · '),
      todoId: todo.id,
      view: 'agenda',
    })
  }

  return hits
}
