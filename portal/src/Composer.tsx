import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
} from 'react'
import { MARIE_VOICE_NOTE, type Message } from './data'
import {
  formatAttribution,
  referenceQueryForKind,
  searchReferenceImages,
  type ReferenceImage,
} from './referenceImages'
import { labelForKind, OFF_COLLECTION_CHAT_KINDS, type FloristryKind } from './floristryLexicon'

/**
 * `mediaFile` is intentionally transient. The preview can render the local
 * object URL, while the operator app uploads the original file to its private
 * API before it asks WhatsApp to send the message.
 */
export type OutgoingMessage = Omit<Message, 'id' | 'at' | 'from' | 'status'> & {
  mediaFile?: File
}

type ComposerProps = {
  onSend: (message: OutgoingMessage) => void
  onToast?: (msg: string) => void
  focusNonce?: number
  draftSeed?: string | null
  onDraftSeedConsumed?: () => void
  disabled?: boolean
  disabledReason?: string
  /** Operator launch is text-only; the preview retains its local demo media. */
  mediaEnabled?: boolean
}

type SpeechRecCtor = new () => {
  lang: string
  continuous: boolean
  interimResults: boolean
  start: () => void
  stop: () => void
  abort: () => void
  onresult: ((ev: {
    resultIndex: number
    results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }>
  }) => void) | null
  onerror: (() => void) | null
}

function getSpeechRecognition(): SpeechRecCtor | null {
  const w = window as Window & {
    SpeechRecognition?: SpeechRecCtor
    webkitSpeechRecognition?: SpeechRecCtor
  }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

const UNUSABLE_VOICE_FILES = /voice-laura|voice-sophie/i

type AttachKind =
  | 'document'
  | 'media'
  | 'camera'
  | 'audio'
  | 'contact'
  | 'poll'
  | 'event'
  | 'reference'

type EmojiCat = {
  id: string
  label: string
  icon: string
  emojis: string[]
}

const EMOJI_CATS: EmojiCat[] = [
  {
    id: 'smileys',
    label: 'Smileys & Personen',
    icon: '😊',
    emojis: [
      '😀','😃','😄','😁','😆','😅','🤣','😂','🙂','🙃','😉','😊','😇','🥰','😍','🤩',
      '😘','😗','☺️','😚','😙','🥲','😋','😛','😜','🤪','😝','🤑','🤗','🤭','🫢','🫣',
      '🤫','🤔','🫡','🤐','🤨','😐','😑','😶','🫥','😏','😒','🙄','😬','😮‍💨','🤥','😌',
      '😔','😪','🤤','😴','😷','🤒','🤕','🤢','🤮','🥵','🥶','🥴','😵','🤯','🤠','🥳',
      '😎','🤓','🧐','😕','🫤','😟','🙁','☹️','😮','😯','😲','😳','🥺','🥹','😦','😧',
      '😨','😰','😥','😢','😭','😱','😖','😣','😞','😓','😩','😫','🥱','😤','😡','😠',
      '🤬','😈','👿','💀','☠️','💩','🤡','👹','👺','👻','👽','👾','🤖','😺','😸','😹',
      '😻','😼','😽','🙀','😿','😾','👋','🤚','🖐️','✋','🖖','🫱','🫲','👌','🤌','🤏',
      '✌️','🤞','🫰','🤟','🤘','🤙','👈','👉','👆','🖕','👇','☝️','🫵','👍','👎','✊',
      '👊','🤛','🤜','👏','🙌','🫶','👐','🤲','🤝','🙏','✍️','💅','🤳','💪','🦾','🦵',
    ],
  },
  {
    id: 'animals',
    label: 'Tiere & Natur',
    icon: '🐻',
    emojis: [
      '🐶','🐱','🐭','🐹','🐰','🦊','🐻','🐼','🐻‍❄️','🐨','🐯','🦁','🐮','🐷','🐸','🐵',
      '🙈','🙉','🙊','🐒','🐔','🐧','🐦','🐤','🐣','🐥','🦆','🦅','🦉','🦇','🐺','🐗',
      '🐴','🦄','🐝','🪱','🐛','🦋','🐌','🐞','🐜','🪰','🪲','🪳','🦟','🦗','🕷️','🦂',
      '🐢','🐍','🦎','🦖','🦕','🐙','🦑','🦐','🦞','🦀','🐡','🐠','🐟','🐬','🐳','🐋',
      '🦈','🐊','🐅','🐆','🦓','🦍','🦧','🦣','🐘','🦛','🦏','🐪','🐫','🦒','🦘','🦬',
      '🐃','🐂','🐄','🐎','🐖','🐏','🐑','🦙','🐐','🦌','🐕','🐩','🦮','🐕‍🦺','🐈','🐈‍⬛',
      '🪶','🪽','🐓','🦃','🦤','🦚','🦜','🦢','🦩','🕊️','🐇','🦝','🦨','🦡','🦫','🦦',
      '🦥','🐁','🐀','🐿️','🦔','🌲','🌳','🌴','🌵','🌶️','🌾','🌿','☘️','🍀','🍃','🍂',
      '🍁','🍄','🐚','🪸','🪨','🌎','🌍','🌏','🌐','🌑','🌒','🌓','🌔','🌕','🌖','🌗',
    ],
  },
  {
    id: 'food',
    label: 'Essen & Trinken',
    icon: '🍔',
    emojis: [
      '🍎','🍐','🍊','🍋','🍌','🍉','🍇','🍓','🫐','🍈','🍒','🍑','🥭','🍍','🥥','🥝',
      '🍅','🍆','🥑','🥦','🥬','🥒','🌶️','🫑','🌽','🥕','🫒','🧄','🧅','🥔','🍠','🥐',
      '🥯','🍞','🥖','🥨','🧀','🥚','🍳','🧈','🥞','🧇','🥓','🥩','🍗','🍖','🦴','🌭',
      '🍔','🍟','🍕','🫓','🥪','🥙','🧆','🌮','🌯','🫔','🥗','🥘','🫕','🥫','🍝','🍜',
      '🍲','🍛','🍣','🍱','🥟','🦪','🍤','🍙','🍚','🍘','🍥','🥠','🥮','🍢','🍡','🍧',
      '🍨','🍦','🥧','🧁','🍰','🎂','🍮','🍭','🍬','🍫','🍿','🍩','🍪','🌰','🥜','🍯',
      '🥛','🍼','☕','🫖','🍵','🧃','🥤','🧋','🍶','🍺','🍻','🥂','🍷','🥃','🍸','🍹',
    ],
  },
  {
    id: 'activity',
    label: 'Aktivitäten',
    icon: '⚽',
    emojis: [
      '⚽','🏀','🏈','⚾','🥎','🎾','🏐','🏉','🥏','🎱','🪀','🏓','🏸','🏒','🏑','🥍',
      '🏏','🪃','🥅','⛳','🪁','🛝','🏹','🎣','🤿','🥊','🥋','🎽','🛹','🛼','🛷','⛸️',
      '🥌','🎿','⛷️','🏂','🪂','🏋️','🤼','🤸','⛹️','🤺','🤾','🏌️','🏇','🧘','🏄','🏊',
      '🤽','🚣','🧗','🚴','🚵','🎪','🎭','🩰','🎨','🎬','🎤','🎧','🎼','🎹','🥁','🪘',
      '🎷','🎺','🪗','🎸','🪕','🎻','🎲','♟️','🎯','🎳','🎮','🎰','🧩',
    ],
  },
  {
    id: 'travel',
    label: 'Reisen & Orte',
    icon: '✈️',
    emojis: [
      '🚗','🚕','🚙','🚌','🚎','🏎️','🚓','🚑','🚒','🚐','🛻','🚚','🚛','🚜','🦯','🦽',
      '🦼','🛴','🚲','🛵','🏍️','🛺','🚨','🚔','🚍','🚘','🚖','🚡','🚠','🚟','🚃','🚋',
      '🚞','🚝','🚄','🚅','🚈','🚂','🚆','🚇','🚊','🚉','✈️','🛫','🛬','🛩️','💺','🛰️',
      '🚀','🛸','🚁','🛶','⛵','🚤','🛥️','🛳️','⛴️','🚢','⚓','🪝','⛽','🚧','🚦','🚥',
      '🚏','🗺️','🗿','🗽','🗼','🏰','🏯','🏟️','🎡','🎢','🎠','⛲','⛱️','🏖️','🏝️','🏜️',
      '🌋','⛰️','🏔️','🗻','🏕️','⛺','🛖','🏠','🏡','🏢','🏣','🏤','🏥','🏦','🏨','🏩',
      '🏪','🏫','🏬','🏭','🏯','💒','⛪','🕌','🕍','🛕','🕋','⛩️','🛤️','🛣️','🗾','🎑',
    ],
  },
  {
    id: 'objects',
    label: 'Objekte',
    icon: '💡',
    emojis: [
      '⌚','📱','📲','💻','⌨️','🖥️','🖨️','🖱️','🖲️','🕹️','🗜️','💽','💾','💿','📀','📼',
      '📷','📸','📹','🎥','📽️','🎞️','📞','☎️','📟','📠','📺','📻','🎙️','🎚️','🎛️','🧭',
      '⏱️','⏲️','⏰','🕰️','⌛','⏳','📡','🔋','🔌','💡','🔦','🕯️','🪔','🧯','🛢️','💸',
      '💵','💴','💶','💷','🪙','💰','💳','💎','⚖️','🪜','🧰','🪛','🔧','🔨','⚒️','🛠️',
      '⛏️','🪚','🔩','⚙️','🪤','🧱','⛓️','🧲','🔫','💣','🧨','🪓','🔪','🗡️','⚔️','🛡️',
      '🚬','⚰️','🪦','⚱️','🏺','🔮','📿','🧿','💈','⚗️','🔭','🔬','🕳️','🩹','🩺','💊',
      '💉','🩸','🧬','🦠','🧫','🧪','🌡️','🧹','🪠','🧺','🧻','🚽','🚰','🚿','🛁','🛀',
      '🧼','🪥','🪒','🧽','🪣','🧴','🛎️','🔑','🗝️','🚪','🪑','🛋️','🛏️','🛌','🧸','🖼️',
    ],
  },
  {
    id: 'symbols',
    label: 'Symbole',
    icon: '❤️',
    emojis: [
      '❤️','🧡','💛','💚','💙','💜','🖤','🤍','🤎','💔','❣️','💕','💞','💓','💗','💖',
      '💘','💝','💟','☮️','✝️','☪️','🕉️','☸️','✡️','🔯','🕎','☯️','☦️','🛐','⛎','♈',
      '♉','♊','♋','♌','♍','♎','♏','♐','♑','♒','♓','🆔','⚛️','🉑','☢️','☣️',
      '📴','📳','🈶','🈚','🈸','🈺','🈷️','✴️','🆚','💮','🉐','㊙️','㊗️','🈴','🈵','🈹',
      '🈲','🅰️','🅱️','🆎','🆑','🅾️','🆘','❌','⭕','🛑','⛔','📛','🚫','💯','💢','♨️',
      '🚷','🚯','🚳','🚱','🔞','📵','🚭','❗','❕','❓','❔','‼️','⁉️','🔅','🔆','〽️',
      '⚠️','🚸','🔱','⚜️','🔰','♻️','✅','🈯','💹','❇️','✳️','❎','🌐','💠','Ⓜ️','🌀',
      '💤','🏧','🚾','♿','🅿️','🛗','🛂','🛃','🛄','🛅','♂️','♀️','⚧️','✖️','➕','➖',
      '➗','♾️','‼️','⁉️','❓','❔','❗','❕','〰','💱','💲','⚕️','♻️','⚜️','🔱','📛',
    ],
  },
  {
    id: 'flags',
    label: 'Flaggen',
    icon: '🏁',
    emojis: [
      '🏳️','🏴','🏁','🚩','🏳️‍🌈','🏳️‍⚧️','🇺🇳','🇩🇪','🇦🇹','🇨🇭','🇫🇷','🇮🇹','🇪🇸','🇵🇹','🇬🇧','🇺🇸',
      '🇨🇦','🇲🇽','🇧🇷','🇦🇷','🇨🇱','🇯🇵','🇨🇳','🇰🇷','🇮🇳','🇦🇺','🇳🇿','🇿🇦','🇪🇬','🇹🇷','🇬🇷','🇳🇱',
      '🇧🇪','🇸🇪','🇳🇴','🇩🇰','🇫🇮','🇵🇱','🇨🇿','🇭🇺','🇷🇴','🇺🇦','🇷🇺','🇮🇱','🇸🇦','🇦🇪','🇹🇭','🇻🇳',
    ],
  },
]

const ATTACH_ITEMS: {
  kind: AttachKind
  label: string
  color: string
  icon: 'doc' | 'photo' | 'camera' | 'audio' | 'contact' | 'poll' | 'event' | 'reference'
}[] = [
  { kind: 'document', label: 'Dokument', color: '#7f66ff', icon: 'doc' },
  { kind: 'media', label: 'Fotos & Videos', color: '#007bfc', icon: 'photo' },
  { kind: 'reference', label: 'Freie Referenz', color: '#128c7e', icon: 'reference' },
  { kind: 'camera', label: 'Kamera', color: '#ff2e74', icon: 'camera' },
  { kind: 'audio', label: 'Audio', color: '#ff7b29', icon: 'audio' },
  { kind: 'contact', label: 'Kontakt', color: '#0fa8ff', icon: 'contact' },
  { kind: 'poll', label: 'Abstimmung', color: '#ffb300', icon: 'poll' },
  { kind: 'event', label: 'Ereignis', color: '#f15c6d', icon: 'event' },
]

function formatDuration(totalSec: number) {
  const m = Math.floor(totalSec / 60)
  const s = Math.floor(totalSec % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

function AttachIcon({ name }: { name: (typeof ATTACH_ITEMS)[number]['icon'] }) {
  const common = { viewBox: '0 0 24 24', width: 20, height: 20, fill: 'currentColor' as const }
  switch (name) {
    case 'doc':
      return (
        <svg {...common} aria-hidden>
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm1 7V3.5L19.5 9H15zM8 13h8v2H8v-2zm0 4h8v2H8v-2zm0-8h5v2H8V9z" />
        </svg>
      )
    case 'photo':
      return (
        <svg {...common} aria-hidden>
          <path d="M21 19V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z" />
        </svg>
      )
    case 'camera':
      return (
        <svg {...common} aria-hidden>
          <path d="M12 15.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4zM9 3 7.2 5H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-3.2L15 3H9z" />
        </svg>
      )
    case 'audio':
      return (
        <svg {...common} aria-hidden>
          <path d="M12 3a4 4 0 0 0-4 4v5a4 4 0 0 0 8 0V7a4 4 0 0 0-4-4zm-7 8a1 1 0 0 1 2 0 5 5 0 0 0 10 0 1 1 0 1 1 2 0 7 7 0 0 1-6 6.9V21h4a1 1 0 1 1 0 2H9a1 1 0 1 1 0-2h4v-3.1A7 7 0 0 1 5 11z" />
        </svg>
      )
    case 'contact':
      return (
        <svg {...common} aria-hidden>
          <path d="M12 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4zm0 2c-4.4 0-8 2.2-8 5v1h16v-1c0-2.8-3.6-5-8-5z" />
        </svg>
      )
    case 'poll':
      return (
        <svg {...common} aria-hidden>
          <path d="M4 17h4v-6H4v6zm6 0h4V7h-4v10zm6 0h4v-3h-4v3z" />
        </svg>
      )
    case 'event':
      return (
        <svg {...common} aria-hidden>
          <path d="M19 4h-1V2h-2v2H8V2H6v2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2zm0 16H5V10h14v10zm0-12H5V6h14v2z" />
        </svg>
      )
    case 'reference':
      return (
        <svg {...common} aria-hidden>
          <path d="M15.5 14h-.79l-.28-.27A6.5 6.5 0 1 0 14 15.5l.27.28v.79L20 21.5 21.5 20l-6-6zm-6 0A4.5 4.5 0 1 1 14 9.5 4.5 4.5 0 0 1 9.5 14z" />
        </svg>
      )
  }
}

export function Composer({
  onSend,
  onToast,
  focusNonce = 0,
  draftSeed = null,
  onDraftSeedConsumed,
  disabled = false,
  disabledReason,
  mediaEnabled = true,
}: ComposerProps) {
  const [draft, setDraft] = useState('')
  const [attachOpen, setAttachOpen] = useState(false)
  const [emojiOpen, setEmojiOpen] = useState(false)
  const [emojiCat, setEmojiCat] = useState(EMOJI_CATS[0].id)
  const [emojiQuery, setEmojiQuery] = useState('')
  const [dialog, setDialog] = useState<null | 'poll' | 'event' | 'contact' | 'reference'>(null)
  const [pollQ, setPollQ] = useState('')
  const [pollA, setPollA] = useState('')
  const [pollB, setPollB] = useState('')
  const [eventTitle, setEventTitle] = useState('')
  const [eventWhen, setEventWhen] = useState('')
  const [contactName, setContactName] = useState('Kundenzettel Atelier')
  const [contactPhone, setContactPhone] = useState('+49 170 0000000')
  const [refKind, setRefKind] = useState<FloristryKind>('wandkranz')
  const [refQuery, setRefQuery] = useState(referenceQueryForKind('wandkranz'))
  const [refLoading, setRefLoading] = useState(false)
  const [refHits, setRefHits] = useState<ReferenceImage[]>([])
  const [refError, setRefError] = useState('')

  const [recording, setRecording] = useState(false)
  const [recPaused, setRecPaused] = useState(false)
  const [recSeconds, setRecSeconds] = useState(0)
  const [viewOnce, setViewOnce] = useState(false)
  const [liveTranscript, setLiveTranscript] = useState('')
  const [wave, setWave] = useState<number[]>(() => Array.from({ length: 36 }, () => 4))

  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const docInputRef = useRef<HTMLInputElement>(null)
  const mediaInputRef = useRef<HTMLInputElement>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)
  const audioInputRef = useRef<HTMLInputElement>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const streamRef = useRef<MediaStream | null>(null)
  const timerRef = useRef<number | null>(null)
  const waveRef = useRef<number | null>(null)
  const speechRef = useRef<InstanceType<SpeechRecCtor> | null>(null)
  const liveTranscriptRef = useRef('')

  const hasText = draft.trim().length > 0

  const emojiGrid = useMemo(() => {
    const q = emojiQuery.trim()
    if (q) {
      const all = EMOJI_CATS.flatMap((c) => c.emojis)
      const labeled = EMOJI_CATS.filter(
        (c) =>
          c.label.toLowerCase().includes(q.toLowerCase()) ||
          c.id.includes(q.toLowerCase()),
      ).flatMap((c) => c.emojis)
      if (labeled.length) return labeled
      return all.filter((e) => e.includes(q)).slice(0, 160)
    }
    return EMOJI_CATS.find((c) => c.id === emojiCat)?.emojis ?? EMOJI_CATS[0].emojis
  }, [emojiCat, emojiQuery])

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) {
        setAttachOpen(false)
        setEmojiOpen(false)
      }
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`
    el.style.overflowY = el.scrollHeight > 120 ? 'auto' : 'hidden'
  }, [draft])

  useEffect(() => {
    if (!draftSeed) return
    setDraft(draftSeed)
    onDraftSeedConsumed?.()
    requestAnimationFrame(() => textareaRef.current?.focus())
  }, [draftSeed, onDraftSeedConsumed])

  useEffect(() => {
    if (!focusNonce) return
    requestAnimationFrame(() => textareaRef.current?.focus())
  }, [focusNonce])

  useEffect(() => {
    return () => {
      stopTimers()
      cleanupStream()
    }
  }, [])

  function stopTimers() {
    if (timerRef.current != null) {
      window.clearInterval(timerRef.current)
      timerRef.current = null
    }
    if (waveRef.current != null) {
      window.clearInterval(waveRef.current)
      waveRef.current = null
    }
  }

  function cleanupStream() {
    stopSpeechRecognition()
    mediaRecorderRef.current = null
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    chunksRef.current = []
  }

  function stopSpeechRecognition() {
    const rec = speechRef.current
    speechRef.current = null
    if (!rec) return
    rec.onresult = null
    rec.onerror = null
    try {
      rec.stop()
    } catch {
      try {
        rec.abort()
      } catch {
        /* ignore */
      }
    }
  }

  function startSpeechRecognition() {
    stopSpeechRecognition()
    const Ctor = getSpeechRecognition()
    if (!Ctor) return
    const rec = new Ctor()
    rec.lang = 'de-DE'
    rec.continuous = true
    rec.interimResults = true
    rec.onresult = (ev) => {
      let finalText = ''
      let interim = ''
      for (let i = 0; i < ev.results.length; i += 1) {
        const piece = ev.results[i]
        const t = piece[0]?.transcript ?? ''
        if (piece.isFinal) finalText += t
        else interim += t
      }
      const shown = `${finalText} ${interim}`.replace(/\s+/g, ' ').trim()
      liveTranscriptRef.current = shown
      setLiveTranscript(shown)
    }
    rec.onerror = () => {
      /* Transkript bleibt, soweit schon erkannt */
    }
    try {
      rec.start()
      speechRef.current = rec
    } catch {
      speechRef.current = null
    }
  }

  function insertEmoji(emoji: string) {
    const el = textareaRef.current
    if (!el) {
      setDraft((d) => d + emoji)
      return
    }
    const start = el.selectionStart ?? draft.length
    const end = el.selectionEnd ?? draft.length
    const next = draft.slice(0, start) + emoji + draft.slice(end)
    setDraft(next)
    requestAnimationFrame(() => {
      el.focus()
      const pos = start + emoji.length
      el.setSelectionRange(pos, pos)
    })
  }

  function sendText() {
    if (disabled) return
    const content = draft.trim()
    if (!content) return
    onSend({ kind: 'text', text: content })
    setDraft('')
    setEmojiOpen(false)
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendText()
    }
  }

  function openAttach(kind: AttachKind) {
    if (!mediaEnabled) {
      onToast?.('Medienversand wird nach der stabilen Textphase freigeschaltet.')
      return
    }
    setAttachOpen(false)
    if (kind === 'document') docInputRef.current?.click()
    else if (kind === 'media') mediaInputRef.current?.click()
    else if (kind === 'camera') cameraInputRef.current?.click()
    else if (kind === 'audio') audioInputRef.current?.click()
    else if (kind === 'contact') setDialog('contact')
    else if (kind === 'poll') setDialog('poll')
    else if (kind === 'event') setDialog('event')
    else if (kind === 'reference') {
      setRefError('')
      setRefHits([])
      setRefKind('wandkranz')
      setRefQuery(referenceQueryForKind('wandkranz'))
      setDialog('reference')
    }
  }

  async function runReferenceSearch() {
    if (disabled) return
    const q = refQuery.trim()
    if (!q) return
    setRefLoading(true)
    setRefError('')
    try {
      const hits = await searchReferenceImages(q, { limit: 8 })
      setRefHits(hits)
      if (!hits.length) setRefError('Keine freien Bilder gefunden. Anderen Suchbegriff versuchen.')
    } catch {
      setRefError('Suche gerade nicht erreichbar.')
      setRefHits([])
    } finally {
      setRefLoading(false)
    }
  }

  function sendReference(hit: ReferenceImage) {
    if (disabled) return
    onSend({
      kind: 'image',
      image: hit.thumbUrl || hit.url,
      text: hit.title,
      attribution: formatAttribution(hit),
      forwarded: true,
    })
    setDialog(null)
    setRefHits([])
  }

  function handleFiles(kind: 'document' | 'media' | 'camera' | 'audio', files: FileList | null) {
    if (disabled || !mediaEnabled || !files?.length) return
    Array.from(files).forEach((file) => {
      const url = URL.createObjectURL(file)
      if (kind === 'document') {
        onSend({
          kind: 'document',
          documentName: file.name,
          text: `${Math.max(1, Math.round(file.size / 1024))} KB`,
          fileUrl: url,
          mediaFile: file,
        })
        return
      }
      if (kind === 'audio' || file.type.startsWith('audio/')) {
        if (UNUSABLE_VOICE_FILES.test(file.name)) {
          onToast?.(
            'Diese WAV-Datei enthält keine verständliche natürliche Sprache.',
          )
          return
        }
        const isMarieDemo = /WhatsApp_Sprachnachricht/i.test(file.name)
        onSend({
          kind: 'voice',
          audio: isMarieDemo ? MARIE_VOICE_NOTE.audio : url,
          duration: isMarieDemo ? MARIE_VOICE_NOTE.duration : '0:00',
          transcript: isMarieDemo ? MARIE_VOICE_NOTE.transcript : undefined,
          mediaFile: file,
        })
        return
      }
      if (file.type.startsWith('video/')) {
        onSend({
          kind: 'video',
          video: url,
          text: file.name,
          duration: '0:00',
          mediaFile: file,
        })
        return
      }
      onSend({
        kind: 'image',
        image: url,
        text: kind === 'camera' ? 'Foto' : undefined,
        mediaFile: file,
      })
    })
  }

  function submitPoll() {
    if (disabled || !pollQ.trim() || !pollA.trim() || !pollB.trim()) return
    onSend({
      kind: 'text',
      text: `📊 Abstimmung: ${pollQ.trim()}\n• ${pollA.trim()}\n• ${pollB.trim()}`,
    })
    setPollQ('')
    setPollA('')
    setPollB('')
    setDialog(null)
    onToast?.('Abstimmung gesendet')
  }

  function submitEvent() {
    if (disabled || !eventTitle.trim()) return
    onSend({
      kind: 'text',
      text: `📅 Ereignis: ${eventTitle.trim()}${eventWhen.trim() ? `\n🕐 ${eventWhen.trim()}` : ''}`,
    })
    setEventTitle('')
    setEventWhen('')
    setDialog(null)
  }

  function submitContact() {
    if (disabled || !contactName.trim()) return
    onSend({
      kind: 'text',
      text: `👤 Kontakt\n${contactName.trim()}${contactPhone.trim() ? `\n${contactPhone.trim()}` : ''}`,
    })
    setDialog(null)
  }

  async function startRecording() {
    if (disabled || !mediaEnabled) {
      if (!disabled) onToast?.('Medienversand wird nach der stabilen Textphase freigeschaltet.')
      return
    }
    setAttachOpen(false)
    setEmojiOpen(false)
    setRecPaused(false)
    setRecSeconds(0)
    setViewOnce(false)
    setLiveTranscript('')
    liveTranscriptRef.current = ''
    chunksRef.current = []

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      const recorder = new MediaRecorder(stream)
      mediaRecorderRef.current = recorder
      recorder.ondataavailable = (ev) => {
        if (ev.data.size > 0) chunksRef.current.push(ev.data)
      }
      recorder.start(200)
      setRecording(true)
      startSpeechRecognition()
      timerRef.current = window.setInterval(() => {
        setRecSeconds((s) => s + 1)
      }, 1000)
      waveRef.current = window.setInterval(() => {
        setWave(Array.from({ length: 36 }, () => 3 + Math.random() * 14))
      }, 120)
    } catch {
      // Demo-Fallback ohne Mikrofonzugriff: geprüfte natürliche Aufnahme + Transkript
      setRecording(true)
      setLiveTranscript(MARIE_VOICE_NOTE.transcript)
      liveTranscriptRef.current = MARIE_VOICE_NOTE.transcript
      timerRef.current = window.setInterval(() => {
        setRecSeconds((s) => s + 1)
      }, 1000)
      waveRef.current = window.setInterval(() => {
        setWave(Array.from({ length: 36 }, () => 3 + Math.random() * 14))
      }, 120)
      onToast?.('Demo-Aufnahme (ohne Mikrofon)')
    }
  }

  function pauseRecording() {
    const rec = mediaRecorderRef.current
    if (rec && rec.state === 'recording') {
      rec.pause()
      setRecPaused(true)
      stopSpeechRecognition()
      stopTimers()
      return
    }
    if (recPaused) {
      if (rec && rec.state === 'paused') rec.resume()
      setRecPaused(false)
      startSpeechRecognition()
      timerRef.current = window.setInterval(() => {
        setRecSeconds((s) => s + 1)
      }, 1000)
      waveRef.current = window.setInterval(() => {
        setWave(Array.from({ length: 36 }, () => 3 + Math.random() * 14))
      }, 120)
      return
    }
    setRecPaused(true)
    stopTimers()
  }

  function cancelRecording() {
    const rec = mediaRecorderRef.current
    if (rec && rec.state !== 'inactive') {
      try {
        rec.stop()
      } catch {
        /* ignore */
      }
    }
    stopTimers()
    cleanupStream()
    setRecording(false)
    setRecPaused(false)
    setRecSeconds(0)
    setLiveTranscript('')
    liveTranscriptRef.current = ''
  }

  function sendRecording() {
    const rec = mediaRecorderRef.current
    const spoken = liveTranscriptRef.current.trim()
    const finish = (audioUrl: string, transcript: string, mediaFile?: File) => {
      onSend({
        kind: 'voice',
        audio: audioUrl,
        duration: formatDuration(recSeconds || 1),
        transcript: transcript || undefined,
        mediaFile,
      })
      stopTimers()
      cleanupStream()
      setRecording(false)
      setRecPaused(false)
      setRecSeconds(0)
      setViewOnce(false)
      setLiveTranscript('')
      liveTranscriptRef.current = ''
    }

    if (rec && rec.state !== 'inactive') {
      rec.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: rec.mimeType || 'audio/webm' })
        const file = new File(
          [blob],
          `Sprachnachricht-${Date.now()}.webm`,
          { type: blob.type || 'audio/webm' },
        )
        finish(URL.createObjectURL(blob), spoken, file)
      }
      try {
        rec.stop()
      } catch {
        finish(MARIE_VOICE_NOTE.audio, MARIE_VOICE_NOTE.transcript)
      }
      return
    }
    finish(MARIE_VOICE_NOTE.audio, spoken || MARIE_VOICE_NOTE.transcript)
  }

  const activeCat = EMOJI_CATS.find((c) => c.id === emojiCat) ?? EMOJI_CATS[0]

  return (
    <div className={`composer${disabled ? ' is-disabled' : ''}`} ref={rootRef}>
      {disabled && (
        <div className="composer-disabled" role="status">
          {disabledReason || 'Chat nicht verfügbar'}
        </div>
      )}
      <input
        ref={docInputRef}
        type="file"
        hidden
        accept=".pdf,.doc,.docx,.xls,.xlsx,.txt,.zip,application/*"
        onChange={(e: ChangeEvent<HTMLInputElement>) => {
          handleFiles('document', e.target.files)
          e.target.value = ''
        }}
      />
      <input
        ref={mediaInputRef}
        type="file"
        hidden
        accept="image/*,video/*"
        multiple
        onChange={(e) => {
          handleFiles('media', e.target.files)
          e.target.value = ''
        }}
      />
      <input
        ref={cameraInputRef}
        type="file"
        hidden
        accept="image/*"
        capture="environment"
        onChange={(e) => {
          handleFiles('camera', e.target.files)
          e.target.value = ''
        }}
      />
      <input
        ref={audioInputRef}
        type="file"
        hidden
        accept="audio/*"
        onChange={(e) => {
          handleFiles('audio', e.target.files)
          e.target.value = ''
        }}
      />

      {recording ? (
        <div className="composer-record-wrap">
        <div className="composer-record" role="group" aria-label="Sprachnachricht aufnehmen">
          <button
            type="button"
            className="composer-rec-btn"
            aria-label="Aufnahme verwerfen"
            title="Löschen"
            onClick={cancelRecording}
          >
            <svg viewBox="0 0 24 24" aria-hidden>
              <path
                fill="currentColor"
                d="M6 19a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"
              />
            </svg>
          </button>

          <div className="composer-rec-meter">
            <span className={`composer-rec-dot${recPaused ? '' : ' is-live'}`} />
            <span className="composer-rec-time">{formatDuration(recSeconds)}</span>
            <div className="composer-rec-wave" aria-hidden>
              {wave.map((h, i) => (
                <span key={i} style={{ height: `${h}px` }} />
              ))}
            </div>
          </div>

          <button
            type="button"
            className="composer-rec-btn is-accent"
            aria-label={recPaused ? 'Aufnahme fortsetzen' : 'Aufnahme pausieren'}
            title={recPaused ? 'Fortsetzen' : 'Pause'}
            onClick={pauseRecording}
          >
            {recPaused ? (
              <svg viewBox="0 0 24 24" aria-hidden>
                <path fill="currentColor" d="M8 5v14l11-7L8 5z" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" aria-hidden>
                <path fill="currentColor" d="M6 5h4v14H6V5zm8 0h4v14h-4V5z" />
              </svg>
            )}
          </button>

          <button
            type="button"
            className={`composer-rec-btn${viewOnce ? ' is-on' : ''}`}
            aria-label="Nur einmal anzeigen"
            title="Nur einmal anzeigen"
            aria-pressed={viewOnce}
            onClick={() => setViewOnce((v) => !v)}
          >
            <svg viewBox="0 0 24 24" aria-hidden>
              <circle
                cx="12"
                cy="12"
                r="9"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeDasharray="3.2 2.4"
              />
              <text
                x="12"
                y="16"
                textAnchor="middle"
                fontSize="11"
                fontWeight="700"
                fill="currentColor"
                fontFamily="system-ui, sans-serif"
              >
                1
              </text>
            </svg>
          </button>

          <button
            type="button"
            className="composer-send"
            aria-label="Sprachnachricht senden"
            title="Senden"
            onClick={sendRecording}
          >
            <svg viewBox="0 0 24 24" aria-hidden>
              <path fill="currentColor" d="M3.4 11.6 20.5 3.2 12.8 21l-2-7.2-7.4-2.2z" />
            </svg>
          </button>
        </div>
        <p className="composer-rec-transcript">
          {liveTranscript ||
            'Transkript erscheint beim Sprechen …'}
        </p>
        </div>
      ) : (
        <>
          <div className="composer-plus-wrap">
            <button
              type="button"
              className={`composer-icon${attachOpen ? ' is-on' : ''}`}
              aria-label="Anhang"
              aria-expanded={attachOpen}
              title={mediaEnabled ? 'Anhang' : 'Medienversand folgt nach der Textphase'}
              disabled={!mediaEnabled}
              onClick={() => {
                setEmojiOpen(false)
                setAttachOpen((o) => !o)
              }}
            >
              <svg viewBox="0 0 24 24" aria-hidden>
                <path
                  fill="currentColor"
                  d="M12 4a1 1 0 0 1 1 1v6h6a1 1 0 1 1 0 2h-6v6a1 1 0 1 1-2 0v-6H5a1 1 0 1 1 0-2h6V5a1 1 0 0 1 1-1z"
                />
              </svg>
            </button>

            {attachOpen && (
              <div className="composer-attach-menu" role="menu">
                {ATTACH_ITEMS.map((item) => (
                  <button
                    key={item.kind}
                    type="button"
                    role="menuitem"
                    className="composer-attach-item"
                    onClick={() => openAttach(item.kind)}
                  >
                    <span className="composer-attach-ico" style={{ background: item.color }}>
                      <AttachIcon name={item.icon} />
                    </span>
                    {item.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="composer-pill">
            <button
              type="button"
              className={`composer-icon is-inline${emojiOpen ? ' is-on' : ''}`}
              aria-label="Emoji"
              aria-expanded={emojiOpen}
              title="Emoji"
              onClick={() => {
                setAttachOpen(false)
                setEmojiOpen((o) => !o)
              }}
            >
              <svg viewBox="0 0 24 24" aria-hidden>
                <path
                  fill="currentColor"
                  d="M12 2a10 10 0 1 0 .001 20.001A10 10 0 0 0 12 2zm-3.5 8.25a1.25 1.25 0 1 1 0-2.5 1.25 1.25 0 0 1 0 2.5zm7 0a1.25 1.25 0 1 1 0-2.5 1.25 1.25 0 0 1 0 2.5zM12 17.5c-2.3 0-4.2-1.35-5-3.25h10c-.8 1.9-2.7 3.25-5 3.25z"
                />
              </svg>
            </button>

            <textarea
              ref={textareaRef}
              className={draft ? 'has-text' : 'is-empty'}
              rows={1}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Gib eine Nachricht ein"
              aria-label="Nachricht"
            />
          </div>

          {hasText ? (
            <button
              type="button"
              className="composer-send"
              aria-label="Senden"
              title="Senden"
              onClick={sendText}
            >
              <svg viewBox="0 0 24 24" aria-hidden>
                <path fill="currentColor" d="M3.4 11.6 20.5 3.2 12.8 21l-2-7.2-7.4-2.2z" />
              </svg>
            </button>
          ) : (
            <button
              type="button"
              className="composer-mic"
              aria-label="Sprachnachricht"
              title={mediaEnabled ? 'Sprachnachricht' : 'Medienversand folgt nach der Textphase'}
              disabled={!mediaEnabled}
              onClick={() => void startRecording()}
            >
              <svg viewBox="0 0 24 24" aria-hidden>
                <path
                  fill="currentColor"
                  d="M12 14a3 3 0 0 0 3-3V6a3 3 0 1 0-6 0v5a3 3 0 0 0 3 3zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.9V21h2v-3.1A7 7 0 0 0 19 11h-2z"
                />
              </svg>
            </button>
          )}

          {emojiOpen && (
            <div className="composer-emoji" role="dialog" aria-label="Emoji">
              <div className="composer-emoji-cats" role="tablist">
                {EMOJI_CATS.map((cat) => (
                  <button
                    key={cat.id}
                    type="button"
                    role="tab"
                    aria-selected={emojiCat === cat.id}
                    className={`composer-emoji-cat${emojiCat === cat.id ? ' is-on' : ''}`}
                    title={cat.label}
                    onClick={() => {
                      setEmojiCat(cat.id)
                      setEmojiQuery('')
                    }}
                  >
                    {cat.icon}
                  </button>
                ))}
              </div>
              <div className="composer-emoji-search">
                <svg viewBox="0 0 24 24" aria-hidden>
                  <circle cx="11" cy="11" r="6.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
                  <path d="m16.2 16.2 3.3 3.3" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                </svg>
                <input
                  type="search"
                  value={emojiQuery}
                  onChange={(e) => setEmojiQuery(e.target.value)}
                  placeholder="Emoji suchen"
                  aria-label="Emoji suchen"
                />
              </div>
              <div className="composer-emoji-label">
                {emojiQuery.trim() ? 'Ergebnisse' : activeCat.label}
              </div>
              <div className="composer-emoji-grid">
                {emojiGrid.map((emoji, i) => (
                  <button
                    key={`${emoji}-${i}`}
                    type="button"
                    className="composer-emoji-btn"
                    onClick={() => insertEmoji(emoji)}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {dialog && (
        <div className="composer-dialog" role="dialog" aria-modal="true">
          <div className="composer-dialog-card">
            {dialog === 'poll' && (
              <>
                <h3>Abstimmung</h3>
                <label>
                  Frage
                  <input value={pollQ} onChange={(e) => setPollQ(e.target.value)} placeholder="Frage stellen" />
                </label>
                <label>
                  Option 1
                  <input value={pollA} onChange={(e) => setPollA(e.target.value)} />
                </label>
                <label>
                  Option 2
                  <input value={pollB} onChange={(e) => setPollB(e.target.value)} />
                </label>
                <div className="composer-dialog-actions">
                  <button type="button" onClick={() => setDialog(null)}>
                    Abbrechen
                  </button>
                  <button type="button" className="is-primary" onClick={submitPoll}>
                    Senden
                  </button>
                </div>
              </>
            )}
            {dialog === 'event' && (
              <>
                <h3>Ereignis</h3>
                <label>
                  Titel
                  <input value={eventTitle} onChange={(e) => setEventTitle(e.target.value)} placeholder="Ereignis" />
                </label>
                <label>
                  Zeitpunkt
                  <input value={eventWhen} onChange={(e) => setEventWhen(e.target.value)} placeholder="z. B. Mi 14:00" />
                </label>
                <div className="composer-dialog-actions">
                  <button type="button" onClick={() => setDialog(null)}>
                    Abbrechen
                  </button>
                  <button type="button" className="is-primary" onClick={submitEvent}>
                    Senden
                  </button>
                </div>
              </>
            )}
            {dialog === 'contact' && (
              <>
                <h3>Kontakt</h3>
                <label>
                  Name
                  <input value={contactName} onChange={(e) => setContactName(e.target.value)} />
                </label>
                <label>
                  Telefon
                  <input value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} />
                </label>
                <div className="composer-dialog-actions">
                  <button type="button" onClick={() => setDialog(null)}>
                    Abbrechen
                  </button>
                  <button type="button" className="is-primary" onClick={submitContact}>
                    Senden
                  </button>
                </div>
              </>
            )}
            {dialog === 'reference' && (
              <>
                <h3>Freie Referenz</h3>
                <p className="composer-dialog-hint">
                  Openverse &amp; Wikimedia Commons — nur Lizenzen ohne NC. Attribution wird mitgesendet.
                </p>
                <div className="ref-kind-row">
                  {(['blumenhoop', ...OFF_COLLECTION_CHAT_KINDS] as FloristryKind[]).map((kind) => (
                    <button
                      key={kind}
                      type="button"
                      className={`ref-kind-chip${refKind === kind ? ' is-on' : ''}`}
                      onClick={() => {
                        setRefKind(kind)
                        setRefQuery(referenceQueryForKind(kind))
                      }}
                    >
                      {labelForKind(kind)}
                    </button>
                  ))}
                </div>
                <label>
                  Suche
                  <input
                    value={refQuery}
                    onChange={(e) => setRefQuery(e.target.value)}
                    placeholder="z. B. dried flower door wreath"
                  />
                </label>
                <div className="composer-dialog-actions">
                  <button type="button" onClick={() => setDialog(null)}>
                    Abbrechen
                  </button>
                  <button
                    type="button"
                    className="is-primary"
                    disabled={refLoading || !refQuery.trim()}
                    onClick={() => void runReferenceSearch()}
                  >
                    {refLoading ? 'Suche…' : 'Suchen'}
                  </button>
                </div>
                {refError && <p className="composer-dialog-error">{refError}</p>}
                {refHits.length > 0 && (
                  <div className="ref-results">
                    {refHits.map((hit) => (
                      <button
                        key={hit.id}
                        type="button"
                        className="ref-result"
                        onClick={() => sendReference(hit)}
                        title={formatAttribution(hit)}
                      >
                        <img src={hit.thumbUrl || hit.url} alt="" />
                        <span>{formatAttribution(hit)}</span>
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
