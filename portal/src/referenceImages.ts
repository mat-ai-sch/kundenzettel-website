/**
 * Freie Referenzbilder aus Openverse + Wikimedia Commons.
 * Nur Lizenzen ohne NC (nicht-kommerziell) — Atelier darf sie im Chat zeigen.
 * Attribution immer mitspeichern und anzeigen.
 */

import type { FloristryKind } from './floristryLexicon'

export type ReferenceImage = {
  id: string
  title: string
  url: string
  thumbUrl: string
  license: string
  licenseUrl?: string
  creator: string
  source: 'openverse' | 'commons'
  pageUrl?: string
  query: string
}

const DENY_LICENSE =
  /\bnc\b|non.?commercial|nicht.?kommerziell|nd\b|no.?deriv/i

const ALLOW_LICENSE =
  /^(cc0|pdm|cc-zero|public.?domain|cc.?by(?:-sa)?(?:-\d)?|by(?:-sa)?(?:-\d(?:\.\d)?)?)$/i

export function isCommerciallyUsableLicense(license: string): boolean {
  const raw = license.trim()
  if (!raw) return false
  if (DENY_LICENSE.test(raw)) return false
  const compact = raw.toLowerCase().replace(/\s+/g, '-').replace(/_/g, '-')
  if (ALLOW_LICENSE.test(compact.replace(/-\d+(\.\d+)?$/, ''))) return true
  if (/^cc0\b/i.test(raw) || /^public domain$/i.test(raw) || /^pdm$/i.test(raw)) {
    return true
  }
  if (/^cc by(?!.*\bnc\b)/i.test(raw)) return true
  return false
}

export function formatAttribution(image: ReferenceImage): string {
  const who = image.creator.trim() || 'unbekannt'
  const lic = image.license.trim() || 'freie Lizenz'
  const via = image.source === 'commons' ? 'Wikimedia Commons' : 'Openverse'
  return `${who} · ${lic} · ${via}`
}

/** Suchanfragen je Produktfamilie — Englisch trifft in Stock-DBs besser. */
export function referenceQueryForKind(kind: FloristryKind, seed?: string): string {
  const queries = referenceQueriesForKind(kind)
  if (!seed || queries.length <= 1) return queries[0]
  return queries[hashSeed(seed) % queries.length]
}

function hashSeed(value: string): number {
  let hash = 2166136261
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

/** Queries in seed-abhängiger Reihenfolge (Streuung über Openverse/Commons). */
export function orderedReferenceQueriesForKind(
  kind: FloristryKind,
  seed?: string,
): string[] {
  const base = referenceQueriesForKind(kind)
  if (!seed || base.length <= 1) return [...base]
  const offset = hashSeed(`${seed}|qord`) % base.length
  return [...base.slice(offset), ...base.slice(0, offset)]
}

/** Mehrere Queries (Fallback), erste = bevorzugt. */
export function referenceQueriesForKind(kind: FloristryKind): string[] {
  switch (kind) {
    case 'blumenhoop':
      // Kein nacktes „flower hoop“ / „hoop“ — sonst Mode-Reifröcke und Kostüme.
      return [
        'dried flowers on metal ring wreath',
        'Trockenblumen Metallring Wanddeko',
        'pampas grass dried floral metal ring',
        'modern dried flower ring wall decor',
        'floral wire ring dried blooms decoration',
        'gold metal ring dried flowers wall',
        'minimal dried botanical hoop wall art',
      ]
    case 'wandkranz':
      return [
        'dried flower wall wreath botanical',
        'dried floral wall hanging wreath no people',
        'eucalyptus dried wall wreath',
        'Trockenblumen Wandkranz Deko',
      ]
    case 'tischkranz':
      return [
        'dried flower table wreath candle',
        'table centerpiece dried flowers ring',
        'candle ring dried flowers',
        'Tischkranz Trockenblumen',
      ]
    case 'tuerkranz':
      return [
        'dried flower door wreath',
        'door wreath dried flowers airy',
        'natural door wreath dried blooms',
        'Türkranz Trockenblumen',
      ]
    case 'fensterkranz':
      return [
        'small dried flower window wreath',
        'window wreath dried flowers',
        'mini dried floral window ring',
      ]
    case 'adventskranz':
      return [
        'advent wreath four candles',
        'adventskranz trockenblumen',
        'modern advent wreath dried flowers',
      ]
    case 'gesteck':
      return [
        'florist table arrangement in oasis foam bowl',
        'Tischgesteck Steckmasse Schale Blumen',
        'low floral centerpiece in ceramic bowl no sphere',
        'asymmetric table flower arrangement vase',
        'floral foam table arrangement fresh flowers',
      ]
    case 'girlande':
      return [
        'dried flower garland',
        'floral table garland',
        'eucalyptus flower garland',
        'Blumen Girlande Tisch',
      ]
    case 'strauss':
      return [
        'hand tied flower bouquet stems wrapped',
        'fresh flower bouquet white pink cream',
        'Blumenstrauß gebunden Stiele',
        'wrapped florist bouquet',
        'loose garden style flower bouquet',
        'pastel mixed flower bouquet paper wrap',
      ]
    case 'bouquet':
      return [
        'hand held bridal flower bouquet',
        'bridal bouquet flowers',
        'round bridal bouquet soft pink',
      ]
    case 'herz':
      return [
        'dried flower heart arrangement',
        'floral heart tribute',
        'Blütenherz Gesteck',
      ]
    case 'kranz':
      return [
        'dried flower wreath',
        'Trockenblumenkranz',
        'natural dried botanical wreath',
        'airy dried flower wreath wall',
      ]
    case 'katalog':
      return [
        'dried flowers decoration',
        'Trockenblumen Deko',
        'dried floral arrangement boutique',
        'modern dried flower decor piece',
      ]
    default:
      return ['dried flowers decoration']
  }
}

/** Mode/Kostüm/Reifrock — nicht florale Deko. */
const OFFTOPIC_IMAGE =
  /\b(hoop\s*skirt|skirt\s*hoop|pannier|crinoline|farthingale|ball\s*gown|wedding\s*dress|bridal\s*gown|evening\s*gown|robe\s*à|rococo|baroque|18th|centur|costume|fashion|clothing|mannequin|corset|powdered\s*wig|reifrock|kleid|ballkleid|brautkleid|historisch(?:es)?\s*kleid)\b/i

/** Menschen, Denkmäler, Events — nie als Floristik-Referenz. */
const NON_FLORAL_SCENE =
  /\b(memorial|monument|statue|plaque|cemetery|grave|funeral\s*service|school\s*fire|teachers?\s+and\s+children|in\s+memory\s+of|portrait|selfie|group\s*photo|people\s+standing|park\s*ranger|police|uniform|soldier|crowd\s+of\s+people|demonstration|protest|museum\s+visitor|tourist|collinwood|denkmal|gedenken|gedenktafel|friedhof|schulbrand|lehrerinnen|portraitfoto|gruppenfoto|menschen\s+vor)\b/i

/** Pflanzen/Motive, die kein Kranz/Strauß/Hoop sind. */
const WRONG_FLORAL_SUBJECT =
  /\b(cactus|cacti|kaktee|kaktus|succulent|sukkulent|orchid\s*pot|topfpflanze|houseplant|bonsai|christmas\s*tree|tannenbaum)\b/i

/** Blütenkugeln / Flower Balls — kein Tischgesteck. */
const NOT_GESTECK =
  /\b(flower\s*ball|floral\s*ball|bl(?:ü|ue)tenkugel|blumenkugel|pomander|kissing\s*ball|sphere\s*of\s*flower|floral\s*sphere|kugelgesteck|chrysanthemum\s*ball|pompon\s*ball)\b/i

const GESTECK_HINT =
  /\b(gesteck|tischgesteck|centerpiece|steckmasse|oasis|floral\s*foam|arrangement\s*in\s*(?:a\s+)?(?:bowl|vase|dish)|bowl\s*arrangement|table\s*arrangement|schale|steckschaum)\b/i

const FLORAL_HINT =
  /\b(flower|floral|dried|wreath|pampas|bloom|blossom|botanical|bouquet|garland|arrangement|centerpiece|kranz|blumen|trocken|strau[sß]|bouquet|girlande|gesteck|metall(?:ring)?|wire\s*ring|floral\s*ring|eucalyptus|eukalyptus)\b/i

const WREATH_HINT =
  /\b(wreath|kranz|door\s*wreath|wall\s*wreath|advent|candle\s*ring|tischkranz|wandkranz|tuerkranz|türkranz)\b/i

const BOUQUET_HINT =
  /\b(bouquet|strau[sß]|hand[- ]?tied|wrapped\s*flower|bridal\s*bouquet|blumenstrau)\b/i

const GARLAND_HINT =
  /\b(garland|girlande|floral\s*swag|table\s*runner\s*flower)\b/i

const HOOP_HINT =
  /\b(metal\s*ring|metallring|wire\s*ring|floral\s*ring|dried.{0,24}ring|ring.{0,24}dried|blumenhoop|flower\s*hoop|floral\s*hoop)\b/i

/**
 * Verifiziert ein Referenzbild gegen die gewünschte Produktfamilie.
 * Positive Signale nur aus Titel/Dateiname — nicht aus der eigenen Suchquery
 * (sonst „besteht“ jeder Treffer der Query automatisch).
 * Rein synchron — keine Extra-Netzwerklatenz.
 */
export function isRelevantReferenceImage(
  kind: FloristryKind,
  image: Pick<ReferenceImage, 'title' | 'query' | 'pageUrl' | 'creator'>,
): boolean {
  const evidence = `${image.title} ${image.pageUrl ?? ''}`
  const denyBlob = `${evidence} ${image.creator} ${image.query}`
  if (OFFTOPIC_IMAGE.test(denyBlob)) return false
  if (NON_FLORAL_SCENE.test(denyBlob)) return false
  if (WRONG_FLORAL_SUBJECT.test(evidence)) return false
  if (NOT_GESTECK.test(evidence) && kind === 'gesteck') return false
  // Ohne florales Signal im Titel/Dateiname: nie freigeben
  if (!FLORAL_HINT.test(evidence)) return false

  if (kind === 'blumenhoop') {
    if (/\b(dress|gown|skirt|costume|clothing|kleid|rock)\b/i.test(evidence) && !HOOP_HINT.test(evidence)) {
      return false
    }
    return HOOP_HINT.test(evidence) || (/\bring\b/i.test(evidence) && FLORAL_HINT.test(evidence))
  }

  if (
    kind === 'wandkranz' ||
    kind === 'tuerkranz' ||
    kind === 'tischkranz' ||
    kind === 'fensterkranz' ||
    kind === 'adventskranz' ||
    kind === 'kranz'
  ) {
    return WREATH_HINT.test(evidence)
  }

  if (kind === 'strauss' || kind === 'bouquet') {
    return BOUQUET_HINT.test(evidence)
  }

  if (kind === 'girlande') {
    return GARLAND_HINT.test(evidence)
  }

  if (kind === 'gesteck') {
    if (NOT_GESTECK.test(evidence)) return false
    if (WREATH_HINT.test(evidence) && !GESTECK_HINT.test(evidence)) return false
    if (BOUQUET_HINT.test(evidence) && !GESTECK_HINT.test(evidence)) return false
    return GESTECK_HINT.test(evidence)
  }

  if (kind === 'herz' || kind === 'katalog') {
    return FLORAL_HINT.test(evidence)
  }

  return FLORAL_HINT.test(evidence)
}

/** Verbindliche Freigabe vor Chat-Anzeige — Alias mit klarer Semantik. */
export function validateReferenceImage(
  kind: FloristryKind,
  image: Pick<ReferenceImage, 'title' | 'query' | 'pageUrl' | 'creator'>,
): boolean {
  return isRelevantReferenceImage(kind, image)
}

function stripHtml(value: string): string {
  return value.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
}

async function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      promise,
      new Promise<T>((resolve) => {
        timer = setTimeout(() => resolve(fallback), ms)
      }),
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

type OpenverseHit = {
  id?: string
  title?: string
  url?: string
  thumbnail?: string
  license?: string
  license_url?: string
  creator?: string
  foreign_landing_url?: string
}

async function searchOpenverse(query: string, limit: number): Promise<ReferenceImage[]> {
  const url =
    `https://api.openverse.org/v1/images/?q=${encodeURIComponent(query)}` +
    `&page_size=${Math.min(20, Math.max(limit * 3, 6))}` +
    `&license=cc0,pdm,by,by-sa`
  const response = await fetch(url)
  if (!response.ok) return []
  const data = (await response.json()) as { results?: OpenverseHit[] }
  const out: ReferenceImage[] = []
  for (const hit of data.results ?? []) {
    if (!hit.url || !hit.license) continue
    if (!isCommerciallyUsableLicense(hit.license)) continue
    out.push({
      id: `ov-${hit.id ?? hit.url}`,
      title: hit.title?.trim() || query,
      url: hit.url,
      thumbUrl: hit.thumbnail || hit.url,
      license: hit.license,
      licenseUrl: hit.license_url,
      creator: hit.creator?.trim() || 'unbekannt',
      source: 'openverse',
      pageUrl: hit.foreign_landing_url,
      query,
    })
    if (out.length >= limit) break
  }
  return out
}

type CommonsPage = {
  pageid?: number
  title?: string
  imageinfo?: Array<{
    url?: string
    thumburl?: string
    mime?: string
    descriptionurl?: string
    extmetadata?: {
      LicenseShortName?: { value?: string }
      Artist?: { value?: string }
      Credit?: { value?: string }
    }
  }>
}

async function searchCommons(query: string, limit: number): Promise<ReferenceImage[]> {
  const api =
    'https://commons.wikimedia.org/w/api.php?action=query&format=json&origin=*' +
    `&generator=search&gsrnamespace=6&gsrlimit=${Math.min(12, Math.max(limit * 3, 6))}` +
    `&gsrsearch=${encodeURIComponent(`${query} filetype:bitmap`)}` +
    '&prop=imageinfo&iiprop=url|extmetadata|mime&iiurlwidth=640'
  const response = await fetch(api)
  if (!response.ok) return []
  const data = (await response.json()) as { query?: { pages?: Record<string, CommonsPage> } }
  const pages = Object.values(data.query?.pages ?? {})
  const out: ReferenceImage[] = []
  for (const page of pages) {
    const info = page.imageinfo?.[0]
    if (!info?.url || !info.mime?.startsWith('image/')) continue
    const license = info.extmetadata?.LicenseShortName?.value ?? ''
    if (!isCommerciallyUsableLicense(license)) continue
    const artist = stripHtml(info.extmetadata?.Artist?.value ?? '')
    out.push({
      id: `wm-${page.pageid ?? info.url}`,
      title: (page.title ?? query).replace(/^File:/i, ''),
      url: info.url,
      thumbUrl: info.thumburl || info.url,
      license,
      creator: artist || 'Wikimedia Commons',
      source: 'commons',
      pageUrl: info.descriptionurl,
      query,
    })
    if (out.length >= limit) break
  }
  return out
}

export type SearchReferenceOptions = {
  limit?: number
  /** Nur eine Quelle erzwingen (Tests / Debugging). */
  sources?: Array<'openverse' | 'commons'>
  /** Hard-Timeout pro Quelle in ms (Default 4500). */
  timeoutMs?: number
  /** Streuung: welche Query/welcher Treffer bevorzugt wird. */
  pickSeed?: string
  /** Explizite Query zuerst (z. B. aus Bubbles). */
  preferredQuery?: string
}

/**
 * Sucht Referenzbilder. Openverse und Commons parallel (mit Timeout),
 * Deduplizierung nach URL.
 */
export async function searchReferenceImages(
  query: string,
  options: SearchReferenceOptions = {},
): Promise<ReferenceImage[]> {
  const q = query.trim()
  if (!q) return []
  const limit = options.limit ?? 6
  const sources = options.sources ?? ['openverse', 'commons']
  const timeoutMs = options.timeoutMs ?? 4500

  const tasks: Promise<ReferenceImage[]>[] = []
  if (sources.includes('openverse')) {
    tasks.push(withTimeout(searchOpenverse(q, limit).catch(() => []), timeoutMs, []))
  }
  if (sources.includes('commons')) {
    tasks.push(withTimeout(searchCommons(q, limit).catch(() => []), timeoutMs, []))
  }

  const batches = await Promise.all(tasks)
  const seen = new Set<string>()
  const merged: ReferenceImage[] = []
  for (const batch of batches) {
    for (const item of batch) {
      if (seen.has(item.url)) continue
      seen.add(item.url)
      merged.push(item)
      if (merged.length >= limit) return merged
    }
  }
  return merged
}

export async function searchReferenceImage(
  query: string,
  options: SearchReferenceOptions = {},
): Promise<ReferenceImage | null> {
  const hits = await searchReferenceImages(query, { ...options, limit: options.limit ?? 3 })
  if (!hits.length) return null
  if (!options.pickSeed || hits.length === 1) return hits[0]
  return hits[hashSeed(`${options.pickSeed}|hit`) % hits.length]
}

/** Sucht mit Query-Fallbacks, bis ein themenrelevanter Treffer kommt. */
export async function searchReferenceImageForKind(
  kind: FloristryKind,
  options: SearchReferenceOptions = {},
): Promise<ReferenceImage | null> {
  const ordered = orderedReferenceQueriesForKind(kind, options.pickSeed)
  const queries = options.preferredQuery?.trim()
    ? [
        options.preferredQuery.trim(),
        ...ordered.filter((query) => query !== options.preferredQuery?.trim()),
      ]
    : ordered

  for (const query of queries) {
    const hits = await searchReferenceImages(query, {
      ...options,
      limit: Math.max(options.limit ?? 6, 8),
    })
    const relevant = hits.filter((image) => validateReferenceImage(kind, image))
    if (!relevant.length) continue
    if (!options.pickSeed || relevant.length === 1) return relevant[0]
    return relevant[hashSeed(`${options.pickSeed}|${query}`) % relevant.length]
  }
  return null
}

export async function searchReferenceForKind(
  kind: FloristryKind,
  options: SearchReferenceOptions = {},
): Promise<ReferenceImage[]> {
  const hit = await searchReferenceImageForKind(kind, options)
  return hit ? [hit] : []
}
