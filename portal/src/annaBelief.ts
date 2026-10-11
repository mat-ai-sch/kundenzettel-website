/**
 * Anna Belief-State — Weltmodell über den gesamten Chatverlauf.
 * Basis für deliberatives Entscheiden (nicht nur letzte Nachricht).
 */

import type { Conversation, Message } from './data'
import {
  detectFloristryProduct,
  detectAllFloristryKinds,
  isHoopKind,
  type FloristryKind,
} from './floristryLexicon'
import {
  classifyAtelierSpeechAct,
  kundeMessageStatesWish,
  isKranzFamily,
  mayPursueProduct,
  type AtelierSpeechAct,
} from './annaDialogRules'
import { occasionFromText } from './orderFromChat'

export type FamilyKey = 'hoop' | 'kranz' | 'strauss' | 'other'

export type ProductBlock = {
  family: FamilyKey
  kind?: FloristryKind
  untilLabel?: string
  reason: string
}

export type AnnaBelief = {
  wishedKind: FloristryKind
  /**
   * Zurückgestellter Kundenwunsch beim Pivot (z. B. Kranz → Strauß).
   * Für „… merke ich mir bis später“, nicht der Default-Blumenhoop.
   */
  deferredKind?: FloristryKind
  canPursueWish: boolean
  blocks: ProductBlock[]
  goldRingMissing: boolean
  canBringRing: boolean
  freshOnly: boolean
  alternativeOffered: boolean
  /** Konkret genannte Alternativen im Verlauf (kumuliert) */
  offeredKinds: FloristryKind[]
  /** Anna hat ihr Anliegen/Produkt schon benannt (nicht nur „Hallo“). */
  hasStatedWish: boolean
  /** Anlass über den gesamten Chat (kumuliert, zuletzt Stärkstes). */
  occasion?: string
  hasStatedOccasion: boolean
  /** Kundin hat ein Angebot/Pivot im Verlauf aktiv angenommen (nicht nur Atelier-Angebot). */
  acceptedKindByKunde?: FloristryKind
  lastAct: AtelierSpeechAct
  lastAtelierText: string
  sentVideos: number
  sentPhotos: number
  hasReferenceImage: boolean
  paused: boolean
  /** Kurze Begründung für Tests / Debug */
  pursuitBlockReason?: string
}

function fold(value: string): string {
  return value
    .toLowerCase()
    .replace(/ß/g, 'ss')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
}

export function familyKeyFor(kind: FloristryKind): FamilyKey {
  if (isHoopKind(kind)) return 'hoop'
  if (isKranzFamily(kind)) return 'kranz'
  if (kind === 'strauss' || kind === 'bouquet') return 'strauss'
  return 'other'
}

function sameFamily(a: FamilyKey, kind: FloristryKind): boolean {
  return familyKeyFor(kind) === a
}

/** Aktueller Kundenwunsch; bei Pivot Y als current, X als deferred. */
function detectKundeWishUpdate(raw: string): {
  current?: FloristryKind
  deferredFromPivot?: FloristryKind
} {
  const folded = fold(raw)
  const allKinds = detectAllFloristryKinds(raw).filter((k) => k !== 'katalog')
  const deferral =
    /merke ich mir|halte ich .{0,24}fest|halten wir .{0,24}fest|bis spaeter|bis später|fuer spaeter|für später|komme ich .{0,48}(anderes mal|spaeter|später)|melde ich mich .{0,40}(spaeter|später|nochmal)|wegen (dem|der) .{0,40}(komme|melde)/.test(
      folded,
    )
  const acceptance =
    /nehme ich (gern|gerne)|waere .{0,40}auch|wäre .{0,40}auch|dann eher|dann nehme|entscheide ich mich|waere ein .{0,24}auch|wäre ein .{0,24}auch/.test(
      folded,
    )

  const kindFromSlice = (slice: string): FloristryKind | undefined => {
    const hit = detectFloristryProduct(slice)
    return hit && hit.kind !== 'katalog' ? hit.kind : undefined
  }

  if (deferral && acceptance) {
    // Zurückgestellt: „Wegen dem X …“ / vor „jetzt“
    let deferredFromPivot: FloristryKind | undefined
    const wegenMatch = folded.match(/wegen (dem|der) [^.]{0,48}/)
    if (wegenMatch) deferredFromPivot = kindFromSlice(wegenMatch[0])
    if (!deferredFromPivot && /\bjetzt\b/.test(folded)) {
      deferredFromPivot = kindFromSlice(folded.split(/\bjetzt\b/)[0] ?? '')
    }

    // Aktuell: nach „nehme ich“ / nach „jetzt“ — ohne Wegen-Klausel
    const withoutWegen = folded.replace(/wegen (dem|der) [^.]{0,48}\.?/g, ' ')
    let current: FloristryKind | undefined
    const nehme = withoutWegen.match(
      /nehme ich (gern |gerne )?[^.]{0,60}|dann nehme ich [^.]{0,60}|dann eher [^.]{0,60}/,
    )
    if (nehme) current = kindFromSlice(nehme[0])
    if (!current && /\bjetzt\b/.test(withoutWegen)) {
      current = kindFromSlice(withoutWegen.split(/\bjetzt\b/).slice(1).join(' '))
    }
    if (!current) {
      current = allKinds.find((k) => k !== deferredFromPivot)
    }
    if (deferredFromPivot && current === deferredFromPivot) {
      current = allKinds.find((k) => k !== deferredFromPivot)
    }

    if (deferredFromPivot && current && deferredFromPivot !== current) {
      return { deferredFromPivot, current }
    }
    if (current) return { current, deferredFromPivot }
  }

  if (
    /\bjetzt\b/.test(folded) &&
    (/merke ich mir|halte ich .{0,24}fest|bis spaeter|bis später|fuer spaeter|für später/.test(
      folded,
    ) ||
      /nehme ich (gern|gerne)/.test(folded))
  ) {
    const parts = folded.split(/\bjetzt\b/)
    const before = parts[0] ?? ''
    const after = parts.slice(1).join(' ')
    const deferredHit = kindFromSlice(before)
    // Nach „jetzt“ zuerst Annahme, nicht die spätere Wegen-Klausel
    const afterClean = after.replace(/wegen (dem|der) [^.]{0,48}\.?/g, ' ')
    const currentHit = kindFromSlice(afterClean) ?? kindFromSlice(after)
    return {
      deferredFromPivot: deferredHit,
      current: currentHit,
    }
  }
  const hit = detectFloristryProduct(raw)
  if (hit && hit.kind !== 'katalog') return { current: hit.kind }
  return {}
}

function visible(conversation: Conversation): Message[] {
  return conversation.messages.filter((m) => !m.deletedForEveryone)
}

function isDeferralAck(text: string): boolean {
  const folded = fold(text).replace(/[.,!?;:]/g, '').replace(/\s+/g, ' ').trim()
  return (
    folded === 'alles gut dann spater' ||
    folded === 'kein thema dann spater' ||
    folded === 'okay dann spater' ||
    folded === 'passt dann spater' ||
    folded === 'klar dann spater' ||
    folded === 'gut dann erstmal nicht' ||
    folded === 'kein stress spater' ||
    folded.startsWith('alles gut')
  )
}

function isBoundary(text: string): boolean {
  const folded = fold(text)
  return (
    /keine zeit/.test(folded) ||
    /nicht jetzt|jetzt nicht/.test(folded) ||
    /\b(abbrechen|abbruch|stopp|stop)\b/.test(folded) ||
    /muss mich um/.test(folded) ||
    /um meine kinder/.test(folded) ||
    /bin beschaftigt|bin im stress/.test(folded) ||
    /heute nicht/.test(folded) ||
    // Nur echte Absage — nicht „komme ich ein anderes Mal auf dich zu“ (Zurückstellung)
    (/\bein anderes? ?mal\b/.test(folded) &&
      !/wegen |komme ich|melde ich|nehme ich|strau|gesteck|girlande|hoop|kranz/.test(
        folded,
      )) ||
    /spaeter melden|spater melden/.test(folded)
  )
}

function mediaTag(message: Message): 'hand-video' | 'table-video' | 'hand-photo' | 'table-photo' | null {
  const video = message.video ?? ''
  const image = message.image ?? ''
  if (message.kind === 'video' || video) {
    if (video.includes('anna-blickfang-hand') || image.includes('anna-blickfang-hand')) {
      return 'hand-video'
    }
    if (video.includes('anna-blickfang-table') || image.includes('anna-blickfang-table')) {
      return 'table-video'
    }
  }
  if (message.kind === 'image' || image) {
    if (image.includes('anna-blickfang-hand')) return 'hand-photo'
    if (image.includes('anna-blickfang-table')) return 'table-photo'
  }
  return null
}

function occasionRank(label: string): number {
  const f = fold(label)
  if (/geschenk|mitbring|hochzeit|geburtstag|trauer|taufe|kommunion|ostern|weihnacht|gaste|gaeste/.test(f)) {
    return 3
  }
  if (/sideboard/.test(f)) return 2
  if (/deko|interior|wohnung|home/.test(f)) return 1
  return 2
}

function rememberOccasion(current: string | undefined, next: string | undefined): string | undefined {
  if (!next) return current
  if (!current) return next
  return occasionRank(next) >= occasionRank(current) ? next : current
}

function removeBlocksForKind(blocks: ProductBlock[], kind: FloristryKind): ProductBlock[] {
  const family = familyKeyFor(kind)
  return blocks.filter((b) => b.family !== family)
}

/**
 * Baut das Weltmodell chronologisch aus allen sichtbaren Nachrichten.
 */
function rejectionReasonFromAtelier(raw: string, freshContext: boolean): string {
  const folded = fold(raw)
  if (/nicht moglich|geht (das )?nicht|nicht machbar|nicht lieferbar/.test(folded)) {
    return 'nicht möglich'
  }
  if (freshContext || /frischware|frischblumen|nur frisch/.test(folded)) {
    return 'nur Frischware möglich'
  }
  return raw.slice(0, 120)
}

export function buildAnnaBelief(conversation: Conversation): AnnaBelief {
  const messages = visible(conversation)
  let wishedKind: FloristryKind = 'blumenhoop'
  let deferredKind: FloristryKind | undefined
  let statedProduct = false
  const blocks: ProductBlock[] = []
  let goldRingMissing = false
  let canBringRing = false
  let freshOnly = false
  let alternativeOffered = false
  const offeredKindsAccum: FloristryKind[] = []
  const offeredSeen = new Set<FloristryKind>()
  let hasStatedWish = false
  let occasion: string | undefined
  let hasStatedOccasion = false
  let acceptedKindByKunde: FloristryKind | undefined
  let sentVideos = 0
  let sentPhotos = 0
  let hasReferenceImage = false
  let paused = false
  let lastAct: AtelierSpeechAct = {
    type: 'other',
    offeredKinds: [],
    offersAlternative: false,
    bringOwn: false,
    freshContext: false,
  }
  let lastAtelierText = ''

  const rememberOffers = (kinds: readonly FloristryKind[]) => {
    for (const kind of kinds) {
      if (offeredSeen.has(kind)) continue
      offeredSeen.add(kind)
      offeredKindsAccum.push(kind)
    }
  }

  const deferCurrentWish = (nextKind: FloristryKind, reason: string) => {
    if (!statedProduct) return
    if (sameFamily(familyKeyFor(nextKind), wishedKind)) return
    if (!deferredKind) deferredKind = wishedKind
    const family = familyKeyFor(deferredKind)
    if (!blocks.some((b) => b.family === family)) {
      blocks.push({
        family,
        kind: deferredKind,
        reason,
      })
    }
  }

  for (const message of messages) {
    const raw = [message.text, message.transcript].filter(Boolean).join(' ').trim()

    if (message.from === 'kunde') {
      if (raw && isDeferralAck(raw)) paused = true
      const occasionHit = raw ? occasionFromText(raw) : undefined
      if (occasionHit) {
        occasion = rememberOccasion(occasion, occasionHit)
        hasStatedOccasion = true
      }
      const update = raw ? detectKundeWishUpdate(raw) : {}
      if (update.current) {
        if (update.deferredFromPivot && update.deferredFromPivot !== update.current) {
          deferredKind = deferredKind ?? update.deferredFromPivot
          const family = familyKeyFor(update.deferredFromPivot)
          if (!blocks.some((b) => b.family === family)) {
            blocks.push({
              family,
              kind: update.deferredFromPivot,
              reason: 'vom Kunden zurückgestellt',
            })
          }
        }
        wishedKind = update.current
        statedProduct = true
        hasStatedWish = true
        if (
          update.deferredFromPivot ||
          /nehme ich (gern|gerne)|dann nehme ich|jetzt nehme|dann eher|freue ich mich|waere .{0,40}auch|wäre .{0,40}auch|entscheide ich mich/.test(
            fold(raw),
          )
        ) {
          acceptedKindByKunde = update.current
        }
        // Nur bei klarem Annehmen einer angebotenen Alternative die Sperre heben
        if (
          offeredSeen.has(update.current) &&
          (update.deferredFromPivot ||
            /nehme ich (gern|gerne)|dann nehme ich|jetzt nehme|dann eher|freue ich mich|entscheide ich mich/.test(
              fold(raw),
            ))
        ) {
          const next = removeBlocksForKind(blocks, update.current)
          blocks.length = 0
          blocks.push(...next)
        }
      } else if (raw) {
        const foldedKunde = fold(raw)
        // Nur echtes Anliegen — nicht „hast du kurz Zeit?“ / reine Begrüßung
        if (kundeMessageStatesWish(foldedKunde)) {
          hasStatedWish = true
        }
      }
      const tag = mediaTag(message)
      if (tag?.endsWith('video')) {
        sentVideos += 1
        hasStatedWish = true
      }
      if (tag?.endsWith('photo')) {
        sentPhotos += 1
        hasStatedWish = true
      }
      if (message.kind === 'image' && (message.attribution || message.forwarded)) {
        hasReferenceImage = true
        hasStatedWish = true
      }
      continue
    }

    if (message.from !== 'atelier' || !raw) continue

    lastAtelierText = raw
    const act = classifyAtelierSpeechAct(raw, { isBoundary: isBoundary(raw) })
    lastAct = act
    alternativeOffered = alternativeOffered || act.offersAlternative
    rememberOffers(act.offeredKinds)
    if (act.type === 'offer_other' && act.kind) {
      rememberOffers([act.kind])
    }

    if (act.type === 'boundary') {
      paused = true
      continue
    }

    if (act.type === 'hold') {
      paused = true
      continue
    }

    if (act.type === 'resume') {
      paused = false
      continue
    }

    // Atelier ist wieder im Dialog (Einladung / Angebot) → Soft-Pause vorbei
    if (
      act.type === 'invite' ||
      act.type === 'preference_ask' ||
      act.type === 'budget_ask' ||
      act.type === 'occasion_ask' ||
      act.type === 'offer_other' ||
      act.type === 'stock_limit' ||
      act.type === 'material'
    ) {
      paused = false
    }

    if (act.type === 'greeting') {
      continue
    }

    if (act.type === 'unavailable_until') {
      const kind = act.kind ?? wishedKind
      const family = familyKeyFor(kind)
      blocks.push({
        family,
        kind,
        untilLabel: act.untilLabel,
        reason: raw.slice(0, 120),
      })
      // Side-Signal: Goldring/Material in derselben Sperr-Nachricht
      if (act.alsoMaterial || act.bringOwn) {
        if (act.bringOwn) {
          canBringRing = true
        } else {
          goldRingMissing = true
          canBringRing = false
        }
      }
      if (act.offersAlternative) alternativeOffered = true
      continue
    }

    if (act.type === 'material') {
      if (act.bringOwn) {
        canBringRing = true
      } else {
        goldRingMissing = true
        canBringRing = false
      }
      // Fehlbestand + Mitbringen in einer Nachricht
      const foldedMat = fold(raw)
      if (
        /keine? goldringe?\b/.test(foldedMat) ||
        /keine? goldene?n? ringe?\b/.test(foldedMat) ||
        /goldringe?.{0,24}(nicht|keine|leer|alle|mehr)/.test(foldedMat) ||
        /goldene?n? ringe?.{0,40}(nicht|keine|leer|alle|mehr|lager|liefer)/.test(foldedMat) ||
        /nicht.{0,20}goldring/.test(foldedMat) ||
        (/nicht (mehr )?lieferbar/.test(foldedMat) && /gold|ringe?\b/.test(foldedMat))
      ) {
        goldRingMissing = true
      }
      if (act.bringOwn) canBringRing = true
      if (act.offersAlternative) alternativeOffered = true
      continue
    }

    if (act.freshContext) {
      const nextKind =
        act.kind === 'bouquet' || act.kind === 'strauss'
          ? act.kind
          : act.kind && !isHoopKind(act.kind)
            ? act.kind
            : 'strauss'
      // Nach verbindlicher Kundenwahl keinen Frischware-Zwangspivot mehr
      const stickFresh =
        acceptedKindByKunde &&
        acceptedKindByKunde !== nextKind &&
        !(
          (acceptedKindByKunde === 'strauss' || acceptedKindByKunde === 'bouquet') &&
          (nextKind === 'strauss' || nextKind === 'bouquet')
        )
      if (!stickFresh) {
        freshOnly = true
        deferCurrentWish(nextKind, rejectionReasonFromAtelier(raw, true))
        wishedKind = nextKind
      } else {
        freshOnly = true
      }
    }

    if (act.type === 'offer_other' && act.kind) {
      const offered = act.kind
      const sameAsAccepted =
        Boolean(acceptedKindByKunde) &&
        (acceptedKindByKunde === offered ||
          (isHoopKind(acceptedKindByKunde!) && isHoopKind(offered)) ||
          ((acceptedKindByKunde === 'strauss' || acceptedKindByKunde === 'bouquet') &&
            (offered === 'strauss' || offered === 'bouquet')))
      // Kundin hat schon verbindlich gewählt → neues Angebot nicht als Wunsch überschreiben
      if (acceptedKindByKunde && !sameAsAccepted) {
        rememberOffers([offered])
        alternativeOffered = true
      } else {
        deferCurrentWish(offered, rejectionReasonFromAtelier(raw, act.freshContext))
        const next = removeBlocksForKind(blocks, offered)
        blocks.length = 0
        blocks.push(...next)
        wishedKind = offered
      }
    }

    if (act.type === 'invite' || act.type === 'preference_ask' || act.type === 'stock_limit') {
      if (act.offersAlternative) alternativeOffered = true
    }
  }

  const blockedByHistory = blocks.some((b) => sameFamily(b.family, wishedKind))
  // Begrüßung/Hold/Resume blockieren nicht den Wunsch selbst — nur den aktuellen Turn
  // (mayPursueProduct(greeting)=false darf canPursueWish nicht dauerhaft vergiften).
  const softTurn =
    lastAct.type === 'greeting' ||
    lastAct.type === 'hold' ||
    lastAct.type === 'resume' ||
    lastAct.type === 'occasion_ask'
  const blockedByLastAct = !softTurn && !mayPursueProduct(wishedKind, lastAct)
  let pursuitBlockReason: string | undefined
  if (blockedByHistory) {
    const block = blocks.find((b) => sameFamily(b.family, wishedKind))
    pursuitBlockReason = block?.untilLabel
      ? `gesperrt bis ${block.untilLabel}`
      : block?.reason ?? 'historische Sperre'
  } else if (blockedByLastAct) {
    pursuitBlockReason = `letzter Akt: ${lastAct.type}`
  }

  // Goldring fehlt und kein Mitbringen → Hoop nicht verfolgen (auch bei
  // unavailable_until mit alsoMaterial, nicht nur bei Primärakt material)
  const canPursueWish =
    !blockedByHistory &&
    !blockedByLastAct &&
    !(goldRingMissing && !canBringRing && isHoopKind(wishedKind))

  return {
    wishedKind,
    deferredKind,
    canPursueWish,
    blocks,
    goldRingMissing,
    canBringRing,
    freshOnly,
    alternativeOffered,
    offeredKinds: offeredKindsAccum,
    hasStatedWish,
    occasion,
    hasStatedOccasion,
    acceptedKindByKunde,
    lastAct,
    lastAtelierText,
    sentVideos,
    sentPhotos,
    hasReferenceImage,
    paused,
    pursuitBlockReason,
  }
}

export function activeBlockForWish(belief: AnnaBelief): ProductBlock | undefined {
  return belief.blocks.find((b) => sameFamily(b.family, belief.wishedKind))
}
