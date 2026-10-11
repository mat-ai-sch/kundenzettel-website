/**
 * Anna Hartmann — Kundin im WhatsApp-Testchat.
 * Ton: ganze Sätze, Du, kein Gedankenstrich (—), keine Emojis, keine KI-Floskeln.
 * Verständnis/Constraints: annaDialogRules + annaAgent (Belief → Deliberation).
 */

import type { Conversation, Message, MessageKind } from './data'
import { products } from './data'
import {
  detectFloristryProduct,
  isHoopKind,
  labelForKind,
  type FloristryKind,
} from './floristryLexicon'
import { referenceQueryForKind } from './referenceImages'
import { buildAnnaBelief } from './annaBelief'
import { planAnnaAgentAsync, planAnnaAgentSync } from './annaAgent'
import {
  classifyAtelierSpeechAct,
  isGreetingOnly,
  isMereContactOpener,
} from './annaDialogRules'

export const ANNA_CHAT_ID = 'demo-anna'

export const ANNA_FACTS = {
  firstName: 'Anna',
  fullName: 'Anna Hartmann (Test)',
  address: 'Finkenstraße 56, 41749 Viersen',
  street: 'Finkenstraße 56',
  city: 'Viersen',
  wants: 'Blickfang',
  size: '35 cm',
  budget: 45,
  budgetStretch: 58,
  pickupDay: 'Samstag',
  pickupWindow: '15–16 Uhr',
} as const

export const ANNA_MEDIA = {
  hand: {
    video: '/media/demo/anna-blickfang-hand.mp4',
    poster: '/media/demo/anna-blickfang-hand.jpg',
    duration: '0:05',
  },
  table: {
    video: '/media/demo/anna-blickfang-table.mp4',
    poster: '/media/demo/anna-blickfang-table.jpg',
    duration: '0:05',
  },
} as const

export type AnnaBubble = {
  kind: MessageKind
  text?: string
  image?: string
  video?: string
  duration?: string
  forwarded?: boolean
  attribution?: string
  referenceSearch?: { query: string; kind: FloristryKind }
  gapMs: number
  typingMs: number
}

export type AnnaPlan = {
  reactToLast?: string
  bubbles: AnnaBubble[]
}

export type AnnaPlanOptions = {
  entropy?: string
  now?: Date
}

export function isAnnaCustomerName(name: string): boolean {
  return fold(name).includes('anna hartmann')
}

export function isAnnaBotChat(conversation: {
  id: string
  kunde: string
  blocked?: boolean
}): boolean {
  if (conversation.blocked) return false
  return conversation.id === ANNA_CHAT_ID || isAnnaCustomerName(conversation.kunde)
}

function fold(value: string): string {
  return value
    .toLowerCase()
    .replace(/ß/g, 'ss')
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
}

function foldSoft(value: string): string {
  return fold(value)
}

function hashSeed(value: string): number {
  let hash = 2166136261
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

function pick<T>(items: readonly T[], seed: string): T {
  return items[hashSeed(seed) % items.length]
}

function liveEntropy(): string {
  return `${Date.now()}|${Math.random().toString(36).slice(2, 8)}`
}

function typingFor(text: string, kind: MessageKind): number {
  if (kind !== 'text') return 780 + (text.length % 400)
  return Math.min(3400, Math.max(620, 38 * Math.max(8, text.length)))
}

function gapFor(index: number, seed: string): number {
  return 420 + (hashSeed(`${seed}|g${index}`) % 480)
}

function bubble(
  kind: MessageKind,
  opts: {
    text?: string
    image?: string
    video?: string
    duration?: string
    forwarded?: boolean
    attribution?: string
    referenceSearch?: { query: string; kind: FloristryKind }
    seed: string
    index: number
  },
): AnnaBubble {
  const text = opts.text ?? ''
  return {
    kind,
    text: opts.text,
    image: opts.image,
    video: opts.video,
    duration: opts.duration,
    forwarded: opts.forwarded,
    attribution: opts.attribution,
    referenceSearch: opts.referenceSearch,
    gapMs: gapFor(opts.index, opts.seed),
    typingMs: typingFor(text || opts.duration || 'media', kind),
  }
}

function texts(seed: string, lines: string[]): AnnaBubble[] {
  return lines
    .filter(Boolean)
    .map((text, index) => bubble('text', { text, seed, index }))
}

const DEFER_LINES = [
  'Alles klar, dann melde ich mich später noch einmal.',
  'Verstehe, kein Thema. Ich melde mich später.',
  'Passt, dann erstmal nicht. Bis später.',
  'Alles gut, ich schreibe dir später noch einmal.',
] as const

type AnnaAngle = 'hand' | 'table'

const PHOTO_PLAYBACK_HAND = [
  'Geht bei dir das Video nicht? Dann schicke ich dir das Foto von ihr.',
  'Okay, dann schicke ich dir das Foto von ihr.',
  'Einen Moment, ich schicke dir dasselbe als Foto von ihr.',
] as const

const PHOTO_PLAYBACK_TABLE = [
  'Geht das Video nicht? Dann schicke ich dir das Foto vom Tisch von ihr.',
  'Okay, hier das Foto von ihr auf dem Tisch.',
  'Dann lieber als Foto. Hier die Aufnahme von ihr auf dem Tisch.',
] as const

const PHOTO_ASK_HAND = [
  'Klar. Hier das Foto von ihr.',
  'Einen Moment, ich schicke dir das Foto von ihr.',
  'Hier das Foto von meiner Freundin.',
] as const

const PHOTO_ASK_TABLE = [
  'Hier das Foto vom Tisch von ihr.',
  'Ja, hier das auf dem Tisch von ihr.',
  'Vom Tisch von ihr eher locker, Pampas eher wenig.',
] as const

const PHOTO_OTHER_HAND = [
  'Zu weit weg? Hier die nähere Aufnahme von ihr.',
  'Andere Aufnahme von ihr, näher am Ring.',
  'Einen Moment, hier die in der Hand von ihr.',
] as const

const PHOTO_OTHER_TABLE = [
  'Andere Aufnahme von ihr, auf dem Tisch.',
  'Einen Moment, hier die vom Tisch.',
  'Vom Tisch von ihr sind die Trockenblumen eher locker.',
] as const

const BOTH_STILLS_DONE = [
  'Mehr als die zwei Fotos von ihr habe ich nicht.',
  'Nur die beiden von ihr. Mehr habe ich nicht.',
  'Hand und Tisch habe ich. Mehr hat sie mir nicht geschickt.',
] as const

function stillCaption(
  angle: AnnaAngle,
  opts: { playback: boolean; preferOther: boolean; seed: string },
): string {
  if (opts.playback && angle === 'hand') return pick(PHOTO_PLAYBACK_HAND, `${opts.seed}|ph`)
  if (opts.playback && angle === 'table') return pick(PHOTO_PLAYBACK_TABLE, `${opts.seed}|pt`)
  if (opts.preferOther && angle === 'hand') return pick(PHOTO_OTHER_HAND, `${opts.seed}|oh`)
  if (opts.preferOther && angle === 'table') return pick(PHOTO_OTHER_TABLE, `${opts.seed}|ot`)
  if (angle === 'hand') return pick(PHOTO_ASK_HAND, `${opts.seed}|ah`)
  return pick(PHOTO_ASK_TABLE, `${opts.seed}|at`)
}

function stillBubble(
  angle: AnnaAngle,
  seed: string,
  index: number,
  opts: { playback: boolean; preferOther: boolean },
): AnnaBubble {
  const media = angle === 'hand' ? ANNA_MEDIA.hand : ANNA_MEDIA.table
  return bubble('image', {
    text: stillCaption(angle, { ...opts, seed }),
    image: media.poster,
    forwarded: true,
    seed,
    index,
  })
}

function mediaAngleFromMessage(message: Message): AnnaAngle | null {
  const video = message.video ?? ''
  const image = message.image ?? ''
  if (video.includes('anna-blickfang-hand') || image.includes('anna-blickfang-hand')) return 'hand'
  if (video.includes('anna-blickfang-table') || image.includes('anna-blickfang-table')) return 'table'
  return null
}

function countKundeStills(conversation: Conversation): {
  handPhoto: boolean
  tablePhoto: boolean
  lastVideoAngle: AnnaAngle | null
  lastPhotoAngle: AnnaAngle | null
} {
  let handPhoto = false
  let tablePhoto = false
  let lastVideoAngle: AnnaAngle | null = null
  let lastPhotoAngle: AnnaAngle | null = null
  for (const message of visibleMessages(conversation)) {
    if (message.from !== 'kunde') continue
    const angle = mediaAngleFromMessage(message)
    if (!angle) continue
    if (message.kind === 'video' || message.video) lastVideoAngle = angle
    if (message.kind === 'image' && message.image && !message.video) {
      lastPhotoAngle = angle
      if (angle === 'hand') handPhoto = true
      if (angle === 'table') tablePhoto = true
    }
  }
  return { handPhoto, tablePhoto, lastVideoAngle, lastPhotoAngle }
}

function detectPlaybackComplaint(folded: string): boolean {
  return (
    /nicht abspiel/.test(folded) ||
    /geht (bei dir |das )?(nicht|nicht auf)/.test(folded) ||
    /video .{0,24}nicht/.test(folded) ||
    /kann .{0,20}video nicht/.test(folded) ||
    /wieder ein video/.test(folded) ||
    /kein video/.test(folded)
  )
}

function detectPhotoAsk(folded: string): boolean {
  return (
    /\bfoto\b/.test(folded) ||
    /\bin foto\b/.test(folded) ||
    /hast du (ein |mal )?foto/.test(folded) ||
    /brauch(e|st)? .{0,16}foto/.test(folded) ||
    /als foto/.test(folded) ||
    /standbild/.test(folded) ||
    /andere sicht/.test(folded)
  )
}

function detectPreferOtherAngle(folded: string): boolean {
  return (
    /andere sicht|andere aufnahme|andere persepektive|andere perspektive/.test(folded) ||
    /noch (die |das )?andere/.test(folded) ||
    /vom tisch|auf dem tisch/.test(folded) ||
    /in der hand|naher|näher/.test(folded)
  )
}

export function isConversationBoundary(text: string): boolean {
  const folded = fold(text)
  return (
    /keine zeit/.test(folded) ||
    /nicht jetzt|jetzt nicht/.test(folded) ||
    /\b(abbrechen|abbruch|stopp|stop)\b/.test(folded) ||
    /\bhalt (bitte|mal)\b/.test(folded) ||
    /spaeter melden|später melden|schreib .* spaeter|schreib .* später/.test(folded)
  )
}

type OpenerSpec = {
  kind: FloristryKind
  lines: readonly string[]
  daypart?: 'morning' | 'evening'
}

type CollectionOpenerSpec = OpenerSpec & {
  collectionId: string
  collectionName: string
  collectionImage: string
}

const HOOP_OPENERS: readonly OpenerSpec[] = [
  {
    kind: 'blumenhoop',
    lines: [
      'Hallo Damaris',
      'Könntest du noch einmal so einen Blumenhoop machen wie bei meiner Freundin, mit dem Goldring?',
    ],
  },
  {
    kind: 'blumenhoop',
    lines: [
      'Hey Damaris, ich hoffe, ich störe dich nicht.',
      'Hättest du noch einmal Zeit für so einen Blumenhoop wie bei meiner Freundin?',
    ],
  },
  {
    kind: 'blumenhoop',
    lines: [
      'Hallo Damaris',
      'Ich bräuchte noch einmal so einen Blumenhoop wie bei meiner Freundin.',
    ],
  },
  {
    kind: 'blumenhoop',
    lines: [
      'Hallo Damaris',
      'Meine Freundin hat so einen Blumenhoop von dir. Geht das noch einmal?',
    ],
  },
  {
    kind: 'blumenhoop',
    lines: [
      'Hallo Damaris, hättest du noch einmal Kapazität für so einen Blumenhoop wie bei meiner Freundin?',
    ],
  },
  {
    kind: 'blumenhoop',
    lines: [
      'Hi Damaris',
      'Könntest du noch einmal so einen Blumenhoop mit Pampas und Trockenblumen machen?',
    ],
  },
  {
    kind: 'blumenhoop',
    lines: [
      'Hallo Damaris, bist du da?',
      'Ich hätte gern noch einmal so einen Blumenhoop wie bei meiner Freundin.',
    ],
  },
  {
    kind: 'blumenhoop',
    lines: [
      'Hey Damaris, ich stör nur kurz.',
      'Könntest du noch einmal so einen Blumenhoop wie bei meiner Freundin machen?',
    ],
  },
  {
    kind: 'blumenhoop',
    lines: [
      'Hallo Damaris',
      'Ich würde gern noch einmal so einen Blumenhoop machen lassen wie bei meiner Freundin.',
    ],
  },
  {
    kind: 'blumenhoop',
    lines: [
      'Hallo Damaris',
      'Hättest du noch einmal Zeit für so einen Blumenhoop, wenn das bei dir geht?',
    ],
  },
  {
    kind: 'blumenhoop',
    lines: [
      'Guten Abend Damaris',
      'Hättest du noch einmal Zeit für so einen Blumenhoop wie bei meiner Freundin?',
    ],
    daypart: 'evening',
  },
  {
    kind: 'blumenhoop',
    lines: [
      'Guten Morgen Damaris',
      'Hättest du noch einmal Zeit für so einen Blumenhoop wie bei meiner Freundin?',
    ],
    daypart: 'morning',
  },
  {
    kind: 'blumenhoop',
    lines: [
      'Hallo Damaris',
      'Ich würde gern nachfragen: geht noch einmal so ein Blumenhoop wie bei meiner Freundin?',
    ],
  },
  {
    kind: 'blumenhoop',
    lines: [
      'Hi Damaris',
      'Hättest du Zeit für so einen Blumenhoop wie bei meiner Freundin, mit Pampas?',
    ],
  },
  {
    kind: 'blumenhoop',
    lines: [
      'Hallo Damaris',
      'Meine Freundin hatte den Blumenhoop bei dir. Könntest du so einen noch einmal machen?',
    ],
  },
]

const ALT_OPENERS: readonly OpenerSpec[] = [
  {
    kind: 'wandkranz',
    lines: [
      'Hallo Damaris',
      'Hättest du Zeit für einen Wandkranz mit Eukalyptus und Trockenblumen?',
    ],
  },
  {
    kind: 'tischkranz',
    lines: [
      'Hey Damaris',
      'Könntest du einen Tischkranz machen, Mitte frei für eine Kerze?',
    ],
  },
  {
    kind: 'tuerkranz',
    lines: [
      'Hallo Damaris',
      'Ich bräuchte einen Türkranz mit Trockenblumen für draußen, eher luftig.',
    ],
  },
  {
    kind: 'gesteck',
    lines: [
      'Hallo Damaris',
      'Hättest du Zeit für ein Tischgesteck mit Trockenblumen?',
    ],
  },
  {
    kind: 'girlande',
    lines: [
      'Hi Damaris',
      'Könntest du eine Girlande fürs Sideboard machen?',
    ],
  },
  {
    kind: 'fensterkranz',
    lines: [
      'Hallo Damaris',
      'Hättest du Lust auf einen kleinen Fensterkranz?',
    ],
  },
  {
    kind: 'adventskranz',
    lines: [
      'Hallo Damaris',
      'Könntest du einen Adventskranz mit Trockenblumen machen?',
    ],
  },
  {
    kind: 'kranz',
    lines: [
      'Hallo Damaris',
      'Könntest du einen luftigen Trockenblumenkranz machen?',
    ],
  },
]

const COLLECTION_OPENERS: readonly CollectionOpenerSpec[] = products
  .filter((p) => p.id !== 'kombi-set')
  .map((p) => {
    const hoopish = /blickfang/i.test(p.name)
    const article = hoopish ? 'so einen' : 'so eine'
    return {
      kind: (hoopish ? 'blumenhoop' : 'katalog') as FloristryKind,
      collectionId: p.id,
      collectionName: p.name,
      collectionImage: p.image,
      lines: [
        'Hallo Damaris',
        `Könntest du noch einmal ${article} ${p.name} aus der Kollektion machen?`,
      ],
    }
  })

function dayPart(now: Date): 'morning' | 'evening' | 'day' {
  const h = now.getHours()
  if (h < 11) return 'morning'
  if (h >= 18) return 'evening'
  return 'day'
}

function chooseOpenerSpec(seed: string, now: Date): OpenerSpec | CollectionOpenerSpec {
  const part = dayPart(now)
  const roll = hashSeed(`${seed}|family`) % 100
  // ~60% hoop, ~20% alt, ~20% collection
  if (roll < 20) {
    const matching = COLLECTION_OPENERS.filter((item) => !item.daypart || item.daypart === part)
    const pool = matching.length > 0 ? matching : COLLECTION_OPENERS
    return pick(pool, `${seed}|col`)
  }
  if (roll < 40) {
    const matching = ALT_OPENERS.filter((item) => !item.daypart || item.daypart === part)
    const pool = matching.length > 0 ? matching : ALT_OPENERS
    return pick(pool, `${seed}|alt`)
  }
  const matching = HOOP_OPENERS.filter((item) => !item.daypart || item.daypart === part)
  const pool = matching.length > 0 ? matching : HOOP_OPENERS
  return pick(pool, `${seed}|hoop`)
}

function askLinesWithoutAtelierHello(lines: readonly string[]): string[] {
  return lines
    .map((line) =>
      line
        .replace(/^(Guten Morgen|Guten Abend|Hallo|Hey|Hi)\s+Damaris[,!]?\s*/i, '')
        .replace(/^(Guten Morgen|Guten Abend)[,!]?\s*/i, '')
        .trim(),
    )
    .filter(Boolean)
}

function collectionProductFromOpener(
  chosen: OpenerSpec | CollectionOpenerSpec,
): { id: string; name: string; image: string } | null {
  if (!('collectionId' in chosen)) return null
  return {
    id: chosen.collectionId,
    name: chosen.collectionName,
    image: chosen.collectionImage,
  }
}

function variedOpeningAsk(
  seed: string,
  now: Date,
): {
  kind: FloristryKind
  lines: string[]
  collection?: { id: string; name: string; image: string }
} {
  const chosen = chooseOpenerSpec(seed, now)
  return {
    kind: chosen.kind,
    lines: askLinesWithoutAtelierHello(chosen.lines),
    collection: collectionProductFromOpener(chosen) ?? undefined,
  }
}

function openerPlan(seed: string, now: Date): AnnaPlan {
  const chosen = chooseOpenerSpec(seed, now)
  const collection = collectionProductFromOpener(chosen)
  const lines = [...chosen.lines].map((l) => l.trim()).filter(Boolean)
  const folded = fold(lines.join(' '))
  if (
    !/blumenhoop|\bhoop\b|goldring|pampas|trocken|freundin|wandkranz|tuerkranz|tischkranz|fensterkranz|adventskranz|gesteck|girlande|traumtanzer|traumtaenzer|augenweide|wunderfein|gluckskind|glueckskind|blickfang|umarmung|flustern|fluestern|strau|kollektion/.test(
      folded,
    )
  ) {
    lines.push(
      'Hättest du noch einmal Zeit für so einen Blumenhoop wie bei meiner Freundin?',
    )
  }
  const bubbles = texts(seed, lines.slice(0, 2))
  if (collection && chosen.kind === 'katalog' && bubbles.length < 2) {
    bubbles.push(
      bubble('image', {
        text: `So ungefähr stelle ich mir ${collection.name} vor.`,
        image: collection.image,
        forwarded: true,
        attribution: 'Kundenzettel · Kollektion',
        seed,
        index: bubbles.length,
      }),
    )
  }
  return { bubbles: bubbles.slice(0, 2) }
}

function visibleMessages(conversation: Conversation): Message[] {
  return conversation.messages.filter((m) => !m.deletedForEveryone)
}

function trailingAtelier(messages: Message[]): Message[] {
  const out: Message[] = []
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (messages[i].from !== 'atelier') break
    out.unshift(messages[i])
  }
  return out
}

function priorKundeSalt(messages: Message[]): string {
  const kunde = messages.filter((m) => m.from === 'kunde')
  return kunde
    .slice(-3)
    .map((m) => m.text ?? m.transcript ?? m.kind)
    .join('|')
}

function lastKundeSpokenText(conversation: Conversation): string {
  const messages = visibleMessages(conversation)
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (messages[i].from !== 'kunde') continue
    const text = messages[i].text?.trim()
    if (text) return text
  }
  return ''
}

function countKundeMedia(
  conversation: Conversation,
): { videos: number; photos: number } {
  let videos = 0
  let photos = 0
  for (const m of visibleMessages(conversation)) {
    if (m.from !== 'kunde') continue
    if (m.kind === 'video' || m.video) videos += 1
    if (m.kind === 'image' && m.image && !m.video) photos += 1
  }
  return { videos, photos }
}

function namedCollectionInChat(
  conversation: Conversation,
): { id: string; name: string; image: string } | null {
  for (const m of visibleMessages(conversation)) {
    const raw = [m.text, m.transcript].filter(Boolean).join(' ')
    if (!raw) continue
    for (const p of products) {
      if (new RegExp(p.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(raw)) {
        return { id: p.id, name: p.name, image: p.image }
      }
    }
  }
  return null
}

export function detectAnnaProductKind(conversation: Conversation): FloristryKind {
  const messages = visibleMessages(conversation)
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const raw = [messages[i].text, messages[i].transcript].filter(Boolean).join(' ')
    if (!raw) continue
    const hit = detectFloristryProduct(raw)
    if (hit) {
      if (hit.kind === 'katalog' && /blickfang/i.test(hit.label)) return 'blumenhoop'
      return hit.kind
    }
  }
  return 'blumenhoop'
}

const FIRST_INTROS: readonly (readonly string[])[] = [
  ['Diesen Goldring mit Pampas und Trockenblumen meine ich.'],
  [
    'Diesen Goldring mit Pampas und Trockenblumen meine ich.',
    'Das leite ich dir von meiner Freundin weiter.',
  ],
  ['Ich meine so einen Blumenhoop wie bei meiner Freundin, mit Pampas und Trockenblumen.'],
  [
    'Meine Freundin hat den bei dir.',
    'Das ist der Goldring mit Pampas und Trockenblumen.',
  ],
  ['Von meiner Freundin: dieser Goldring mit Pampas und Trockenblumen.'],
  ['Genau den Blumenhoop mit Pampas und Trockenblumen meine ich.'],
  [
    'Einen Moment, ich leite dir das von meiner Freundin weiter.',
    'Das ist der Goldring mit Pampas und Trockenblumen.',
  ],
  ['Ich meine den hier mit dem Goldring und den Trockenblumen.'],
  [
    'Meine Freundin hat den Blumenhoop bei dir.',
    'Das ist der Goldring mit Pampas und Trockenblumen.',
  ],
  ['Ich möchte so einen Blumenhoop wie bei meiner Freundin, mit Pampas und Trockenblumen.'],
]

const SECOND_INTROS: readonly (readonly string[])[] = [
  ['Meine Freundin hat noch ein Video geschickt, auf dem Tisch. Das leite ich dir auch weiter.'],
  ['Hier noch die andere Aufnahme von ihr, diesmal auf dem Tisch.'],
  ['Noch das Video vom Tisch, da sieht man den Ring besser.'],
  ['Einen Moment, ich schicke dir noch die andere Aufnahme von ihr, auf dem Tisch.'],
  [
    'Den Goldring finde ich schön, Pampas eher wenig.',
    'Hier noch das Video vom Tisch von ihr.',
  ],
  ['Noch einmal von ihr, diesmal auf dem Tisch aufgenommen.'],
]

function nextProductClip(
  sentVideos: number,
  seed: string,
  index: number,
): AnnaBubble | null {
  if (sentVideos === 0) {
    return bubble('video', {
      text: undefined,
      video: ANNA_MEDIA.hand.video,
      image: ANNA_MEDIA.hand.poster,
      duration: ANNA_MEDIA.hand.duration,
      forwarded: true,
      seed,
      index,
    })
  }
  if (sentVideos === 1) {
    return bubble('video', {
      text: undefined,
      video: ANNA_MEDIA.table.video,
      image: ANNA_MEDIA.table.poster,
      duration: ANNA_MEDIA.table.duration,
      forwarded: true,
      seed,
      index,
    })
  }
  return null
}

function introducePiece(
  seed: string,
  sentVideos: number,
): { lines: string[]; clip: AnnaBubble | null } {
  const clip = nextProductClip(sentVideos, seed, 2)
  if (sentVideos === 0 && clip) {
    return { lines: [...pick(FIRST_INTROS, `${seed}|intro0`)], clip }
  }
  if (sentVideos === 1 && clip) {
    return { lines: [...pick(SECOND_INTROS, `${seed}|intro1`)], clip }
  }
  return { lines: [], clip: null }
}

function mediaHandoffLines(seed: string): string[] {
  return [
    pick(
      [
        'Das leite ich dir von meiner Freundin weiter, dann siehst du welches Stück ich meine.',
        'Zur Orientierung schicke ich dir das von meiner Freundin.',
        'Ich leite dir das von ihr weiter.',
      ],
      `${seed}|hand`,
    ),
  ]
}

function euroIn(text: string): number | null {
  const m = text.match(/(\d+[.,]?\d*)\s*€|€\s*(\d+[.,]?\d*)|(\d+[.,]?\d*)\s*euro/i)
  if (!m) return null
  const raw = m[1] || m[2] || m[3]
  return Number(String(raw).replace(',', '.'))
}

function referenceCaption(kind: FloristryKind, seed: string, catalogName?: string): string {
  if (catalogName) {
    return pick(
      [
        `So ungefähr stelle ich mir ${catalogName} vor.`,
        `In der Art von ${catalogName} meine ich das.`,
        `Diesen Look von ${catalogName} hätte ich gern.`,
      ],
      `${seed}|cap-cat`,
    )
  }
  if (kind === 'strauss' || kind === 'bouquet') {
    return pick(
      [
        'So ungefähr stelle ich mir den Strauß vor.',
        'In der Richtung wäre der Strauß schön.',
      ],
      `${seed}|cap-strau`,
    )
  }
  if (kind === 'gesteck') {
    return pick(
      [
        'So in der Richtung stelle ich mir das Gesteck vor.',
        'Ein Gesteck in etwa so, nicht zu hoch.',
      ],
      `${seed}|cap-gest`,
    )
  }
  if (kind === 'girlande') {
    return 'So ungefähr stelle ich mir die Girlande vor.'
  }
  if (isHoopKind(kind)) {
    return 'So ungefähr stelle ich mir den Blumenhoop vor.'
  }
  const label = labelForKind(kind)
  return `So ungefähr stelle ich mir den ${label} vor.`
}

function referenceBubble(
  kind: FloristryKind,
  seed: string,
  index: number,
  conversation?: Conversation,
  preferredCollection?: { id: string; name: string; image: string } | null,
): AnnaBubble {
  const collection =
    preferredCollection ?? (conversation ? namedCollectionInChat(conversation) : null)
  if (collection) {
    return bubble('image', {
      text: referenceCaption('katalog', seed, collection.name),
      image: collection.image,
      forwarded: true,
      attribution: 'Kundenzettel · Kollektion',
      seed,
      index,
    })
  }
  return bubble('image', {
    text: referenceCaption(kind, seed),
    forwarded: true,
    referenceSearch: { query: referenceQueryForKind(kind, seed), kind },
    seed,
    index,
  })
}

function asksCustomerPreference(folded: string): boolean {
  return (
    /was stellst du dir vor/.test(folded) ||
    /wie stellst du (dir|ihn|sie|es) vor/.test(folded) ||
    /wie darf .{0,48}aussehen/.test(folded) ||
    /wie soll .{0,48}aussehen/.test(folded) ||
    /beschreib.{0,32}(in )?worten/.test(folded) ||
    /nicht (eindeutig |klar |genau )?erkennen/.test(folded) ||
    /\boptik\b/.test(folded)
  )
}

function asksCustomerBudget(folded: string): boolean {
  if (/was darf (es|das|der|die) (denn )?sein\b/.test(folded)) return false
  if (/was darf ich (dir |euch )?(anbieten|machen|tun|helfen)/.test(folded)) return false
  return (
    /preisvorstellung/.test(folded) ||
    /was darf .{0,40}kosten/.test(folded) ||
    /was darf (der|die|das|es|er)\b.{0,48}(kosten|preis|werden|ueberhaupt|überhaupt|max|maximal)/.test(
      folded,
    ) ||
    /wie viel darf/.test(folded) ||
    /wie teuer/.test(folded) ||
    /kosten darf/.test(folded) ||
    /\bbudget\b/.test(folded) ||
    /preislich/.test(folded) ||
    /sag mir .{0,36}(preis|budget|kosten|wie viel)/.test(folded)
  )
}

function customerPreferenceLines(
  kind: FloristryKind,
  seed: string,
  withBudget = false,
): string[] {
  if (withBudget) {
    if (isHoopKind(kind)) {
      return [
        pick(
          [
            'Am liebsten ruhig und luftig mit Goldring, Pampas eher wenig, und beim Preis hatte ich so um die 45 Euro im Kopf.',
            'Ich hätte ihn gern zurückhaltend mit Goldring, und preislich denke ich an etwa 45 Euro.',
          ],
          `${seed}|prefbudhoop`,
        ),
      ]
    }
    if (kind === 'tischkranz') {
      return [
        pick(
          [
            'Am liebsten ruhig in Creme und etwas Rosa, eher locker, Mitte frei für eine Kerze, und beim Preis so um die 45 Euro.',
            'Ruhige Farben, luftig gebunden, Mitte gern frei für eine Kerze, und ich hatte mir etwa 45 Euro vorgestellt, bis 50 ginge noch.',
          ],
          `${seed}|prefbudtisch`,
        ),
      ]
    }
    return [
      pick(
        [
          'Am liebsten ruhig in Creme und etwas Rosa, eher locker, und beim Preis hatte ich so um die 45 Euro im Kopf.',
          'Ruhige Farben und nicht zu üppig, und preislich denke ich an etwa 45 Euro, ein Stück darüber wäre okay.',
        ],
        `${seed}|prefbud`,
      ),
    ]
  }
  if (isHoopKind(kind)) {
    return [
      pick(
        [
          'Am liebsten ruhig und eher luftig, mit dem Goldring, und bei den Pampas eher wenig.',
          'Ich hätte den gern zurückhaltend, Goldring ja, Pampas nur sparsam.',
        ],
        `${seed}|prefhoop`,
      ),
    ]
  }
  const tableHint =
    kind === 'tischkranz' ? ' und die Mitte gern frei für eine Kerze' : ''
  return [
    pick(
      [
        `Am liebsten ruhig in Creme und etwas Rosa, eher locker und nicht zu üppig${tableHint}.`,
        `Ruhige Farben wären schön, Creme und Weiß, vielleicht etwas Grün, und eher luftig${tableHint}.`,
      ],
      `${seed}|prefalt`,
    ),
  ]
}

function customerBudgetLines(seed: string): string[] {
  return [
    pick(
      [
        'Ich hatte mir so um die 45 Euro vorgestellt. Ein Stück darüber wäre okay, wenn es sich lohnt.',
        'Beim Preis denke ich an etwa 45 Euro, bis ungefähr 50 ginge auch noch.',
        'So um die 45 Euro fühle ich mich wohl. Wenn es ein wenig mehr wird, sag mir einfach Bescheid.',
      ],
      `${seed}|bud`,
    ),
  ]
}

/**
 * Nächste WhatsApp-Blasen. Regelbasiert.
 */
export function planAnnaReplies(
  conversation: Conversation,
  options: AnnaPlanOptions = {},
): AnnaPlan {
  if (!isAnnaBotChat(conversation)) return { bubbles: [] }

  const messages = visibleMessages(conversation)
  const now = options.now ?? new Date()
  const seedBase = `${conversation.id}|${messages.length}`

  if (messages.length === 0) {
    const entropy = options.entropy ?? liveEntropy()
    return openerPlan(`${seedBase}|${entropy}`, now)
  }

  const cluster = trailingAtelier(messages)
  const last = cluster[cluster.length - 1]
  if (!last) return { bubbles: [] }

  const text = cluster
    .map((message) => [message.text, message.transcript].filter(Boolean).join(' '))
    .join('\n')
    .trim()
  const folded = foldSoft(text)
  const salt = String(hashSeed(priorKundeSalt(messages)))
  const seed = `${seedBase}|${last.kind}|${text}|${salt}|${options.entropy ?? ''}`

  if (text && isConversationBoundary(text)) {
    return { bubbles: texts(seed, [pick(DEFER_LINES, `${seed}|bound`)]) }
  }

  const agentHandled = planAnnaAgentSync(conversation, { ...options, seed })
  if (agentHandled) return agentHandled

  const belief = buildAnnaBelief(conversation)
  const productKind = belief.wishedKind
  const { videos: sentVideos } = countKundeMedia(conversation)
  const speechAct = classifyAtelierSpeechAct(text)
  const preferenceAsk = asksCustomerPreference(folded)
  const asksBudget = asksCustomerBudget(folded)
  const collection = namedCollectionInChat(conversation)

  // Reine Begrüßung → Anliegen streuen (wie Opener)
  if (speechAct.type === 'greeting' || isGreetingOnly(folded)) {
    if (!belief.hasStatedWish || isMereContactOpener(fold(lastKundeSpokenText(conversation)))) {
      const opening = variedOpeningAsk(`${seed}|greetask`, now)
      const bubbles = texts(seed, opening.lines)
      if (opening.collection) {
        bubbles.push(
          bubble('image', {
            text: referenceCaption('katalog', seed, opening.collection.name),
            image: opening.collection.image,
            forwarded: true,
            attribution: 'Kundenzettel · Kollektion',
            seed,
            index: bubbles.length,
          }),
        )
      } else if (!isHoopKind(opening.kind)) {
        bubbles.push(referenceBubble(opening.kind, seed, bubbles.length, conversation))
      }
      return { bubbles: bubbles.slice(0, 3) }
    }
    // Anliegen steht: Medien nachreichen, keine Wiederholungsfrage
    if (collection) {
      return {
        bubbles: [
          bubble('image', {
            text: referenceCaption('katalog', seed, collection.name),
            image: collection.image,
            forwarded: true,
            attribution: 'Kundenzettel · Kollektion',
            seed,
            index: 0,
          }),
        ],
      }
    }
    if (isHoopKind(productKind) && belief.canPursueWish && sentVideos < 2) {
      const intro = introducePiece(seed, sentVideos)
      return {
        bubbles: [
          ...texts(seed, intro.lines.length ? intro.lines : mediaHandoffLines(seed)),
          ...(intro.clip ? [intro.clip] : []),
        ].slice(0, 3),
      }
    }
    if (!isHoopKind(productKind) && !belief.hasReferenceImage) {
      return {
        bubbles: [
          bubble('text', {
            text: 'Zur Orientierung schicke ich dir ein Referenzbild.',
            seed,
            index: 0,
          }),
          referenceBubble(productKind, seed, 1, conversation),
        ],
      }
    }
    return {
      bubbles: texts(seed, [
        pick(
          [
            'Genau so, daran halten wir fest.',
            'Ja, genau das meinte ich.',
            'Schön, dann bleiben wir dabei.',
          ],
          `${seed}|greetack`,
        ),
      ]),
    }
  }

  if (preferenceAsk || speechAct.type === 'preference_ask') {
    const withBudget = asksBudget || Boolean(speechAct.alsoBudget)
    return {
      bubbles: texts(
        seed,
        customerPreferenceLines(productKind, seed, withBudget),
      ),
    }
  }

  if (asksBudget || speechAct.type === 'budget_ask') {
    return { bubbles: texts(seed, customerBudgetLines(seed)) }
  }

  const stills = countKundeStills(conversation)
  const playback = detectPlaybackComplaint(folded)
  const photoAsk = detectPhotoAsk(folded)
  const preferOther = detectPreferOtherAngle(folded)

  // Standbilder statt neuem Video (Playback-Klage / Fotofrage)
  if (
    belief.canPursueWish &&
    isHoopKind(productKind) &&
    (playback || photoAsk) &&
    sentVideos > 0
  ) {
    if (stills.handPhoto && stills.tablePhoto) {
      return { bubbles: texts(seed, [pick(BOTH_STILLS_DONE, `${seed}|bothstill`)]) }
    }
    let angle: AnnaAngle =
      stills.lastVideoAngle ??
      (sentVideos >= 2 ? 'table' : 'hand')
    if (preferOther) {
      if (stills.handPhoto && !stills.tablePhoto) angle = 'table'
      else if (stills.tablePhoto && !stills.handPhoto) angle = 'hand'
      else angle = angle === 'hand' ? 'table' : 'hand'
    } else if (stills.lastPhotoAngle === 'hand' && !stills.tablePhoto) {
      angle = 'table'
    } else if (playback || photoAsk) {
      angle = stills.lastVideoAngle ?? 'hand'
    }
    if (angle === 'hand' && stills.handPhoto && !stills.tablePhoto) angle = 'table'
    if (angle === 'table' && stills.tablePhoto && !stills.handPhoto) angle = 'hand'
    return {
      bubbles: [
        stillBubble(angle, seed, 0, {
          playback,
          preferOther: preferOther || Boolean(stills.lastPhotoAngle),
        }),
      ],
    }
  }

  const amount = euroIn(text)
  const isQuestion = /\?/.test(text) || /sag mir|brauch|hast du|kannst du/.test(folded)
  const asksAddress = /anschrift|adresse|wo wohn|strasse|straße/.test(folded)
  const asksWhen =
    isQuestion &&
    (/bis wann|wann brauch|welcher tag|fur wann|für wann|termin/.test(folded) ||
      (/(montag|dienstag|mittwoch|donnerstag|freitag|samstag|sonntag)/.test(folded) &&
        /abhol|fertig|passen|passt|termin/.test(folded)))
  const asksPickup =
    isQuestion &&
    /abhol|uhrzeit|vorbeikomm|zwischen|nachmittag/.test(folded) &&
    !asksWhen
  const asksDelivery = isQuestion && /lieferung|liefern|bring|versand/.test(folded)
  const asksSize =
    isQuestion && /grosse|grose|groesse|größe|cm|durchmesser|wie breit|wie gross|wie groß/.test(folded)
  const asksGift =
    isQuestion &&
    (/geschenk|verschenk|schenken|mitbring/.test(folded) ||
      (/(fur dich|für dich)/.test(folded) && /geschenk|schenk|oder/.test(folded)))
  const asksPlace =
    isQuestion && /wand oder|tisch oder|sideboard|platzierung|wo (soll|darf)|eher auf den tisch/.test(folded)
  const asksWhich =
    isQuestion &&
    /welchen meinst|welches meinst|was meinst du|welchen genau|welches stuck|welches stück|welchen hoop|welchen blumen/.test(
      folded,
    )
  const commentsOnPiece =
    /goldring|pampas|schoen|schön|ich seh|sehe ich|gefaellt|gefällt|klasse|toll|genau so|hab(e)? ich gesehen|ich sehs/.test(
      folded,
    ) && sentVideos > 0
  const asksNeed =
    isQuestion &&
    /was brauch|was soll|was darf ich|wobei kann|was genau|welches produkt|was kann ich/.test(
      folded,
    )
  const asksPhotoMedia =
    isQuestion && /foto|bild|referenz|zeig|schicken|video/.test(folded) && !asksSize && !asksWhich
  const offersHelp = /was kann ich|wobei kann ich|womit kann ich/.test(folded)

  const lines: string[] = []
  const extras: AnnaBubble[] = []
  const push = (line: string) => {
    if (line.trim()) lines.push(line.trim())
  }

  if (asksSize) {
    if (isHoopKind(productKind)) {
      push('35 cm, wie der Blickfang. Nicht größer, er hängt über dem Sideboard.')
    } else if (productKind === 'strauss' || productKind === 'bouquet') {
      push(
        pick(
          [
            'Nicht zu groß, eher handlich zum Mitbringen.',
            'So mittelgroß, dass man ihn gut tragen kann.',
          ],
          `${seed}|sizestrauss`,
        ),
      )
    } else {
      push(
        pick(
          [
            `Eher handlich beim ${labelForKind(productKind)}, nicht zu üppig.`,
            'Nicht zu groß, eher zierlich.',
          ],
          `${seed}|sizealt`,
        ),
      )
    }
  }
  if (asksGift) {
    push(
      pick(
        [
          'Es soll ein Geschenk werden, etwas zum Mitbringen.',
          'Ja, zum Verschenken. Deshalb soll es schön und nicht zu üppig sein.',
        ],
        `${seed}|gift`,
      ),
    )
  }
  if (asksPlace) {
    push(
      pick(
        [
          'Eher für die Wand über dem Sideboard.',
          'Fürs Sideboard an der Wand, nicht als Tischstück.',
        ],
        `${seed}|place`,
      ),
    )
  }

  // „Welchen meinst du?“ / Kommentar zum Stück → Clip(s) nachreichen
  if (
    isHoopKind(productKind) &&
    belief.canPursueWish &&
    (asksWhich || commentsOnPiece) &&
    sentVideos < 2 &&
    !playback &&
    !photoAsk
  ) {
    const intro = introducePiece(seed, sentVideos)
    intro.lines.forEach(push)
    if (!intro.lines.length) {
      if (sentVideos === 1) {
        push('Hier noch die andere Aufnahme von ihr, diesmal auf dem Tisch.')
      } else {
        mediaHandoffLines(seed).forEach(push)
      }
    }
    if (intro.clip) extras.push(intro.clip)
  } else if (
    collection &&
    (asksNeed || offersHelp || speechAct.type === 'invite') &&
    !asksSize &&
    !asksGift
  ) {
    extras.push(
      bubble('image', {
        text: referenceCaption('katalog', seed, collection.name),
        image: collection.image,
        forwarded: true,
        attribution: 'Kundenzettel · Kollektion',
        seed,
        index: 0,
      }),
    )
    push(`Genau, ${collection.name} aus der Kollektion meine ich.`)
  } else if (
    isHoopKind(productKind) &&
    belief.canPursueWish &&
    (asksNeed || offersHelp || asksPhotoMedia || speechAct.type === 'invite') &&
    sentVideos < 2 &&
    !asksSize &&
    !asksGift &&
    !asksPlace &&
    !asksWhich &&
    !commentsOnPiece
  ) {
    // Noch kein Anliegen genannt → klare Bitte (Opener), sonst Clip/Intro
    if (!belief.hasStatedWish && sentVideos === 0) {
      const opening = variedOpeningAsk(`${seed}|inviteask`, now)
      opening.lines.forEach(push)
      if (opening.collection) {
        extras.push(
          bubble('image', {
            text: referenceCaption('katalog', seed, opening.collection.name),
            image: opening.collection.image,
            forwarded: true,
            attribution: 'Kundenzettel · Kollektion',
            seed,
            index: 0,
          }),
        )
      } else if (isHoopKind(opening.kind)) {
        const intro = introducePiece(seed, 0)
        if (intro.clip) extras.push(intro.clip)
      } else if (!belief.hasReferenceImage) {
        extras.push(referenceBubble(opening.kind, seed, 1, conversation))
      }
    } else {
      const intro = introducePiece(seed, sentVideos)
      intro.lines.forEach(push)
      if (!intro.lines.length) mediaHandoffLines(seed).forEach(push)
      if (intro.clip) extras.push(intro.clip)
    }
  } else if (
    (asksNeed || offersHelp || speechAct.type === 'invite') &&
    !asksSize &&
    !asksGift &&
    !asksPlace &&
    !asksWhen &&
    !asksPickup &&
    !asksDelivery
  ) {
    if (!isHoopKind(productKind) && belief.hasStatedWish) {
      push(
        pick(
          [
            `Genau, ${labelForKind(productKind)} meine ich.`,
            `Ja, den ${labelForKind(productKind)} hätte ich gern.`,
          ],
          `${seed}|confirmkind`,
        ),
      )
      if (!belief.hasReferenceImage) {
        extras.push(referenceBubble(productKind, seed, extras.length, conversation))
      }
    } else {
      const opening = variedOpeningAsk(`${seed}|need`, now)
      opening.lines.forEach(push)
      if (opening.collection) {
        extras.push(
          bubble('image', {
            text: referenceCaption('katalog', seed, opening.collection.name),
            image: opening.collection.image,
            forwarded: true,
            attribution: 'Kundenzettel · Kollektion',
            seed,
            index: 0,
          }),
        )
      } else if (!isHoopKind(opening.kind)) {
        extras.push(referenceBubble(opening.kind, seed, 1, conversation))
      }
    }
  }

  if (asksAddress) {
    push('Finkenstraße 56, 41749 Viersen')
  }
  if (asksWhen) {
    push(
      pick(
        [
          'Samstag sollte es fertig sein. Nachmittags abholen wäre mir am liebsten.',
          'Am liebsten Samstag, irgendwann am Nachmittag.',
        ],
        `${seed}|when`,
      ),
    )
  }
  if (asksPickup && !asksWhen) {
    push(
      pick(
        [
          'Zwischen 15 und 16 Uhr wäre mir am liebsten.',
          'Am Nachmittag, am besten zwischen 15 und 16 Uhr.',
        ],
        `${seed}|pickup`,
      ),
    )
  }
  if (asksDelivery) {
    push('Ich hole es lieber bei dir ab. Eine Lieferung nach Viersen wäre umständlich.')
  }

  if (amount != null && amount > 0) {
    if (amount <= ANNA_FACTS.budget) {
      push('Das ist sogar besser, als ich dachte. Dann bitte so.')
    } else if (amount <= ANNA_FACTS.budgetStretch) {
      push(
        `Hmm, ${Math.round(amount)} Euro. Wenn du sagst, die Handarbeit steckt darin, vertraue ich dir.`,
      )
    } else {
      push(`${Math.round(amount)} Euro wird für mich knapp. Ginge es eher in Richtung 50?`)
    }
  }

  if (lines.length === 0 && extras.length === 0) {
    // Nie Goldring bekräftigen, wenn er fehlt / Alternative im Raum steht / kein Hoop mehr
    if (
      belief.goldRingMissing ||
      belief.alternativeOffered ||
      !belief.canPursueWish ||
      !isHoopKind(productKind)
    ) {
      if (
        (!isHoopKind(productKind) && belief.canPursueWish && !belief.goldRingMissing) ||
        (belief.acceptedKindByKunde && !isHoopKind(belief.acceptedKindByKunde))
      ) {
        const kind = belief.acceptedKindByKunde ?? productKind
        push(
          pick(
            [
              `Genau, ${labelForKind(kind)}, eher ruhig in Creme und Rosa.`,
              `Ja, beim ${labelForKind(kind)} bleibe ich dabei.`,
              'Passt, so machen wir das.',
            ],
            `${seed}|fallback-cur`,
          ),
        )
      } else {
        push(
          pick(
            [
              'Verstehe. Ein Strauß in ruhigen Farben wäre für mich jetzt auch schön.',
              'Alles klar. Dann zeig mir gern eine Alternative, die du jetzt da hast.',
              'Gerne etwas anderes. Mir wären Creme und etwas Rosa recht, eher locker.',
            ],
            `${seed}|fallback-alt`,
          ),
        )
      }
    } else {
      const soft = pick(
        [
          'Genau, der mit dem Goldring. Pampas eher wenig.',
          'Ja, weiterhin der Blumenhoop mit dem Goldring.',
          'Am liebsten ruhig und eher luftig, mit dem Goldring.',
        ],
        `${seed}|fallback`,
      )
      const lastOwn = lastKundeSpokenText(conversation)
      if (fold(soft) === fold(lastOwn) || (lastOwn.length > 12 && fold(soft).includes(fold(lastOwn).slice(0, 24)))) {
        push('Passt. Sag mir gern, wie du weitermachen möchtest.')
      } else {
        push(soft)
      }
    }
  }

  const uniqueLines = lines.filter((line, i) => lines.indexOf(line) === i).slice(0, 3)
  const textBubbles = uniqueLines.map((line, i) => bubble('text', { text: line, seed, index: i }))
  const extraBubbles = extras.map((item, i) => ({
    ...item,
    gapMs: gapFor(textBubbles.length + i, seed),
  }))
  return { bubbles: [...textBubbles, ...extraBubbles].slice(0, 4) }
}

export async function planAnnaRepliesAsync(
  conversation: Conversation,
  options: AnnaPlanOptions = {},
): Promise<AnnaPlan> {
  if (!isAnnaBotChat(conversation)) return { bubbles: [] }

  const messages = visibleMessages(conversation)
  const now = options.now ?? new Date()
  const seedBase = `${conversation.id}|${messages.length}`

  if (messages.length === 0) {
    const entropy = options.entropy ?? liveEntropy()
    return openerPlan(`${seedBase}|${entropy}`, now)
  }

  const cluster = trailingAtelier(messages)
  const last = cluster[cluster.length - 1]
  if (!last) return { bubbles: [] }

  const text = cluster
    .map((message) => [message.text, message.transcript].filter(Boolean).join(' '))
    .join('\n')
    .trim()
  const salt = String(hashSeed(priorKundeSalt(messages)))
  const seed = `${seedBase}|${last.kind}|${text}|${salt}|${options.entropy ?? ''}`

  if (text && isConversationBoundary(text)) {
    return { bubbles: texts(seed, [pick(DEFER_LINES, `${seed}|bound`)]) }
  }

  const agented = await planAnnaAgentAsync(conversation, { ...options, seed })
  if (agented.plan) return agented.plan

  return planAnnaReplies(conversation, options)
}
