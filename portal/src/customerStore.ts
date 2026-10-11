export interface CustomerRecord {
  kundenNr: string
  anrede: string
  name: string
  strasse: string
  plzOrt: string
  telefon: string
  conversationId?: string
  updatedAt: string
}

const STORAGE_KEY = 'ww-customers-v1'

const MARIE_SEED: CustomerRecord = {
  kundenNr: '00001',
  anrede: 'Frau',
  name: 'Marie Köbbler (Demo)',
  strasse: 'Maximilianstraße 134',
  plzOrt: '45473 Mülheim an der Ruhr',
  telefon: '+49 170 5544332',
  conversationId: 'demo-marie',
  updatedAt: new Date().toISOString(),
}

const ANNA_SEED: CustomerRecord = {
  kundenNr: '00002',
  anrede: 'Frau',
  name: 'Anna Hartmann (Test)',
  strasse: 'Finkenstraße 56',
  plzOrt: '41749 Viersen',
  telefon: '+49 151 56732238',
  updatedAt: new Date().toISOString(),
}

function readAll(): Record<string, CustomerRecord> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    return JSON.parse(raw) as Record<string, CustomerRecord>
  } catch {
    return {}
  }
}

function writeAll(data: Record<string, CustomerRecord>) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
}

function formatKundenNr(n: number): string {
  return String(n).padStart(5, '0')
}

function nextKundenNr(data: Record<string, CustomerRecord>): string {
  let max = 0
  for (const c of Object.values(data)) {
    const parsed = Number.parseInt(c.kundenNr, 10)
    if (!Number.isNaN(parsed) && parsed > max) max = parsed
  }
  return formatKundenNr(max + 1)
}

function ensureMarieSeed(data: Record<string, CustomerRecord>): Record<string, CustomerRecord> {
  const byConv = Object.values(data).find((c) => c.conversationId === 'demo-marie')
  if (byConv) {
    data[byConv.kundenNr] = {
      ...byConv,
      name: MARIE_SEED.name,
    }
    return data
  }
  if (data[MARIE_SEED.kundenNr]) {
    data[MARIE_SEED.kundenNr] = {
      ...data[MARIE_SEED.kundenNr],
      name: MARIE_SEED.name,
      conversationId: 'demo-marie',
    }
    return data
  }
  data[MARIE_SEED.kundenNr] = { ...MARIE_SEED }
  return data
}

function ensureAnnaSeed(data: Record<string, CustomerRecord>): Record<string, CustomerRecord> {
  const existing = Object.values(data).find(
    (c) =>
      c.kundenNr === ANNA_SEED.kundenNr ||
      foldName(c.name).includes('anna hartmann'),
  )
  if (existing) {
    data[existing.kundenNr] = {
      ...existing,
      name: ANNA_SEED.name,
      strasse: ANNA_SEED.strasse,
      plzOrt: ANNA_SEED.plzOrt,
      telefon: ANNA_SEED.telefon,
      anrede: existing.anrede || ANNA_SEED.anrede,
    }
    return data
  }
  data[ANNA_SEED.kundenNr] = { ...ANNA_SEED }
  return data
}

function foldName(value: string): string {
  return value.toLowerCase().replace(/ß/g, 'ss')
}

function ensureCustomerSeeds(data: Record<string, CustomerRecord>): Record<string, CustomerRecord> {
  return ensureAnnaSeed(ensureMarieSeed(data))
}

export function listCustomers(): CustomerRecord[] {
  const data = ensureCustomerSeeds(readAll())
  writeAll(data)
  return Object.values(data).sort((a, b) => a.kundenNr.localeCompare(b.kundenNr))
}

export function getCustomerByConversation(conversationId: string): CustomerRecord | null {
  const data = ensureCustomerSeeds(readAll())
  writeAll(data)
  return Object.values(data).find((c) => c.conversationId === conversationId) ?? null
}

export function getCustomerByNr(kundenNr: string): CustomerRecord | null {
  const data = ensureCustomerSeeds(readAll())
  writeAll(data)
  return data[kundenNr] ?? null
}

export function linkCustomerToConversation(
  kundenNr: string,
  conversationId: string,
): CustomerRecord | null {
  const data = ensureCustomerSeeds(readAll())
  const customer = data[kundenNr]
  if (!customer) return null
  const next = {
    ...customer,
    conversationId,
    updatedAt: new Date().toISOString(),
  }
  data[kundenNr] = next
  writeAll(data)
  return next
}

export function ensureCustomerForConversation(input: {
  conversationId: string
  anrede?: string
  name: string
  strasse?: string
  plzOrt?: string
  telefon?: string
}): CustomerRecord {
  const data = ensureCustomerSeeds(readAll())
  const existing = Object.values(data).find((c) => c.conversationId === input.conversationId)
  if (existing) {
    const merged: CustomerRecord = {
      ...existing,
      anrede: input.anrede ?? existing.anrede,
      name: input.name || existing.name,
      strasse: input.strasse ?? existing.strasse,
      plzOrt: input.plzOrt ?? existing.plzOrt,
      telefon: input.telefon ?? existing.telefon,
      updatedAt: new Date().toISOString(),
    }
    data[existing.kundenNr] = merged
    writeAll(data)
    return merged
  }

  const kundenNr =
    input.conversationId === 'demo-marie'
      ? '00001'
      : input.conversationId === 'demo-anna'
        ? '00002'
        : nextKundenNr(data)
  const created: CustomerRecord = {
    kundenNr,
    anrede: input.anrede ?? '',
    name: input.name,
    strasse: input.strasse ?? '',
    plzOrt: input.plzOrt ?? '',
    telefon: input.telefon ?? '',
    conversationId: input.conversationId,
    updatedAt: new Date().toISOString(),
  }
  data[kundenNr] = created
  writeAll(data)
  return created
}

export function upsertCustomerFromOffer(input: {
  kundenNr: string
  conversationId: string
  anrede: string
  name: string
  strasse: string
  plzOrt: string
  telefon?: string
}): CustomerRecord {
  const data = ensureCustomerSeeds(readAll())
  const prev = data[input.kundenNr]
  const next: CustomerRecord = {
    kundenNr: input.kundenNr || prev?.kundenNr || nextKundenNr(data),
    anrede: input.anrede,
    name: input.name,
    strasse: input.strasse,
    plzOrt: input.plzOrt,
    telefon: input.telefon ?? prev?.telefon ?? '',
    conversationId: input.conversationId,
    updatedAt: new Date().toISOString(),
  }
  data[next.kundenNr] = next
  writeAll(data)
  return next
}
