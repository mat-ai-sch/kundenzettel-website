import type { StructuredOrder } from './data'
import type { OfferDocument, OfferLine } from './offerTypes'

export interface OfferDossierView {
  kundeLabel: string
  telefon: string
  structured: StructuredOrder
}

/** Geschätzte Höhen in mm für A4-Inhaltsband (ohne Seitenrahmen-Padding). */
const PAGE_INNER_H = 297 - 12 - 14
const FOOTER_H = 30
const OFFER_HEADER_FIRST_H = 108
const OFFER_HEADER_CONTINUE_H = 28
const TRANSCRIPT_HEADER_H = 36
const TABLE_HEAD_H = 8
const TOTALS_H = 22
const PRIVACY_H = 16
const TITLE_INTRO_H = 22
const LINE_BASE_H = 7
const LINE_DESC_EXTRA = 5
const TRANSCRIPT_ROW_BASE = 9
const TRANSCRIPT_ROW_PER_80CHARS = 3

export interface OfferBodySlice {
  lineIndexes: number[]
  showIntro: boolean
  showTableHead: boolean
  showTotals: boolean
}

export interface TranscriptBodySlice {
  rowKeys: string[]
  showTitle: boolean
  showPrivacy: boolean
}

export type PaginatedPage =
  | {
      kind: 'offer'
      pageIndex: number
      isFirstOfferPage: boolean
      body: OfferBodySlice
    }
  | {
      kind: 'transcript'
      pageIndex: number
      isFirstTranscriptPage: boolean
      body: TranscriptBodySlice
    }

export const TRANSCRIPT_KEYS: (keyof StructuredOrder)[] = [
  'produkt',
  'ursprungswunsch',
  'sku',
  'groesse',
  'rohling',
  'stil',
  'farben',
  'abgelehnt',
  'referenz',
  'blumenauswahl',
  'anlass',
  'termin',
  'abholung',
  'adresse',
  'budget',
  'preisVereinbart',
  'preisBegruendung',
  'medien',
  'kanal',
  'notizen',
]

function lineHeightMm(line: OfferLine): number {
  return LINE_BASE_H + (line.beschreibung?.trim() ? LINE_DESC_EXTRA : 0)
}

function transcriptRowHeightMm(value: string): number {
  const len = value.length
  return TRANSCRIPT_ROW_BASE + Math.floor(len / 80) * TRANSCRIPT_ROW_PER_80CHARS
}

function availableBodyMm(headerMm: number): number {
  return Math.max(40, PAGE_INNER_H - headerMm - FOOTER_H)
}

export function buildPaginatedPages(
  doc: OfferDocument,
  dossier: OfferDossierView,
): PaginatedPage[] {
  const pages: PaginatedPage[] = []

  let lineCursor = 0
  let firstOffer = true
  while (lineCursor < doc.lines.length || firstOffer) {
    const headerH = firstOffer ? OFFER_HEADER_FIRST_H : OFFER_HEADER_CONTINUE_H
    let budget = availableBodyMm(headerH)
    const slice: OfferBodySlice = {
      lineIndexes: [],
      showIntro: firstOffer,
      showTableHead: true,
      showTotals: false,
    }

    if (firstOffer) budget -= TITLE_INTRO_H
    budget -= TABLE_HEAD_H

    while (lineCursor < doc.lines.length) {
      const h = lineHeightMm(doc.lines[lineCursor])
      const needTotalsLater = lineCursor === doc.lines.length - 1
      const reserved = needTotalsLater ? TOTALS_H : 0
      if (h + reserved > budget && slice.lineIndexes.length > 0) break
      if (h > budget && slice.lineIndexes.length === 0) {
        slice.lineIndexes.push(lineCursor)
        lineCursor += 1
        budget -= h
        break
      }
      slice.lineIndexes.push(lineCursor)
      budget -= h
      lineCursor += 1
    }

    if (lineCursor >= doc.lines.length) {
      if (TOTALS_H <= budget || slice.lineIndexes.length > 0) {
        slice.showTotals = true
      }
    }

    pages.push({
      kind: 'offer',
      pageIndex: 0,
      isFirstOfferPage: firstOffer,
      body: slice,
    })
    firstOffer = false

    if (lineCursor >= doc.lines.length && slice.showTotals) break
    if (lineCursor >= doc.lines.length && !slice.showTotals) {
      pages.push({
        kind: 'offer',
        pageIndex: 0,
        isFirstOfferPage: false,
        body: {
          lineIndexes: [],
          showIntro: false,
          showTableHead: false,
          showTotals: true,
        },
      })
      break
    }
  }

  type TRow = { key: string; height: number }
  const tRows: TRow[] = []
  const kundeLines = [
    doc.kunde.anrede,
    doc.kunde.name,
    doc.kunde.strasse,
    doc.kunde.plzOrt,
    dossier.telefon,
  ]
    .filter(Boolean)
    .join('\n')
  tRows.push({ key: '__kunde__', height: transcriptRowHeightMm(kundeLines) })

  for (const key of TRANSCRIPT_KEYS) {
    const value = dossier.structured[key]
    if (value === undefined || value === '') continue
    tRows.push({ key, height: transcriptRowHeightMm(String(value)) })
  }

  let tCursor = 0
  let firstTranscript = true
  while (tCursor < tRows.length) {
    let budget = availableBodyMm(TRANSCRIPT_HEADER_H)
    const keys: string[] = []
    const showTitle = firstTranscript

    while (tCursor < tRows.length) {
      const row = tRows[tCursor]
      const isLast = tCursor === tRows.length - 1
      const reserved = isLast ? PRIVACY_H : 0
      if (row.height + reserved > budget && keys.length > 0) break
      if (row.height > budget && keys.length === 0) {
        keys.push(row.key)
        tCursor += 1
        budget -= row.height
        break
      }
      keys.push(row.key)
      budget -= row.height
      tCursor += 1
    }

    pages.push({
      kind: 'transcript',
      pageIndex: 0,
      isFirstTranscriptPage: firstTranscript,
      body: {
        rowKeys: keys,
        showTitle,
        showPrivacy: tCursor >= tRows.length,
      },
    })
    firstTranscript = false
  }

  return pages.map((p, i) => ({ ...p, pageIndex: i + 1 }))
}
