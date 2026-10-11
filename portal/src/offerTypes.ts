export type OfferStatus = 'entwurf' | 'gespeichert'

export interface OfferSeller {
  firma: string
  inhaber: string
  strasse: string
  plzOrt: string
  land: string
  rolle: string
  email: string
  steuernummer: string
  ustId: string
  bank: string
  iban: string
  bic: string
}

export interface OfferCustomer {
  anrede: string
  name: string
  strasse: string
  plzOrt: string
}

export interface OfferLine {
  id: string
  artikel: string
  beschreibung: string
  menge: number
  einheit: string
  preis: number
}

export interface OfferDocument {
  conversationId: string
  status: OfferStatus
  /** Interne Versions-/Belegnummer (Historie) */
  nr: string
  /** Auftrags-Nr. aus dem Dossier (z. B. KZ-DEMO-MK-001) */
  auftragsNr: string
  kundenNr: string
  /** @deprecated use auftragsdatum */
  datum: string
  auftragsdatum: string
  lieferdatum: string
  gueltigBis: string
  titel: string
  einleitung: string
  lieferbedingung: string
  zahlungsbedingung: string
  schlusstext: string
  anmerkungen: string
  discount: number
  kunde: OfferCustomer
  seller: OfferSeller
  lines: OfferLine[]
  updatedAt: string
}

export interface OfferVersion {
  id: string
  savedAt: string
  note?: string
  snapshot: OfferDocument
}

export interface OfferRecord {
  conversationId: string
  current: OfferDocument
  history: OfferVersion[]
}

export const defaultSeller: OfferSeller = {
  firma: 'Kundenzettel',
  inhaber: 'Matthias Schürmann',
  strasse: 'Am Lunapark 5',
  plzOrt: '41749 Viersen',
  land: 'Deutschland',
  rolle: 'Geschäftsführer',
  email: 'info@kundenzettel.de',
  steuernummer: '5102/5244/3993',
  ustId: 'befreit gemäß § 19 UStG',
  bank: 'DEUTSCHE KREDIT BANK A.G.',
  iban: 'DE78120300001009562701',
  bic: 'BYLADEM1001',
}

export const PORTAL_PRIVACY_NOTICE =
  'Datenschutzhinweis (Entwurf vor Produktivstart): Für die geschützte Betreiberansicht können Chat-, Kontakt-, Medien- und Auftragsdaten zur Bearbeitung und Dokumentation eines Auftrags verarbeitet werden. Der Zugriff ist auf den Betreiber beschränkt; Löschungen erfolgen bewusst manuell. Die endgültige Fassung wird vor Produktivbetrieb rechtlich geprüft und freigegeben.'

export function lineTotal(line: OfferLine): number {
  return roundMoney(line.menge * line.preis)
}

export function offerSubtotal(doc: OfferDocument): number {
  return roundMoney(doc.lines.reduce((sum, line) => sum + lineTotal(line), 0))
}

export function offerTotal(doc: OfferDocument): number {
  return roundMoney(Math.max(0, offerSubtotal(doc) - (doc.discount || 0)))
}

export function roundMoney(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

export function formatEuro(n: number): string {
  return new Intl.NumberFormat('de-DE', {
    style: 'currency',
    currency: 'EUR',
  }).format(n)
}

export function formatDateDe(d = new Date()): string {
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const yyyy = d.getFullYear()
  return `${dd}.${mm}.${yyyy}`
}

export function parseDateDe(value: string): Date | null {
  const m = value.trim().match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/)
  if (!m) return null
  const day = Number(m[1])
  const month = Number(m[2]) - 1
  const year = Number(m[3])
  const d = new Date(year, month, day)
  if (d.getFullYear() !== year || d.getMonth() !== month || d.getDate() !== day) return null
  return d
}

const WEEKDAY_DE: Record<string, number> = {
  sonntag: 0,
  montag: 1,
  dienstag: 2,
  mittwoch: 3,
  donnerstag: 4,
  freitag: 5,
  samstag: 6,
}

/** Nächsten Wochentag aus Termin-Text relativ zum Auftragsdatum berechnen. */
export function resolveLieferdatum(auftragsdatum: string, terminText?: string): string {
  const base = parseDateDe(auftragsdatum) ?? new Date()
  if (!terminText) return formatDateDe(base)

  const lower = terminText.toLowerCase()
  for (const [name, weekday] of Object.entries(WEEKDAY_DE)) {
    if (!lower.includes(name)) continue
    const d = new Date(base)
    let delta = (weekday - d.getDay() + 7) % 7
    // „bis Mittwoch“ / Fertigstellung am gleichen Wochentag → nächste Woche
    if (delta === 0 && /bis|fertig/i.test(terminText)) delta = 7
    d.setDate(d.getDate() + delta)
    return formatDateDe(d)
  }

  const explicit = terminText.match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/)
  if (explicit) return `${explicit[1].padStart(2, '0')}.${explicit[2].padStart(2, '0')}.${explicit[3]}`

  return formatDateDe(base)
}

export function defaultGueltigBis(auftragsdatum: string): string {
  const base = parseDateDe(auftragsdatum) ?? new Date()
  const d = new Date(base)
  d.setDate(d.getDate() + 1)
  return `${formatDateDe(d)} 23:59 Uhr`
}

export function newLine(partial?: Partial<OfferLine>): OfferLine {
  return {
    id: `line-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    artikel: '',
    beschreibung: '',
    menge: 1,
    einheit: 'Stk.',
    preis: 0,
    ...partial,
  }
}

export function createEmptyOffer(conversationId: string, nr = '000001'): OfferDocument {
  const auftragsdatum = formatDateDe()
  return {
    conversationId,
    status: 'entwurf',
    nr,
    auftragsNr: '',
    kundenNr: '',
    datum: auftragsdatum,
    auftragsdatum,
    lieferdatum: auftragsdatum,
    gueltigBis: defaultGueltigBis(auftragsdatum),
    titel: 'Angebot',
    einleitung:
      'Vielen Dank für Ihren Auftrag. Dieses Angebot ist gültig bis zum {gueltigBis}.',
    lieferbedingung: '',
    zahlungsbedingung: 'Zahlbar nach Erhalt der Rechnung',
    schlusstext:
      'Sagt Ihnen unser Angebot zu? Wenn Sie Fragen haben, beraten wir Sie gerne.',
    anmerkungen: 'Gemäß §19 Abs. 1 UStG wird keine Umsatzsteuer berechnet.',
    discount: 0,
    kunde: {
      anrede: '',
      name: '',
      strasse: '',
      plzOrt: '',
    },
    seller: { ...defaultSeller },
    lines: [newLine()],
    updatedAt: new Date().toISOString(),
  }
}

export function resolveEinleitung(doc: OfferDocument): string {
  const raw = doc.einleitung || ''
  if (raw.includes('{gueltigBis}')) {
    return raw.replaceAll('{gueltigBis}', doc.gueltigBis)
  }
  if (/gültig bis/i.test(raw)) return raw
  return `Vielen Dank für Ihren Auftrag. Dieses Angebot ist gültig bis zum ${doc.gueltigBis}.`
}
