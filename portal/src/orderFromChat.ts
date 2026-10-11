import {
  products,
  type Conversation,
  type Message,
  type OrderStatus,
  type StructuredOrder,
} from './data'
import { productLabelFromText } from './floristryLexicon'

const WEEKDAYS: Record<string, string> = {
  montag: 'Montag',
  dienstag: 'Dienstag',
  mittwoch: 'Mittwoch',
  donnerstag: 'Donnerstag',
  freitag: 'Freitag',
  samstag: 'Samstag',
  sonntag: 'Sonntag',
}

const COLOR_ALIASES: [RegExp, string][] = [
  [/\bsaftig(?:e|es|em|en|er)?\s+grun\b/g, 'Saftiges Grün'],
  [/\baltrosa\b/g, 'Altrosa'],
  [/\bcremeweiss(?:e|en|em|er)?\b/g, 'Cremeweiß'],
  [/\bcreme\b/g, 'Creme'],
  [/\bdunkelrote?\s+knospen\b/g, 'Dunkelrote Knospen'],
  [/\bdunkelrot\b/g, 'Dunkelrot'],
  [/\bknospen\b/g, 'Knospen'],
  [/\brosa\b/g, 'Rosa'],
  [/\bweiss\b/g, 'Weiß'],
  [/\bgrun\b/g, 'Grün'],
  [/\brot\b/g, 'Rot'],
  [/\bgold\b/g, 'Gold'],
  [/\bterracotta\b/g, 'Terracotta'],
  [/\bbeige\b/g, 'Beige'],
  [/\bgelb\b/g, 'Gelb'],
  [/\bblau\b/g, 'Blau'],
  [/\blila\b/g, 'Lila'],
  [/\bviolett\b/g, 'Violett'],
]

const STYLE_ALIASES: [RegExp, string][] = [
  [/\bfruhlingshaft(?:er|es|e)?\b/g, 'Frühlingshaft'],
  [/\bsommerlich(?:er|es|e)?\b/g, 'Sommerlich'],
  [/\bherbstlich(?:er|es|e)?\b/g, 'Herbstlich'],
  [/\bwinterlich(?:er|es|e)?\b/g, 'Winterlich'],
  [/\bromantisch(?:er|es|e)?\b/g, 'Romantisch'],
  [/\brustikal(?:er|es|e)?\b/g, 'Rustikal'],
  [/\bmodern(?:er|es|e)?\b/g, 'Modern'],
  [/\bnaturnah(?:er|es|e)?\b/g, 'Naturnah'],
  [/\bluftig(?:er|es|e)?\b/g, 'Luftig'],
  [/\bzart(?:er|es|e)?\b/g, 'Zart'],
  [/\bdezent(?:er|es|e)?\b/g, 'Dezent'],
  [/\bflach(?:er|es|e)?\b/g, 'Flach'],
  [/\bminimalistisch(?:er|es|e)?\b/g, 'Minimalistisch'],
]

const PRODUCT_NOUNS: [RegExp, string][] = [
  // Legacy-Fallback — bevorzugt productLabelFromText / floristryLexicon
  [/\btischgesteck\b/g, 'Tischgesteck'],
  [/\btuerkranz\b/g, 'Türkranz'],
  [/\btischkranz\b/g, 'Tischkranz'],
  [/\bwandkranz\b/g, 'Wandkranz'],
  [/\bfensterkranz\b/g, 'Fensterkranz'],
  [/\badventskranz\b/g, 'Adventskranz'],
  [/\bblumenhoop\b/g, 'Blumenhoop'],
  [/\bgirlande\b/g, 'Girlande'],
  [/\bkranz\b/g, 'Kranz'],
  [/\bgesteck\b/g, 'Gesteck'],
  [/\bstrauss(?:e)?\b/g, 'Strauß'],
  [/\bbouquet\b/g, 'Bouquet'],
  [/\bherz\b/g, 'Herz'],
  [/\bkranzrohling\b/g, 'Kranzrohling'],
]

const OCCASIONS: [RegExp, string][] = [
  [/\bhochzeit\b/gi, 'Hochzeit'],
  [/\bgeburtstag\b/gi, 'Geburtstag'],
  [/\btrauer\b/gi, 'Trauer'],
  [/\bkommunion\b/gi, 'Kommunion'],
  [/\btaufe\b/gi, 'Taufe'],
  [/\bostern\b/gi, 'Ostern'],
  [/\bweihnacht/gi, 'Weihnachten'],
  [/\bgäste|\bgaeste|\bkommen leute|\bleute da\b/gi, 'Gäste'],
  [/\bmitbringsel\b/gi, 'Geschenk / Mitbringen'],
  [/\bmitbringen\b/gi, 'Geschenk / Mitbringen'],
  [/\bverschenken\b/gi, 'Geschenk'],
  [/\bgeschenk\b/gi, 'Geschenk'],
  [/\bsideboard\b/gi, 'Home Interior / Sideboard'],
  [/\bdeko(?:ration)?\b/gi, 'Home Interior / Dekoration'],
  [/\bwohnung\b/gi, 'Home Interior / Dekoration'],
  [/\binterior\b/gi, 'Home Interior / Dekoration'],
]

const REJECT_NOUNS = [
  'eukalyptus',
  'eukalyptusblatter',
  'blutenkombination',
  'bluten',
  'pampas',
]

const REPLACE_TURN =
  /\b(stattdessen|lieber|nicht mehr|andern wir|ändern wir|korrigier|doch lieber|nimm stattdessen|besser)\b/i

export function emptyStructuredOrder(
  partial?: Partial<StructuredOrder>,
): StructuredOrder {
  return {
    produkt: '',
    notizen: '',
    konfidenz: 0,
    kanal: 'WhatsApp',
    ...partial,
  }
}

type ChatTurn = {
  from: Message['from']
  text: string
  kind: Message['kind']
  mediaLabel?: string
}

function fold(value: string): string {
  return value
    .toLowerCase()
    .replace(/ß/g, 'ss')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
}

function uniqueJoin(parts: string[]): string {
  const seen = new Set<string>()
  const out: string[] = []
  for (const part of parts) {
    const key = fold(part)
    if (!key || seen.has(key)) continue
    seen.add(key)
    out.push(part)
  }
  return collapseContained(out).join(' · ')
}

/** Kürzere Treffer entfernen, wenn ein spezifischerer schon da ist (Grün ⊂ Saftiges Grün). */
function collapseContained(labels: string[]): string[] {
  return labels.filter(
    (label, index) =>
      !labels.some(
        (other, otherIndex) =>
          index !== otherIndex &&
          fold(other) !== fold(label) &&
          fold(other).includes(fold(label)),
      ),
  )
}

function messageText(message: Message): string {
  if (message.deletedForEveryone) return ''
  return [message.text, message.transcript, message.documentName]
    .filter(Boolean)
    .join(' ')
    .trim()
}

function turnsFromMessages(messages: Message[]): ChatTurn[] {
  return messages
    .filter((message) => !message.deletedForEveryone)
    .map((message) => {
      const mediaLabel =
        message.kind === 'image'
          ? 'Bild'
          : message.kind === 'video'
            ? 'Video'
            : message.kind === 'document'
              ? message.documentName || 'Dokument'
              : message.kind === 'voice'
                ? 'Sprachnachricht'
                : undefined
      return {
        from: message.from,
        text: messageText(message),
        kind: message.kind,
        mediaLabel,
      }
    })
}

function euroAmounts(text: string): string[] {
  const found: string[] = []
  const source = fold(text)
  const re =
    /(\d{1,4}(?:[.,]\d{1,2})?)\s*(?:€|eur(?:o|os)?)|(?:€|eur(?:o|os)?)\s*(\d{1,4}(?:[.,]\d{1,2})?)/gi
  let match: RegExpExecArray | null
  while ((match = re.exec(source))) {
    const raw = match[1] || match[2]
    if (!raw) continue
    found.push(`${raw.replace('.', ',')} €`)
  }
  return found
}

function isNegatedAt(folded: string, index: number): boolean {
  const before = folded.slice(Math.max(0, index - 22), index)
  return /(nicht|kein|keine|ohne|statt)\s+$/.test(before)
}

function pickWeekday(text: string): string | undefined {
  const folded = fold(text)
  const hits: { label: string; index: number; negated: boolean }[] = []
  for (const [key, label] of Object.entries(WEEKDAYS)) {
    let from = 0
    while (from < folded.length) {
      const index = folded.indexOf(key, from)
      if (index < 0) break
      hits.push({
        label,
        index,
        negated: /(nicht|kein|keine|ohne|statt)\s+$/.test(
          folded.slice(Math.max(0, index - 22), index),
        ),
      })
      from = index + key.length
    }
  }
  hits.sort((a, b) => a.index - b.index)
  const positive = hits.filter((hit) => !hit.negated)
  if (positive.length) return positive[positive.length - 1].label
  return undefined
}

function findDate(text: string): string | undefined {
  const match = text.match(/\b(\d{1,2})[./](\d{1,2})(?:[./](\d{2,4}))?\b/)
  if (!match) return undefined
  const day = match[1].padStart(2, '0')
  const month = match[2].padStart(2, '0')
  return match[3] ? `${day}.${month}.${match[3]}` : `${day}.${month}.`
}

function findTimeRange(text: string): string | undefined {
  const range = text.match(
    /(?:zwischen\s+)?(\d{1,2}(?:[:.]\d{2})?)\s*(?:uhr)?\s*(?:und|bis|-|–)\s*(\d{1,2}(?:[:.]\d{2})?)\s*(?:uhr)?/i,
  )
  if (range) {
    const a = range[1].includes(':') ? range[1] : `${range[1]}:00`
    const b = range[2].includes(':') ? range[2] : `${range[2]}:00`
    return `${a.replace('.', ':')}–${b.replace('.', ':')} Uhr`
  }
  const single = text.match(/\bum\s+(\d{1,2}(?:[:.]\d{2})?)\s*uhr/i)
  if (single) {
    const t = single[1].includes(':') ? single[1] : `${single[1]}:00`
    return `${t.replace('.', ':')} Uhr`
  }
  return undefined
}

function findAddress(text: string): string | undefined {
  const match = text.match(
    /\b([A-ZÄÖÜ][\wÄÖÜäöüß.-]*(?:straße|strasse|str\.|weg|platz|allee|ring|gasse))\s+(\d+[a-z]?)\s*,?\s*(\d{5})\s+([A-ZÄÖÜ][\wÄÖÜäöüß.-]*(?:\s+[A-ZÄÖÜa-zäöüß.-]+)*)/i,
  )
  if (match) {
    return `${match[1]} ${match[2]}, ${match[3]} ${match[4].trim()}`
  }
  const short = text.match(
    /\b([A-ZÄÖÜ][\wÄÖÜäöüß.-]*(?:straße|strasse|str\.|weg|platz|allee))\s+(\d+[a-z]?)\b/i,
  )
  if (short) return `${short[1]} ${short[2]}`
  return undefined
}

type AliasHit = { label: string; negated: boolean }

function aliasHits(text: string, aliases: [RegExp, string][]): AliasHit[] {
  const folded = fold(text)
  const hits: AliasHit[] = []
  for (const [re, label] of aliases) {
    const copy = new RegExp(re.source, 'g')
    let match: RegExpExecArray | null
    while ((match = copy.exec(folded))) {
      hits.push({
        label,
        negated: isNegatedAt(folded, match.index),
      })
    }
  }
  return hits
}

function catalogProduct(text: string): string | undefined {
  const folded = fold(text)
  for (const product of products) {
    const name = fold(product.name)
    const index = folded.indexOf(name)
    if (index < 0) continue
    const before = folded.slice(Math.max(0, index - 42), index)
    if (
      /\b(mein|meine|meins|altes|alte|damals|letztes|voriges|wie beim|wie das|wie mein|vom)\s*$/.test(
        before,
      )
    ) {
      continue
    }
    return product.name
  }
  return undefined
}

function productFromText(text: string): string | undefined {
  const fromLexicon = productLabelFromText(text)
  if (fromLexicon) {
    const folded = fold(text)
    if (/massanfertigung|individuell|massarbeit/.test(folded)) {
      if (/kranz/i.test(fromLexicon) && !/hoop|blumen/i.test(fromLexicon)) {
        return 'Individueller Kranz (Maßanfertigung)'
      }
      return `Individuell: ${fromLexicon}`
    }
    return fromLexicon
  }
  const catalog = catalogProduct(text)
  if (catalog) return catalog
  const folded = fold(text)
  for (const [re, label] of PRODUCT_NOUNS) {
    const copy = new RegExp(re.source, 'g')
    const match = copy.exec(folded)
    if (!match) continue
    if (isNegatedAt(folded, match.index)) continue
    if (/massanfertigung|individuell|massarbeit/.test(folded)) {
      return label === 'Kranz'
        ? 'Individueller Kranz (Maßanfertigung)'
        : `Individuell: ${label}`
    }
    return label
  }
  return undefined
}

function sizeFromText(text: string): string | undefined {
  const folded = fold(text)
  const range = folded.match(/(\d{2,3})\s*(?:-|–|bis)\s*(\d{2,3})\s*cm/)
  if (range) return `${range[1]}–${range[2]} cm`
  const all = [...folded.matchAll(/(\d{2,3})\s*cm\b/g)].map((match) => match[1])
  const piece = all.filter((value) => Number(value) <= 90)
  if (piece.length) return `${piece[piece.length - 1]} cm`
  if (all.length) return `${all[all.length - 1]} cm`
  if (/\bindividuell\b/.test(folded) || /\bmassanfertigung\b/.test(folded)) {
    return 'Individuell'
  }
  // „nicht zu groß / eher handlich“ ist Ablehnung von Größe, kein Größenwunsch „Groß“
  if (/\bnicht (zu |so )?gross\b|\bzu gross\b|\bkein(e)? gross/.test(folded)) {
    if (/\bhandlich|zierlich|mittel|tragen|mitbring/.test(folded)) return 'handlich'
    return 'eher handlich'
  }
  if (/\bnicht (zu |so )?klein\b|\bzu klein\b/.test(folded)) {
    return undefined
  }
  if (/\bgross(?:er|es|e)?\b/.test(folded)) return 'Groß'
  if (/\bklein(?:er|es|e)?\b/.test(folded)) return 'Klein'
  if (/\bhandlich\b/.test(folded)) return 'handlich'
  return undefined
}

function agreesToPrice(text: string): boolean {
  const folded = fold(text)
  // A conversational "okay" often softens a rejection: "Okay, aber 75 €
  // sind mir zu teuer" must never turn the preceding offer into a contract.
  if (
    /\b(zu teuer|zu viel|nicht leistbar|nicht machbar|preislich nicht|preis nicht|lieber gunstiger|maximal|hoechstens|hochstens|budget)\b/.test(
      folded,
    )
  ) {
    return false
  }
  return (
    /\b(es mir wert|einverstanden|abgemacht|nehme ich|nehme wir|in ordnung|geht klar|gerne so|machen wir so)\b/.test(
      folded,
    ) ||
    /\b(passt so|passt\.|ok|okay)\b/.test(folded) ||
    /\bsuper\.?\s*(danke)?\b/.test(folded)
  )
}

/** A customer comparing options has not selected either product yet. */
function isUnresolvedCustomerProductChoice(turn: ChatTurn): boolean {
  if (turn.from !== 'kunde') return false
  const folded = fold(turn.text)
  if (!/\b(oder|beziehungsweise|bzw)\b/.test(folded)) return false
  return /\b(weiss (?:auch )?noch nicht|weiss nicht|unsicher|was ware besser|welches ware besser|was passt besser|was empfiehlst du)\b/.test(
    folded,
  )
}

/** A reference, rejection or research-only statement must not open a draft. */
function isNonOrderProductMention(turn: ChatTurn): boolean {
  if (turn.from !== 'kunde') return false
  const folded = fold(turn.text)
  const hasReplacement = /\b(sondern|stattdessen|doch lieber|lieber ein(?:en|e)?|jetzt gern)\b/.test(
    folded,
  )
  if (hasReplacement) return false
  return /\b(brauche ich gar nichts|mochte ich gar nichts|will ich gar nichts|informiere mich nur|wollte nur wissen|nur mal wissen|nicht bestellen|keinen?\s+[^.,;!?]{0,32}(?:bestellen|haben)|keine?\s+[^.,;!?]{0,32}(?:bestellen|haben))\b/.test(
    folded,
  )
}

function isUnresolvedDateChoice(text: string): boolean {
  const folded = fold(text)
  return /\b(oder|beziehungsweise|bzw)\b/.test(folded) &&
    /\b(weiss noch nicht|weiss nicht|unsicher|muss erst|entscheide später|entscheide spaeter)\b/.test(folded)
}

function isUnresolvedFulfilmentQuestion(turn: ChatTurn): boolean {
  if (turn.from !== 'kunde' || !turn.text.includes('?')) return false
  const folded = fold(turn.text)
  return /\b(liefer|abhol)\w*\b/.test(folded) &&
    /\b(oder|entscheide später|entscheide spaeter|weiss noch nicht|weiss nicht)\b/.test(folded)
}

function isUncommittedPriceQuestion(turn: ChatTurn): boolean {
  if (turn.from !== 'kunde' || !turn.text.includes('?')) return false
  const folded = fold(turn.text)
  return /\b(was wurde|was wuerde|was kostet|wie viel kostet|ungefahr kosten|preislich)\b/.test(
    folded,
  )
}

/**
 * A product name in an atelier question is only an option, not an order.
 * Keeping this separate prevents an unanswered "Blumenhoop oder Wandkranz?"
 * from creating a misleading live draft.
 */
function isUnacceptedAtelierProductQuestion(turn: ChatTurn): boolean {
  if (turn.from !== 'atelier' || !turn.text.includes('?')) return false
  const folded = fold(turn.text)
  return /\b(meinst du|mochtest du|möchtest du|magst du|soll es|ware es|wäre es|oder eher|oder einen|oder eine|welchen|welche)\b/.test(
    folded,
  )
}

function proposesPrice(text: string, from: Message['from']): boolean {
  const folded = fold(text)
  if (from === 'atelier') {
    return /\b(preis|anpassen|kostet|wurden|mussten|angebot)\b/.test(folded)
  }
  return /\b(bis|budget|maximal|hochstens|vorstellen|kosten darf|ausgeben)\b/.test(
    folded,
  )
}

function rejects(text: string): string[] {
  const folded = fold(text)
  const hits: string[] = []
  if (
    /\b(katastrope|katastrophe|furchtbar|gefallt mir nicht|mag ich nicht|ohne)\b/.test(
      folded,
    )
  ) {
    if (/\beukalyptus\b/.test(folded)) hits.push('Eukalyptus')
    if (/\bbluten\b/.test(folded)) hits.push('Blütenkombination der Referenz')
  }
  const ohne = text.match(/\bohne\s+([^.,;]+)/i)
  if (ohne) hits.push(ohne[1].trim().replace(/\s+und\s+.*$/, '').trim())
  if (
    /\bpampas/.test(folded) &&
    /\b(nicht so viel|weniger|ohne|kein|keine)\b/.test(folded)
  ) {
    hits.push('Zu viel Pampas')
  }
  for (const noun of REJECT_NOUNS) {
    if (folded.includes(noun) && /\b(kein|keine|nicht|ohne|katastro)/.test(folded)) {
      if (noun.startsWith('eukalyptus')) hits.push('Eukalyptus')
    }
  }
  if (
    /\bkranz an sich nicht\b/.test(folded) ||
    /\bder kranz an sich nicht\b/.test(folded)
  ) {
    hits.push('Kranz der Referenz (Blütenbild)')
  }
  return hits
}

/** Atelier lehnt Produktfamilie ab / ist nicht lieferbar. */
function productRejectionFromText(
  text: string,
  fallbackProduct?: string,
): string | undefined {
  const folded = fold(text)
  const rejected =
    /nicht moglich|nicht möglich|geht (das )?nicht|nicht lieferbar|keine.{0,24}(mehr )?(da|lager|vorrat)|erst ab |erst im |wieder lieferbar|nicht machbar/.test(
      folded,
    )
  if (!rejected) return undefined
  // Bei „nicht möglich + Alternative Strauß“ zählt der Ursprungswunsch, nicht das Angebot
  const product = fallbackProduct || productFromText(text)
  if (!product) return undefined
  let reason = 'nicht möglich'
  if (/erst ab |erst im |wieder lieferbar/.test(folded)) reason = 'erst später lieferbar'
  else if (/frischware|nur frisch/.test(folded)) reason = 'nur Frischware möglich'
  else if (/keine|nicht da|nicht auf lager|nicht vorr/.test(folded)) reason = 'nicht auf Lager'
  return `${product} — ${reason}`
}

/** Kundin nimmt Pivot/Alternative an. */
function acceptsProductPivot(text: string): boolean {
  const folded = fold(text)
  return (
    /nehme ich (gern|gerne|auch)/.test(folded) ||
    /ginge für mich|ginge fur mich/.test(folded) ||
    /dann eher|dann wäre|dann ware|dann nehme/.test(folded) ||
    /merke ich mir.{0,48}(jetzt|strau|gesteck|girlande)/.test(folded) ||
    /komme ich .{0,48}(anderes mal|spaeter|später)/.test(folded) ||
    /wegen (dem|der) .{0,40}(komme|melde)/.test(folded) ||
    /freue ich mich über|freue ich mich uber/.test(folded) ||
    /jetzt (nehme|wär|war).{0,24}(strau|gesteck|girlande|bouquet)/.test(folded) ||
    // A correction can be explicit without the word "dann":
    // "Ich habe mich entschieden: lieber ein Tischgesteck." Keeping this
    // a pivot preserves the earlier wish for the later order archive.
    /ich habe mich entschieden|entschieden:\s*(?:doch\s+)?lieber|doch lieber/.test(folded)
  )
}

/** Produkt, das die Kundin im Pivot annimmt (nicht das zurückgestellte). */
function acceptedPivotProduct(text: string): string | undefined {
  const folded = fold(text)
  const parts = folded.split(
    /\b(jetzt|nehme ich|dann eher|dann wäre|dann ware|freue ich mich|ginge für mich|ginge fur mich)\b/,
  )
  const tail = parts.length > 1 ? parts.slice(-1)[0] : folded
  return productFromText(tail) || productFromText(text)
}

function wantsAtelierDecision(text: string): boolean {
  const folded = fold(text)
  return /\b(entscheide gerne du|entscheide du|entscheidest du|fur dich entscheiden|dir uberlassen|triffst meinen geschmack)\b/.test(
    folded,
  )
}

function likesRohling(text: string): boolean | undefined {
  const folded = fold(text)
  if (!/\brohling\b/.test(folded)) return undefined
  if (/\brohling.{0,28}(nicht|kein|ohne)\b/.test(folded)) return false
  if (/\b(nicht|kein|ohne).{0,16}rohling\b/.test(folded)) return false
  if (/\b(gefallt|mag ich|passt|behalten|so lassen)\b/.test(folded)) return true
  return undefined
}

function deliveryFromText(text: string): string | undefined {
  const folded = fold(text)
  if (/\b(lieferung|liefern|bring|versand|schicken)\b/.test(folded)) {
    if (
      /\b(nicht|keine|ohne|umstandlich|lieber abholung)\b/.test(folded)
    ) {
      return 'Abholung Atelier'
    }
    return 'Lieferung'
  }
  if (/\b(abholung|abholen|vorbei|kommt vorbei|vorbeikommen)\b/.test(folded)) {
    return 'Abholung Atelier'
  }
  return undefined
}

function occasionRank(label: string): number {
  const f = fold(label)
  if (
    /geschenk|mitbring|hochzeit|geburtstag|trauer|taufe|kommunion|ostern|weihnacht|gaste|gaeste/.test(
      f,
    )
  ) {
    return 3
  }
  if (/sideboard/.test(f)) return 2
  if (/deko|interior|wohnung|home/.test(f)) return 1
  return 2
}

export function occasionFromText(text: string): string | undefined {
  let best: string | undefined
  for (const [re, label] of OCCASIONS) {
    re.lastIndex = 0
    if (re.test(text)) {
      if (!best || occasionRank(label) >= occasionRank(best)) best = label
    }
  }
  return best
}

/** Kundin wählt eine Stil-/Nummern-Variante (A–B–C, Farben, Foto). */
export function variantChoiceFromText(text: string): string | undefined {
  const f = fold(text)
  const numbered = f.match(/variante\s*(\d+)/)
  if (numbered) return `Variante ${numbered[1]}`
  if (/\bfoto\s*1\b|erste[sn]? foto|das erste\b/.test(f)) return 'Foto 1'
  if (/\bfoto\s*2\b|zweite[sn]? foto/.test(f)) return 'Foto 2'
  if (/\bfoto\s*3\b|dritte[sn]? foto/.test(f)) return 'Foto 3'
  if (/\boption\s*[aA]\b|\bvariante\s*a\b|\bnur a\b/.test(f)) return 'A'
  if (/\boption\s*[bB]\b|\bvariante\s*b\b|\bnur b\b/.test(f)) return 'B'
  if (/\boption\s*[cC]\b|\bvariante\s*c\b|\bnur c\b/.test(f)) return 'C'
  if (/am liebsten creme|creme und (etwas )?rosa|eher creme|creme\/rosa|creme und rosa/.test(f)) {
    return 'Creme/Rosa'
  }
  if (/\bluftig\b/.test(f) && !/nicht\s+luftig/.test(f)) return 'luftig'
  if (/\bhell\b/.test(f) && !/dunkel/.test(f)) return 'hell'
  if (/\bruhig\b/.test(f)) return 'ruhig'
  if (/dann eher creme|\bnebme ich creme|nehme ich creme|\bcreme\b/.test(f) && /rosa|lieber|eher|nehme|liebsten/.test(f)) {
    return 'Creme'
  }
  if (/am liebsten rosa|eher rosa/.test(f)) return 'Rosa'
  return undefined
}

function mediaFromMessages(messages: Message[]): string {
  const labels: string[] = []
  let videos = 0
  let images = 0
  let voices = 0
  for (const message of messages) {
    if (message.deletedForEveryone) continue
    if (message.kind === 'video') {
      videos += 1
      labels.push(message.text || `Referenzvideo ${videos}`)
    } else if (message.kind === 'image') {
      images += 1
      labels.push(message.text || `Bild ${images}`)
    } else if (message.kind === 'voice') {
      voices += 1
    } else if (message.kind === 'document' && message.documentName) {
      labels.push(message.documentName)
    }
  }
  const counts: string[] = []
  if (videos) counts.push(`${videos}× Video`)
  if (images) counts.push(`${images}× Bild`)
  if (voices) counts.push(`${voices}× Sprachnachricht`)
  return uniqueJoin([...counts, ...labels])
}

function lastProduktBild(
  messages: Message[],
  fallback?: string,
): string | undefined {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i]
    if (message.deletedForEveryone) continue
    if (message.image) return message.image
  }
  return fallback
}

function buildNotes(input: {
  produkt?: string
  ursprungswunsch?: string
  rohling?: string
  stil?: string
  farben?: string
  abgelehnt?: string
  termin?: string
  budget?: string
  preis?: string
  abholung?: string
}): string {
  const bits: string[] = []
  if (input.produkt) bits.push(`Produkt: ${input.produkt}`)
  if (input.ursprungswunsch) bits.push(`Ursprungswunsch: ${input.ursprungswunsch}`)
  if (input.rohling) bits.push(`Rohling: ${input.rohling}`)
  if (input.stil) bits.push(`Stil: ${input.stil}`)
  if (input.farben) bits.push(`Farbwelt: ${input.farben}`)
  if (input.abgelehnt) bits.push(`Abgelehnt: ${input.abgelehnt}`)
  if (input.termin) bits.push(`Termin: ${input.termin}`)
  if (input.budget) bits.push(`Budget: ${input.budget}`)
  if (input.preis) bits.push(`Preis: ${input.preis}`)
  if (input.abholung) bits.push(`Abholung: ${input.abholung}`)
  return bits.join('. ')
}

function confidenceFor(structured: StructuredOrder, messageCount: number): number {
  /** Gewichtung: wie stark ein Feld die Übernahmefähigkeit stützt. */
  const weighted: { key: keyof StructuredOrder; weight: number }[] = [
    { key: 'produkt', weight: 0.18 },
    { key: 'farben', weight: 0.12 },
    { key: 'stil', weight: 0.08 },
    { key: 'rohling', weight: 0.08 },
    { key: 'termin', weight: 0.12 },
    { key: 'abholung', weight: 0.08 },
    { key: 'preisVereinbart', weight: 0.14 },
    { key: 'budget', weight: 0.06 },
    { key: 'adresse', weight: 0.06 },
    { key: 'anlass', weight: 0.04 },
    { key: 'blumenauswahl', weight: 0.04 },
  ]

  let score = 0
  let max = 0
  for (const { key, weight } of weighted) {
    max += weight
    const raw = structured[key]
    if (raw == null) continue
    const text = String(raw).trim()
    if (!text) continue
    // Kurze/schwache Werte zählen weniger (weniger semantische Sicherheit)
    const quality = text.length < 3 ? 0.35 : text.length < 10 ? 0.65 : text.length < 28 ? 0.85 : 1
    score += weight * quality
  }

  if (max <= 0) return 0

  // Ohne ausreichend Chat-Kontext bleibt die Erkennung unsicher
  const msgFactor =
    messageCount <= 0 ? 0.2 : messageCount < 3 ? 0.55 : messageCount < 8 ? 0.82 : 0.95

  const ratio = score / max
  // Realistischer Korridor — nicht künstlich auf 98 % deckeln
  const value = ratio * msgFactor
  return Math.round(Math.max(0, Math.min(0.97, value)) * 100) / 100
}

function inferStatus(
  current: OrderStatus,
  extracted: StructuredOrder,
  turns: ChatTurn[],
): OrderStatus {
  const rank: OrderStatus[] = ['anfrage', 'angebot', 'bestaetigt', 'arbeit', 'fertig']
  if (rank.indexOf(current) >= rank.indexOf('arbeit')) return current

  let inferred: OrderStatus = 'anfrage'
  if (extracted.produkt) inferred = 'anfrage'
  if (extracted.preisVereinbart || extracted.budget) inferred = 'angebot'
  const lastCustomer = [...turns].reverse().find((turn) => turn.from === 'kunde' && turn.text)
  if (extracted.preisVereinbart && lastCustomer && agreesToPrice(lastCustomer.text)) {
    inferred = 'bestaetigt'
  }
  if (extracted.termin && extracted.preisVereinbart && extracted.produkt) {
    if (turns.some((turn) => turn.from === 'kunde' && agreesToPrice(turn.text))) {
      inferred = 'bestaetigt'
    }
  }

  return rank.indexOf(inferred) > rank.indexOf(current) ? inferred : current
}

function mergeList(
  current: string[],
  added: string[],
  removed: string[],
  replace: boolean,
): string[] {
  const drop = (label: string) =>
    removed.some(
      (item) => fold(label).includes(fold(item)) || fold(item).includes(fold(label)),
    )
  const base = replace ? [] : current.filter((item) => !drop(item))
  return collapseContained(
    uniqueJoin([...base, ...added.filter((item) => !drop(item))])
      .split(' · ')
      .filter(Boolean),
  )
}

function isMoreSpecificProduct(prev: string, next: string): boolean {
  if (!prev || !next) return false
  const a = fold(prev)
  const b = fold(next)
  if (a === b) return false
  const catalog = new Set(products.map((product) => fold(product.name)))
  // Kollektionsname (Blickfang) schlägt generisches Lexikon (Blumenhoop)
  if (catalog.has(a) && !catalog.has(b)) return true
  return a.includes(b) && a.length > b.length
}

export type OrderLiveResult = {
  structured: StructuredOrder
  status: OrderStatus
  produktBild?: string
  changedKeys: (keyof StructuredOrder)[]
}

export function deriveOrderFromChat(conversation: Conversation): OrderLiveResult {
  const prev = conversation.structured
  const turns = turnsFromMessages(conversation.messages)
  const extracted: Partial<StructuredOrder> = {
    kanal: 'WhatsApp',
  }

  let proposedPrice: string | undefined
  let customerBudget: string | undefined
  let colors: string[] = []
  let styles: string[] = []
  const rejected: string[] = []
  const refs: string[] = []
  let originalWish: string | undefined
  let lastCustomerProduct: string | undefined
  let wishLocked = false

  for (const turn of turns) {
    const text = turn.text
    if (!text && !turn.mediaLabel) continue

    if (turn.mediaLabel === 'Video' || turn.kind === 'video') {
      refs.push('Referenzvideo (WhatsApp)')
    }
    if (turn.kind === 'image') refs.push('Bild aus Chat')
    if (turn.kind === 'voice') refs.push('Sprachnachricht')
    if (turn.kind === 'document') {
      refs.push(turn.mediaLabel || 'Dokument aus Chat')
    }

    if (!text) continue

    const previousCustomerProduct = lastCustomerProduct
    const product = productFromText(text)
    if (
      product &&
      !isUnacceptedAtelierProductQuestion(turn) &&
      !isUnresolvedCustomerProductChoice(turn) &&
      !isNonOrderProductMention(turn)
    ) {
      if (turn.from === 'kunde') {
        lastCustomerProduct = product
        // Bis zur ersten Ablehnung folgt der Ursprungswunsch dem letzten Kundenwunsch
        // (Blumenhoop → später Kranz: Ursprung = Kranz).
        if (!wishLocked) originalWish = product
      }
      if (
        !extracted.produkt ||
        !isMoreSpecificProduct(extracted.produkt, product)
      ) {
        // Bei Pivot-Ack nicht den zurückgestellten Namen als aktuelles Produkt setzen
        if (
          !(
            turn.from === 'kunde' &&
            acceptsProductPivot(text) &&
            /merke ich mir|halten wir bis spaeter|halten wir bis später|komme ich .{0,48}(anderes mal|spaeter|später)|wegen (dem|der) /.test(
              fold(text),
            )
          )
        ) {
          extracted.produkt = product
        }
      }
    }

    if (turn.from === 'atelier') {
      const productReject = productRejectionFromText(
        text,
        lastCustomerProduct || originalWish || extracted.produkt,
      )
      if (productReject) {
        rejected.push(productReject)
        wishLocked = true
        if (lastCustomerProduct) originalWish = lastCustomerProduct
        else if (!originalWish && extracted.produkt) {
          originalWish = extracted.produkt
        }
      }
    }

    if (turn.from === 'kunde' && acceptsProductPivot(text)) {
      const pivotProduct = acceptedPivotProduct(text)
      if (pivotProduct) {
        if (
          !originalWish &&
          extracted.produkt &&
          fold(extracted.produkt) !== fold(pivotProduct)
        ) {
          originalWish = extracted.produkt
        }
        if (
          extracted.produkt &&
          fold(extracted.produkt) !== fold(pivotProduct) &&
          !originalWish
        ) {
          originalWish = extracted.produkt
        }
        if (
          previousCustomerProduct &&
          fold(previousCustomerProduct) !== fold(pivotProduct)
        ) {
          originalWish = previousCustomerProduct
        }
        wishLocked = true
        extracted.produkt = pivotProduct
      }
    }

    const size = sizeFromText(text)
    if (size) extracted.groesse = size

    const rohling = likesRohling(text)
    if (rohling === true) {
      extracted.rohling = /referenz|video/i.test(text)
        ? 'Rohling aus Referenz'
        : 'Rohling beibehalten'
    } else if (rohling === false) {
      extracted.rohling = 'Rohling abgelehnt'
    }

    const replaceTurn = REPLACE_TURN.test(text)
    const colorHits = aliasHits(text, COLOR_ALIASES)
    colors = mergeList(
      colors,
      colorHits.filter((hit) => !hit.negated).map((hit) => hit.label),
      [
        ...colorHits.filter((hit) => hit.negated).map((hit) => hit.label),
        ...rejects(text),
      ],
      replaceTurn && colorHits.some((hit) => !hit.negated),
    )
    const styleHits = aliasHits(text, STYLE_ALIASES)
    styles = mergeList(
      styles,
      styleHits.filter((hit) => !hit.negated).map((hit) => hit.label),
      styleHits.filter((hit) => hit.negated).map((hit) => hit.label),
      replaceTurn && styleHits.some((hit) => !hit.negated),
    )
    rejected.push(...rejects(text))

    if (wantsAtelierDecision(text)) {
      extracted.blumenauswahl = 'Atelier entscheidet — Vertrauensbasis Kundengeschmack'
    }

    if (turn.from === 'kunde') {
      const variant = variantChoiceFromText(text)
      if (variant) extracted.variante = variant
    }

    const occasion = occasionFromText(text)
    if (occasion) {
      if (
        !extracted.anlass ||
        occasionRank(occasion) >= occasionRank(String(extracted.anlass))
      ) {
        extracted.anlass = occasion
      }
    }

    const weekday = pickWeekday(text)
    const date = findDate(text)
    if ((weekday || date) && !isUnresolvedDateChoice(text)) {
      extracted.termin = [weekday, date].filter(Boolean).join(' · ')
    }

    const time = findTimeRange(text)
    if (time) extracted.abholung = time
    else if (/\bnachmittag\b/.test(fold(text))) {
      extracted.abholung = extracted.abholung || 'Nachmittag'
    }

    const delivery = isUnresolvedFulfilmentQuestion(turn)
      ? undefined
      : deliveryFromText(text)
    if (delivery) extracted.lieferung = delivery

    const address = findAddress(text)
    if (address) extracted.adresse = address

    const amounts = euroAmounts(text)
    if (amounts.length) {
      const amount = amounts[amounts.length - 1]
      if (turn.from === 'kunde' && isUncommittedPriceQuestion(turn)) {
        // A quoted amount in a question is not a declared spending limit.
      } else if (turn.from === 'kunde' && proposesPrice(text, 'kunde')) {
        customerBudget = amount
      } else if (turn.from === 'kunde' && !proposedPrice) {
        customerBudget = amount
      } else if (turn.from === 'atelier') {
        proposedPrice = amount
        if (/\b(aufwendig|saison|jahreszeit|deshalb|leider mehr)\b/i.test(fold(text))) {
          extracted.preisBegruendung = text.trim()
        }
      } else if (turn.from === 'kunde' && proposedPrice) {
        customerBudget = customerBudget || amount
      }
    }

    if (turn.from === 'kunde' && proposedPrice && agreesToPrice(text)) {
      extracted.preisVereinbart = proposedPrice
    }

  }

  if (styles.length) extracted.stil = uniqueJoin(styles)
  if (colors.length) extracted.farben = uniqueJoin(colors)
  if (rejected.length) extracted.abgelehnt = uniqueJoin(rejected)
  if (originalWish) extracted.ursprungswunsch = originalWish
  if (refs.length) extracted.referenz = uniqueJoin(refs)
  if (customerBudget) {
    extracted.budget = customerBudget.startsWith('bis')
      ? customerBudget
      : `Wunsch bis ${customerBudget}`
  }
  const medien = mediaFromMessages(conversation.messages)
  if (medien) extracted.medien = medien

  if (
    extracted.produkt &&
    /kranz/i.test(extracted.produkt) &&
    (extracted.blumenauswahl || extracted.rohling)
  ) {
    extracted.produkt = extracted.produkt.includes('Individuell')
      ? extracted.produkt
      : 'Individueller Kranz (Maßanfertigung)'
    extracted.groesse = extracted.groesse || 'Individuell'
  }

  if (extracted.rohling && /video|referenz/i.test(extracted.referenz ?? '')) {
    extracted.rohling = 'Rohling aus Referenzvideo'
  }

  if (!extracted.anlass && extracted.produkt) {
    extracted.anlass =
      typeof prev.anlass === 'string' && prev.anlass.trim()
        ? prev.anlass
        : 'Home Interior / Dekoration'
  } else if (
    extracted.anlass &&
    typeof prev.anlass === 'string' &&
    prev.anlass.trim() &&
    occasionRank(prev.anlass) > occasionRank(String(extracted.anlass))
  ) {
    // Stärkerer Anlass aus Auftrag/Verlauf behalten
    extracted.anlass = prev.anlass
  }

  extracted.notizen = buildNotes({
    produkt: extracted.produkt,
    ursprungswunsch: extracted.ursprungswunsch,
    rohling: extracted.rohling,
    stil: extracted.stil,
    farben: extracted.farben,
    abgelehnt: extracted.abgelehnt,
    termin: extracted.termin,
    budget: extracted.budget,
    preis: extracted.preisVereinbart,
    abholung: extracted.abholung,
  })

  const structured: StructuredOrder = { ...emptyStructuredOrder(), ...prev }
  const changedKeys: (keyof StructuredOrder)[] = []

  const keys = Object.keys(extracted) as (keyof StructuredOrder)[]
  for (const key of keys) {
    const nextValue = extracted[key]
    if (nextValue == null || nextValue === '') continue
    if (key === 'konfidenz') continue
    if (
      key === 'produkt' &&
      typeof structured.produkt === 'string' &&
      isMoreSpecificProduct(structured.produkt, String(nextValue))
    ) {
      continue
    }
    const prevValue = structured[key]
    if (String(prevValue ?? '') !== String(nextValue)) {
      changedKeys.push(key)
    }
    Object.assign(structured, { [key]: nextValue })
  }

  if (!structured.kanal) structured.kanal = 'WhatsApp'
  if (!structured.adresse && prev.adresse) structured.adresse = prev.adresse
  if (!structured.sku && prev.sku) structured.sku = prev.sku

  structured.konfidenz = confidenceFor(structured, conversation.messages.length)
  if (structured.konfidenz !== prev.konfidenz) changedKeys.push('konfidenz')

  const status = inferStatus(conversation.status, structured, turns)
  const produktBild = lastProduktBild(
    conversation.messages,
    conversation.produktBild,
  )

  return { structured, status, produktBild, changedKeys }
}

export function structuredEquals(a: StructuredOrder, b: StructuredOrder): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]) as Set<
    keyof StructuredOrder
  >
  for (const key of keys) {
    if (String(a[key] ?? '') !== String(b[key] ?? '')) return false
  }
  return true
}

export function applyOrderSemantics(conversation: Conversation): {
  conversation: Conversation
  changedKeys: (keyof StructuredOrder)[]
  statusChanged: boolean
} {
  const derived = deriveOrderFromChat(conversation)
  const sameStruct = structuredEquals(conversation.structured, derived.structured)
  const sameStatus = conversation.status === derived.status
  const sameImage =
    !derived.produktBild || derived.produktBild === conversation.produktBild
  if (sameStruct && sameStatus && sameImage) {
    return { conversation, changedKeys: [], statusChanged: false }
  }
  return {
    conversation: {
      ...conversation,
      structured: derived.structured,
      status: derived.status,
      produktBild: derived.produktBild ?? conversation.produktBild,
    },
    changedKeys: derived.changedKeys,
    statusChanged: !sameStatus,
  }
}

export function conversationMessagesFingerprint(conversation: Conversation): string {
  return conversation.messages
    .map((message) =>
      [
        message.id,
        message.from,
        message.kind,
        message.deletedForEveryone ? '1' : '0',
        message.text ?? '',
        message.transcript ?? '',
        message.image ?? '',
        message.video ?? '',
        message.documentName ?? '',
      ].join('\u001f'),
    )
    .join('\u001e')
}

export function conversationsMessagesFingerprint(
  conversations: Conversation[],
): string {
  return conversations
    .map((conversation) => `${conversation.id}:${conversationMessagesFingerprint(conversation)}`)
    .join('\n')
}
