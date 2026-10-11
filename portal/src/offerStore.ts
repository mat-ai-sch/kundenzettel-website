import type { Conversation } from './data'
import { ensureCustomerForConversation } from './customerStore'
import {
  createEmptyOffer,
  defaultGueltigBis,
  newLine,
  resolveLieferdatum,
  type OfferDocument,
  type OfferRecord,
  type OfferVersion,
} from './offerTypes'

const STORAGE_KEY = 'ww-offers-v2'

function readAll(): Record<string, OfferRecord> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    return JSON.parse(raw) as Record<string, OfferRecord>
  } catch {
    return {}
  }
}

function writeAll(data: Record<string, OfferRecord>) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
}

function normalizeOffer(doc: OfferDocument): OfferDocument {
  const auftragsdatum = doc.auftragsdatum || doc.datum || createEmptyOffer(doc.conversationId).auftragsdatum
  return {
    ...doc,
    auftragsNr: doc.auftragsNr ?? '',
    auftragsdatum,
    datum: auftragsdatum,
    lieferdatum: doc.lieferdatum || auftragsdatum,
    gueltigBis: doc.gueltigBis || defaultGueltigBis(auftragsdatum),
  }
}

export function seedOfferForConversation(conversation: Conversation): OfferDocument {
  const customer = ensureCustomerForConversation({
    conversationId: conversation.id,
    name: conversation.kunde.replace(/\s*\(Demo\)\s*$/, ''),
    telefon: conversation.telefon,
    anrede:
      conversation.id === 'demo-marie' || conversation.id === 'demo-anna'
        ? 'Frau'
        : '',
    strasse:
      conversation.id === 'demo-marie'
        ? 'Maximilianstraße 134'
        : conversation.id === 'demo-anna'
          ? 'Finkenstraße 56'
          : '',
    plzOrt:
      conversation.id === 'demo-marie'
        ? '45473 Mülheim an der Ruhr'
        : conversation.id === 'demo-anna'
          ? '41749 Viersen'
          : '',
  })

  if (conversation.id === 'demo-marie') {
    const auftragsdatum = '13.09.2026'
    const lieferdatum = resolveLieferdatum(auftragsdatum, conversation.structured.termin)
    return {
      ...createEmptyOffer('demo-marie', '000001'),
      status: 'entwurf',
      auftragsNr: conversation.structured.sku || 'KZ-DEMO-MK-001',
      kundenNr: customer.kundenNr,
      datum: auftragsdatum,
      auftragsdatum,
      lieferdatum,
      gueltigBis: defaultGueltigBis(auftragsdatum),
      einleitung:
        'Vielen Dank für Ihren Auftrag. Dieses Angebot ist gültig bis zum {gueltigBis}.',
      kunde: {
        anrede: customer.anrede,
        name: customer.name,
        strasse: customer.strasse,
        plzOrt: customer.plzOrt,
      },
      lines: [
        newLine({
          id: 'mk-line-1',
          artikel: 'Naturrohling',
          beschreibung: '',
          menge: 1,
          einheit: 'Stk.',
          preis: 25,
        }),
        newLine({
          id: 'mk-line-2',
          artikel: 'Florales Arbeitsmaterial',
          beschreibung: '',
          menge: 1,
          einheit: 'Stk.',
          preis: 50,
        }),
      ],
      updatedAt: new Date().toISOString(),
    }
  }

  const priceMatch = conversation.structured.preisVereinbart?.match(/([\d.,]+)/)
  const preis = priceMatch
    ? Number(priceMatch[1].replace('.', '').replace(',', '.')) || 0
    : 0

  const auftragsdatum = createEmptyOffer(conversation.id).auftragsdatum
  const lieferdatum = resolveLieferdatum(auftragsdatum, conversation.structured.termin)

  return {
    ...createEmptyOffer(conversation.id),
    auftragsNr: conversation.structured.sku || '',
    kundenNr: customer.kundenNr,
    auftragsdatum,
    datum: auftragsdatum,
    lieferdatum,
    gueltigBis: defaultGueltigBis(auftragsdatum),
    kunde: {
      anrede: customer.anrede,
      name: customer.name,
      strasse: customer.strasse,
      plzOrt: customer.plzOrt,
    },
    lines: [
      newLine({
        artikel: conversation.structured.produkt || 'Leistung',
        beschreibung: conversation.structured.notizen?.slice(0, 180) ?? '',
        menge: 1,
        einheit: 'Stk.',
        preis,
      }),
    ],
  }
}

export function loadOfferRecord(conversation: Conversation): OfferRecord {
  const all = readAll()
  const existing = all[conversation.id]
  if (existing?.current) {
    return {
      ...existing,
      current: normalizeOffer(existing.current),
    }
  }

  const current = seedOfferForConversation(conversation)
  const record: OfferRecord = {
    conversationId: conversation.id,
    current,
    history: [],
  }
  all[conversation.id] = record
  writeAll(all)
  return record
}

export function saveOffer(
  conversationId: string,
  doc: OfferDocument,
  note?: string,
): OfferRecord {
  const all = readAll()
  const prev = all[conversationId]
  const snapshot: OfferDocument = {
    ...structuredClone(normalizeOffer(doc)),
    status: 'gespeichert',
    updatedAt: new Date().toISOString(),
  }
  const version: OfferVersion = {
    id: `v-${Date.now()}`,
    savedAt: snapshot.updatedAt,
    note,
    snapshot: structuredClone(prev?.current ?? snapshot),
  }
  const record: OfferRecord = {
    conversationId,
    current: snapshot,
    history: [version, ...(prev?.history ?? [])].slice(0, 40),
  }
  all[conversationId] = record
  writeAll(all)
  return record
}

export function restoreOfferVersion(
  conversationId: string,
  versionId: string,
): OfferRecord | null {
  const all = readAll()
  const record = all[conversationId]
  if (!record) return null
  const version = record.history.find((v) => v.id === versionId)
  if (!version) return null

  const guard: OfferVersion = {
    id: `v-${Date.now()}`,
    savedAt: new Date().toISOString(),
    note: 'Vor Wiederherstellen',
    snapshot: structuredClone(record.current),
  }

  const restored: OfferDocument = {
    ...normalizeOffer(structuredClone(version.snapshot)),
    status: 'gespeichert',
    updatedAt: new Date().toISOString(),
  }

  const next: OfferRecord = {
    conversationId,
    current: restored,
    history: [guard, ...record.history].slice(0, 40),
  }
  all[conversationId] = next
  writeAll(all)
  return next
}

export function updateOfferDraft(
  conversationId: string,
  doc: OfferDocument,
): OfferRecord {
  const all = readAll()
  const prev = all[conversationId]
  const current: OfferDocument = {
    ...normalizeOffer(doc),
    status: doc.status === 'gespeichert' ? 'entwurf' : doc.status,
    updatedAt: new Date().toISOString(),
  }
  const record: OfferRecord = {
    conversationId,
    current,
    history: prev?.history ?? [],
  }
  all[conversationId] = record
  writeAll(all)
  return record
}
