import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent } from 'react'
import { createPortal } from 'react-dom'
import './App.css'
import {
  getSemanticGroup,
  initialChatLists,
  orderFieldLabels,
  products,
  semanticGroupLabel,
  semanticGroupToStatus,
  statusLabel,
  type ChatList,
  type ChatChannel,
  type Announcement,
  type ArchivedOrder,
  type Conversation,
  type GroupMessage,
  type Message,
  type OrderStatus,
  type SemanticGroup,
  type StructuredOrder,
  type TodoItem,
} from './data'
import { initialConversations, initialTodos, semanticStressConversation } from './demoData'
import { listCustomers, linkCustomerToConversation, type CustomerRecord } from './customerStore'
import { isAnnaBotChat, isAnnaCustomerName, planAnnaRepliesAsync, ANNA_CHAT_ID, type AnnaBubble } from './annaBot'
import { formatAttribution, searchReferenceImageForKind, validateReferenceImage } from './referenceImages'
import {
  collectHeaderSearchHits,
  conversationMatchesChatListQuery,
  customerMatchesQuery,
  parseNewChatCommand,
  type HeaderSearchHit,
} from './searchPeople'
import { OfferEditor } from './OfferEditor'
import { Composer, type OutgoingMessage } from './Composer'
import {
  probeWhatsAppConnection,
  type WaConnectionStatus,
} from './whatsappApi'
import {
  OperatorApiError,
  operatorApi,
  type OperatorConversationPatch,
  type OperatorOrderPatch,
} from './operatorApi'
import { isOperatorRuntime, runtimeConfig } from './runtimeMode'
import { IS_WHATSAPP_PREVIEW, PRODUCT_NAME } from './productConfig'
import { landingHomeUrl } from './publicHost'
import { INTEREST_EMAIL, InterestLead, openInterestLead } from './InterestLead'
import { InstallPrompt } from './InstallPrompt'
import { brandWordmarkUrl } from './brandAssets'
import { LegalMenu } from './LegalMenu'
import { MessageBubble } from './components/chat/MessageBubble'
import { messagePreview } from './components/chat/messagePreview'
import { IconMsgTicks } from './components/chat/IconMsgTicks'
import { ForwardedLabel, type MediaLightboxItem } from './components/chat/MessageMedia'
import { OrderFields, orderFieldOrder } from './components/order/OrderFields'
import { InfoHub } from './InfoHub'
import { GroupOverview, GroupWorkspace } from './GroupWorkspace'
import {
  applyOrderSemantics,
  conversationsMessagesFingerprint,
  emptyStructuredOrder,
} from './orderFromChat'

type View = 'home' | 'auftraege' | 'whatsapp' | 'agenda' | 'kunden' | 'kollektion'

const LOCKED_VIEWS: View[] = ['home', 'auftraege', 'agenda', 'kunden', 'kollektion']
/** Build-time boundary: public Pages never ask the protected API for data. */
const IS_OPERATOR_RUNTIME = isOperatorRuntime()
/** The adversarial transcript is a local development aid, never public or operator data. */
const LOCAL_SEMANTIC_STRESS = import.meta.env.DEV
  ? [
      initialConversations[0],
      semanticStressConversation,
      ...initialConversations.slice(1),
    ]
  : initialConversations

/**
 * Non-sensitive fallback while the protected operator snapshot is loading.
 * It is deliberately not part of the conversation list, so demo data can
 * never flash into the live application.
 */
const operatorLoadingConversation: Conversation = {
  id: '',
  systemRole: 'info',
  kunde: PRODUCT_NAME,
  telefon: '',
  online: false,
  unread: 0,
  lastPreview: '',
  lastAt: '',
  status: 'anfrage',
  structured: {
    produkt: '',
    notizen: '',
    konfidenz: 0,
    kanal: 'WhatsApp',
  },
  messages: [],
}

function isViewLocked(v: View) {
  return LOCKED_VIEWS.includes(v)
}

function formatArchiveTimestamp(value?: string): string {
  if (!value) return 'Zeitpunkt nicht verfügbar'
  try {
    return new Intl.DateTimeFormat('de-DE', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(value))
  } catch {
    return value
  }
}

type ChatFilter =
  | { kind: 'all' }
  | { kind: 'unread' }
  | { kind: 'groups' }
  | { kind: 'semantic'; group: SemanticGroup }
  | { kind: 'list'; listId: string }

type FilterMenu = 'status' | 'groups' | 'announcements'

/** WhatsApp-Markenzeichen: transparente Fläche außerhalb der Sprechblase. */
function WhatsAppLogo({
  size = 20,
  tone = 'brand',
}: {
  size?: number
  /** brand = grün auf hell; inverse = weiße Umrandung + weißes Hörersymbol auf Grün */
  tone?: 'brand' | 'inverse'
}) {
  // Offizielle Marken-Pfade (Simple Icons / WhatsApp), viewBox 24×24
  const bubble =
    'M12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893A11.821 11.821 0 0 0 12.05 0z'
  const phone =
    'M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z'

  if (tone === 'inverse') {
    // Weiße Sprechblasen-Umrandung + weißes Telefon auf grünem Button
    return (
      <svg
        className="wa-logo"
        width={size}
        height={size}
        viewBox="-1.2 -1.2 26.4 26.4"
        aria-hidden
      >
        <path
          fill="none"
          stroke="#FFFFFF"
          strokeWidth={2.15}
          strokeLinejoin="round"
          d={bubble}
        />
        <path fill="#FFFFFF" d={phone} />
      </svg>
    )
  }

  return (
    <svg
      className="wa-logo"
      width={size}
      height={size}
      viewBox="-1.2 -1.2 26.4 26.4"
      aria-hidden
    >
      <path
        fill="#25D366"
        stroke="#FFFFFF"
        strokeWidth={1.15}
        paintOrder="stroke fill"
        d={bubble}
      />
      <path fill="#FFFFFF" d={phone} />
    </svg>
  )
}

function IconSearch({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="11" cy="11" r="6.5" stroke="currentColor" strokeWidth="1.6" />
      <path d="m16.2 16.2 3.3 3.3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  )
}

function IconInfo({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 3.25c-4.83 0-8.75 3.54-8.75 7.9 0 1.96.8 3.76 2.13 5.14l-1.1 4.46 4.54-2.2c1 .33 2.07.5 3.18.5 4.83 0 8.75-3.54 8.75-7.9S16.83 3.25 12 3.25Z"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinejoin="round"
      />
      <path d="M12 10.55v4.65" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <circle cx="12" cy="7.75" r="1.15" fill="currentColor" />
    </svg>
  )
}

function IconProfile({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="8" r="3.25" stroke="currentColor" strokeWidth="1.6" />
      <path
        d="M5.5 19.2c.9-3.1 3.3-4.7 6.5-4.7s5.6 1.6 6.5 4.7"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  )
}

/** Kleines Schloss neben gesperrten Nav-Einträgen (WhatsApp-Preview). */
function IconNavLock() {
  return (
    <svg className="nav-lock-icon" viewBox="0 0 12 14" width="11" height="12" fill="none" aria-hidden>
      <rect x="1.25" y="5.75" width="9.5" height="7" rx="1.35" stroke="currentColor" strokeWidth="1.35" />
      <path
        d="M3.4 5.75V4.05a2.6 2.6 0 0 1 5.2 0v1.7"
        stroke="currentColor"
        strokeWidth="1.35"
        strokeLinecap="round"
      />
      <circle cx="6" cy="9" r="0.85" fill="currentColor" />
    </svg>
  )
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('')
}

/** Vorname für „Marie schreibt …“ (ohne Demo-Suffix). */
function contactFirstName(kunde: string) {
  const cleaned = kunde.replace(/\s*\(.*?\)\s*/g, ' ').trim()
  return cleaned.split(/\s+/)[0] || kunde
}

function isNewChatCommand(value: string) {
  return parseNewChatCommand(value).active
}

export default function App() {
  const [view, setView] = useState<View>('whatsapp')

  function goToView(next: View) {
    if (isViewLocked(next)) {
      showToast(`${PRODUCT_NAME}: Bereich demnächst verfügbar`)
      setView('whatsapp')
      return
    }
    setView(next)
  }
  // Operator builds intentionally start empty. Only the protected Worker may
  // populate this state; the public demo remains a completely separate mode.
  const [conversations, setConversations] = useState<Conversation[]>(() =>
    IS_OPERATOR_RUNTIME ? [] : LOCAL_SEMANTIC_STRESS,
  )
  const [activeId, setActiveId] = useState(() =>
    IS_OPERATOR_RUNTIME ? '' : 'demo-marie',
  )
  const [operatorDataState, setOperatorDataState] = useState<
    'idle' | 'loading' | 'ready' | 'error'
  >(() => (IS_OPERATOR_RUNTIME ? 'loading' : 'ready'))
  const [operatorDataError, setOperatorDataError] = useState<string | undefined>()
  /** Unter Desktop (<1280): exklusiv Kontakte | Chat | Auftrag — kein Split Chat/Auftrag. */
  const [singlePane, setSinglePane] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(max-width: 1279.98px)').matches,
  )
  const [mobilePane, setMobilePane] = useState<'list' | 'chat' | 'order'>('list')
  /** ≥1280px: Auftragsspalte inline neben Chat. */
  const [orderInline, setOrderInline] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(min-width: 1280px)').matches,
  )
  /** Gemessene Header-Suche nur mit genug Platz für Branding, Navigation und Tools. */
  const [preciseHeaderSearch, setPreciseHeaderSearch] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(min-width: 1600px)').matches,
  )
  const [todos, setTodos] = useState<TodoItem[]>(initialTodos)
  const [query, setQuery] = useState('')
  const [headerQuery, setHeaderQuery] = useState('')
  const [headerHitIndex, setHeaderHitIndex] = useState(-1)
  const [chatFilter, setChatFilter] = useState<ChatFilter>({ kind: 'all' })
  const [chatLists, setChatLists] = useState<ChatList[]>(initialChatLists)
  /** Group workspaces are separate from the list filters and from native WhatsApp group chats. */
  const [groupOverviewOpen, setGroupOverviewOpen] = useState(false)
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null)
  const [chatChannels, setChatChannels] = useState<ChatChannel[]>([])
  const [announcements, setAnnouncements] = useState<Announcement[]>([])
  const [filterMenu, setFilterMenu] = useState<FilterMenu | null>(null)
  const [filterMenuPosition, setFilterMenuPosition] = useState<{ top: number; left: number } | null>(null)
  const [, setListMenuOpen] = useState(false)
  const [statusMenuOpen, setStatusMenuOpen] = useState(false)
  const [threadMenuId, setThreadMenuId] = useState<string | null>(null)
  const [selectedConversationIds, setSelectedConversationIds] = useState<string[]>([])
  const [selectionMode, setSelectionMode] = useState(false)
  const [chatContextMenu, setChatContextMenu] = useState<{
    conversationId: string
    top: number
    left: number
  } | null>(null)
  const [bulkGroupDialogOpen, setBulkGroupDialogOpen] = useState(false)
  const [bulkGroupManageOpen, setBulkGroupManageOpen] = useState(false)
  const [bulkGroupExistingId, setBulkGroupExistingId] = useState('')
  const [bulkGroupName, setBulkGroupName] = useState('')
  const [groupDissolveTarget, setGroupDissolveTarget] = useState<string | null>(null)
  const [groupDissolveBusy, setGroupDissolveBusy] = useState(false)
  const [bulkDeleteIds, setBulkDeleteIds] = useState<string[] | null>(null)
  const [bulkDeleteBusy, setBulkDeleteBusy] = useState(false)
  const [groupSubmenu, setGroupSubmenu] = useState<{
    chatId: string
    top: number
    left: number
  } | null>(null)
  const [msgMenuId, setMsgMenuId] = useState<string | null>(null)
  const [replyTo, setReplyTo] = useState<Message | null>(null)
  const [selectMode, setSelectMode] = useState(false)
  const [selectedMsgIds, setSelectedMsgIds] = useState<string[]>([])
  const [forwardIds, setForwardIds] = useState<string[] | null>(null)
  const [deleteIds, setDeleteIds] = useState<string[] | null>(null)
  const [operatorDeleteTarget, setOperatorDeleteTarget] = useState<
    | { kind: 'message'; conversationId: string; messageId: string }
    | { kind: 'conversation'; conversationId: string }
    | null
  >(null)
  const [operatorDeleteBusy, setOperatorDeleteBusy] = useState(false)
  const [archivedOrdersByConversation, setArchivedOrdersByConversation] = useState<Record<string, ArchivedOrder[]>>({})
  const [archivingOrder, setArchivingOrder] = useState(false)
  /** Demo-only segment boundary; the protected app gets its boundary from D1. */
  const [draftStartByConversation, setDraftStartByConversation] = useState<Record<string, number>>({})
  const [newChatPickerOpen, setNewChatPickerOpen] = useState(false)
  const [contactPickerQuery, setContactPickerQuery] = useState('')
  const [newGroupForChat, setNewGroupForChat] = useState<string | null>(null)
  const [newGroupName, setNewGroupName] = useState('')
  const [newChannelOpen, setNewChannelOpen] = useState(false)
  const [newChannelName, setNewChannelName] = useState('')
  const [newChannelGroupIds, setNewChannelGroupIds] = useState<string[]>([])
  const [announcementOpen, setAnnouncementOpen] = useState(false)
  const [announcementTitle, setAnnouncementTitle] = useState('')
  const [announcementText, setAnnouncementText] = useState('')
  const [announcementAudience, setAnnouncementAudience] = useState<'all' | 'group' | 'channel' | 'contacts'>('all')
  const [announcementTargetId, setAnnouncementTargetId] = useState('')
  const [announcementContactIds, setAnnouncementContactIds] = useState<string[]>([])
  const [composerFocusNonce, setComposerFocusNonce] = useState(0)
  const [composerDraftSeed, setComposerDraftSeed] = useState<string | null>(null)
  const [starredOnly, setStarredOnly] = useState(false)
  /** Chat-IDs, in denen der Kontakt gerade tippt. UI ist fertig; befüllen später per WhatsApp-API. */
  const [typingChatIds, setTypingChatIds] = useState<string[]>([])
  const [filterScrollHints, setFilterScrollHints] = useState({
    left: false,
    right: false,
  })
  const [, setNewListName] = useState('')
  const [selectedOrderId, setSelectedOrderId] = useState(() =>
    IS_OPERATOR_RUNTIME ? '' : 'demo-marie',
  )
  const [liveFields, setLiveFields] = useState<Set<string>>(() => new Set())
  const [liveStatus, setLiveStatus] = useState(false)
  const [liveTick, setLiveTick] = useState(0)
  const [toast, setToast] = useState<string | null>(null)
  const [mediaLightbox, setMediaLightbox] = useState<MediaLightboxItem | null>(
    null,
  )
  const [waStatus, setWaStatus] = useState<WaConnectionStatus>({
    state: 'checking',
    label: 'Verbindung wird geprüft…',
    detail: 'Status wird geladen…',
    checkedAt: new Date().toISOString(),
    mediaEnabled: false,
  })
  const [headerSearchOpen, setHeaderSearchOpen] = useState(false)
  const [headerSearchLayout, setHeaderSearchLayout] = useState({
    logoZoneWidth: 300,
    navWidth: 480,
    inputWidth: 220,
  })
  const endRef = useRef<HTMLDivElement>(null)
  const listMenuRef = useRef<HTMLDivElement>(null)
  const statusMenuRef = useRef<HTMLDivElement>(null)
  const threadMenuRef = useRef<HTMLDivElement>(null)
  const groupSubmenuRef = useRef<HTMLDivElement>(null)
  const filterMenuRef = useRef<HTMLDivElement>(null)
  const filterMenuPortalRef = useRef<HTMLDivElement>(null)
  const filterScrollRef = useRef<HTMLDivElement>(null)
  const headerSearchRef = useRef<HTMLInputElement>(null)
  const headerSearchWrapRef = useRef<HTMLDivElement>(null)
  const topbarMainRef = useRef<HTMLDivElement>(null)
  const chatListColRef = useRef<HTMLElement>(null)
  const bearbeitungAnchorRef = useRef<HTMLElement>(null)
  const searchToggleRef = useRef<HTMLButtonElement>(null)
  const liveTimerRef = useRef<number | null>(null)
  const hydratedSemanticsRef = useRef(false)
  const activeIdRef = useRef(activeId)
  const conversationsRef = useRef(conversations)
  const annaGenRef = useRef(0)
  const annaTimersRef = useRef<number[]>([])
  const annaDebounceRef = useRef<number | null>(null)
  const orderPersistTimerRef = useRef<number | null>(null)
  const pendingOrderPatchRef = useRef(new Map<string, OperatorOrderPatch>())
  const conversationPersistTimerRef = useRef<number | null>(null)
  const pendingConversationPatchRef = useRef(
    new Map<string, OperatorConversationPatch>(),
  )

  activeIdRef.current = activeId
  conversationsRef.current = conversations

  useEffect(() => {
    if (!IS_OPERATOR_RUNTIME || !('serviceWorker' in navigator)) return

    // The operator app is protected by Cloudflare Access. It must not render
    // an older offline shell after that access session has expired: that
    // otherwise looks like a broken API and hides the sign-in screen. Clear
    // the legacy PWA worker once, then reload through Access. This touches
    // only local browser caches; D1/R2 chat data is never affected.
    let cancelled = false
    void (async () => {
      const registrations = await navigator.serviceWorker.getRegistrations()
      if (cancelled || registrations.length === 0) return
      await Promise.all(registrations.map((registration) => registration.unregister()))
      if ('caches' in window) {
        const cacheNames = await window.caches.keys()
        await Promise.all(cacheNames.map((cacheName) => window.caches.delete(cacheName)))
      }
      if (!cancelled) window.location.reload()
    })()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    void probeWhatsAppConnection().then((status) => {
      if (!cancelled) setWaStatus(status)
    })
    return () => {
      cancelled = true
    }
  }, [])

  /**
   * The protected app gets its entire chat snapshot from the Worker.  There is
   * no preview fallback here: a network or Access failure leaves the live app
   * empty instead of ever substituting demo conversations.
   */
  useEffect(() => {
    if (!IS_OPERATOR_RUNTIME) return

    let cancelled = false
    let loading = false
    let revisionLoading = false
    let lastLiveRevision: string | undefined
    let fallbackPoll: number | undefined

    async function refreshOperatorSnapshot() {
      if (loading) return
      loading = true
      try {
        const [snapshot, groups] = await Promise.all([
          operatorApi.listConversations(),
          operatorApi.listChatGroups().catch(() => []),
        ])
        if (cancelled) return
        const next = snapshot.filter((conversation) => conversation.systemRole !== 'info')
        conversationsRef.current = next
        setConversations(next)
        setChatLists(groups)
        setActiveId((current) =>
          next.some((conversation) => conversation.id === current)
            ? current
            : (next[0]?.id ?? ''),
        )
        setSelectedOrderId((current) =>
          next.some((conversation) => conversation.id === current)
            ? current
            : (next[0]?.id ?? ''),
        )
        const archives = await Promise.all(
          next.map(async (conversation) => [
            conversation.id,
            await operatorApi.listArchivedOrders(conversation.id).catch(() => []),
          ] as const),
        )
        if (!cancelled) {
          setArchivedOrdersByConversation(Object.fromEntries(archives))
        }
        setOperatorDataError(undefined)
        setOperatorDataState('ready')
      } catch (error) {
        if (!cancelled) {
          setOperatorDataError(
            error instanceof OperatorApiError
              ? error.message
              : 'Die geschützte Kundenzettel-API ist nicht erreichbar.',
          )
          setOperatorDataState('error')
        }
      } finally {
        loading = false
      }
    }

    void refreshOperatorSnapshot()
    async function refreshWhenLiveDataChanged() {
      if (revisionLoading || document.visibilityState !== 'visible') return
      revisionLoading = true
      try {
        const revision = await operatorApi.liveRevision()
        if (lastLiveRevision !== undefined && revision !== lastLiveRevision) {
          void refreshOperatorSnapshot()
        }
        lastLiveRevision = revision
      } catch {
        // The normal 30-second snapshot remains the final recovery path.
      } finally {
        revisionLoading = false
      }
    }
    function startFastFallback() {
      if (fallbackPoll !== undefined) return
      void refreshWhenLiveDataChanged()
      fallbackPoll = window.setInterval(() => {
        void refreshWhenLiveDataChanged()
      }, 1_000)
    }
    function stopFastFallback() {
      if (fallbackPoll === undefined) return
      window.clearInterval(fallbackPoll)
      fallbackPoll = undefined
    }
    const poll = window.setInterval(() => {
      void refreshOperatorSnapshot()
      void probeWhatsAppConnection().then((status) => {
        if (!cancelled) setWaStatus(status)
      })
    }, 30_000)
    const unsubscribe = operatorApi.subscribe((event) => {
      if (event.type === 'status') {
        void probeWhatsAppConnection().then((status) => {
          if (!cancelled) setWaStatus(status)
        })
      }
      void refreshOperatorSnapshot()
    }, startFastFallback)
    // Keep the one-second, payload-free revision probe active even while SSE
    // reports an open connection. Some embedded/mobile browsers keep a stale
    // EventSource open without dispatching its later events; waiting for the
    // 30-second recovery snapshot would make incoming WhatsApp messages feel
    // delayed. Full conversation data is still fetched only after a revision
    // change, so the steady-state request is intentionally tiny.
    startFastFallback()

    return () => {
      cancelled = true
      window.clearInterval(poll)
      stopFastFallback()
      unsubscribe?.()
    }
  }, [])

  useEffect(() => {
    if (!IS_OPERATOR_RUNTIME || !activeId) return
    let cancelled = false
    void operatorApi.listArchivedOrders(activeId)
      .then((orders) => {
        if (!cancelled) {
          setArchivedOrdersByConversation((previous) => ({
            ...previous,
            [activeId]: orders,
          }))
        }
      })
      .catch(() => {
        // Archive loading must never replace or expose a live chat fallback.
      })
    return () => {
      cancelled = true
    }
  }, [activeId])

  // Unter 1280px: Ein-Pane (Kontakte | Chat | Auftrag)
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 1279.98px)')
    const sync = () => setSinglePane(mq.matches)
    sync()
    mq.addEventListener('change', sync)
    return () => mq.removeEventListener('change', sync)
  }, [])

  // Auftragsspalte nur auf breiten Desktops inline
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1280px)')
    const sync = () => {
      const inline = mq.matches
      setOrderInline(inline)
      if (inline) setMobilePane((pane) => (pane === 'order' ? 'chat' : pane))
    }
    sync()
    mq.addEventListener('change', sync)
    return () => mq.removeEventListener('change', sync)
  }, [])

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1600px)')
    const sync = () => setPreciseHeaderSearch(mq.matches)
    sync()
    mq.addEventListener('change', sync)
    return () => mq.removeEventListener('change', sync)
  }, [])

  useEffect(() => {
    if (!headerSearchOpen) return
    const id = window.setTimeout(() => headerSearchRef.current?.focus(), 280)
    return () => window.clearTimeout(id)
  }, [headerSearchOpen])

  useEffect(() => {
    if (orderInline || mobilePane !== 'order') return
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Escape') return
      e.preventDefault()
      setMobilePane('chat')
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [orderInline, mobilePane])

  useEffect(() => {
    if (!newChatPickerOpen) return
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Escape') return
      e.preventDefault()
      setNewChatPickerOpen(false)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [newChatPickerOpen])

  useEffect(() => {
    // Präzise Expansion nur mit genug Platz (≥1280, Auftrag inline)
    if (!headerSearchOpen || view !== 'whatsapp' || !preciseHeaderSearch) return

    let timeoutId = 0
    let rafId = 0

    function measureHeaderSearchLayout() {
      const topbar = topbarMainRef.current
      const listCol = chatListColRef.current
      const badge = bearbeitungAnchorRef.current
      if (!topbar || !listCol) return
      if (listCol.getBoundingClientRect().width < 40) return

      const topbarRect = topbar.getBoundingClientRect()
      const styles = getComputedStyle(topbar)
      const tools = topbar.querySelector<HTMLElement>('.topbar-tools')
      const actions = topbar.querySelector<HTMLElement>('.top-actions')
      const toolsGap = tools
        ? Number.parseFloat(getComputedStyle(tools).gap) || 6
        : 6
      const actionGap = actions
        ? Number.parseFloat(getComputedStyle(actions).gap) || 6
        : 6
      const padL = Number.parseFloat(styles.paddingLeft) || 0
      const padR = Number.parseFloat(styles.paddingRight) || 0
      const contentLeft = topbarRect.left + padL
      const contentRight = topbarRect.right - padR

      const dividerX = listCol.getBoundingClientRect().right

      const badgeEl =
        badge ??
        document.querySelector<HTMLElement>('.chat-head-badge')
      const searchAnchorX = (() => {
        if (!badgeEl) return dividerX + 300
        const textNode = Array.from(badgeEl.childNodes).find(
          (n) => n.nodeType === Node.TEXT_NODE && (n.textContent ?? '').trim(),
        )
        const full = (textNode?.textContent ?? badgeEl.textContent ?? '').trim()
        const word = 'Bearbeitung'
        const wordIdx = full.indexOf(word)
        if (textNode && wordIdx >= 0) {
          const range = document.createRange()
          const beStart = wordIdx
          range.setStart(textNode, beStart)
          range.setEnd(textNode, beStart + 2)
          const r = range.getBoundingClientRect()
          return (r.left + r.right) / 2
        }
        const r = badgeEl.getBoundingClientRect()
        return r.left + r.width * 0.45
      })()

      const logoZoneWidth = Math.max(140, Math.round(dividerX - contentLeft))
      const navWidth = Math.max(180, Math.round(searchAnchorX - dividerX))

      const iconBtns = topbar.querySelectorAll<HTMLElement>(
        '.top-actions > .icon-btn, .top-actions > .btn-wa',
      )
      let iconsWidth = 0
      iconBtns.forEach((el) => {
        iconsWidth += el.getBoundingClientRect().width
      })
      iconsWidth += Math.max(0, iconBtns.length - 1) * actionGap

      const inputWidth = Math.max(
        160,
        Math.round(contentRight - searchAnchorX - iconsWidth - toolsGap),
      )

      setHeaderSearchLayout({ logoZoneWidth, navWidth, inputWidth })
    }

    const scheduleMeasure = () => {
      window.cancelAnimationFrame(rafId)
      rafId = window.requestAnimationFrame(() => {
        measureHeaderSearchLayout()
        window.clearTimeout(timeoutId)
        timeoutId = window.setTimeout(measureHeaderSearchLayout, 140)
      })
    }

    scheduleMeasure()
    window.addEventListener('resize', scheduleMeasure)
    const ro = typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(scheduleMeasure)
      : null
    if (chatListColRef.current) ro?.observe(chatListColRef.current)
    if (bearbeitungAnchorRef.current) ro?.observe(bearbeitungAnchorRef.current)
    if (topbarMainRef.current) ro?.observe(topbarMainRef.current)

    return () => {
      window.cancelAnimationFrame(rafId)
      window.clearTimeout(timeoutId)
      window.removeEventListener('resize', scheduleMeasure)
      ro?.disconnect()
    }
  }, [headerSearchOpen, view, activeId, preciseHeaderSearch])

  function closeHeaderSearch() {
    setHeaderSearchOpen(false)
    setHeaderQuery('')
    setHeaderHitIndex(-1)
  }

  function toggleHeaderSearch() {
    setHeaderSearchOpen((open) => {
      const next = !open
      if (!next) {
        setHeaderQuery('')
      }
      setHeaderHitIndex(-1)
      return next
    })
  }

  function activateHeaderHit(hit: HeaderSearchHit) {
    if (hit.kind === 'person' && hit.customer) {
      startChatWithCustomer(hit.customer)
      closeHeaderSearch()
      return
    }
    if ((hit.kind === 'chat' || hit.kind === 'order') && hit.conversationId) {
      setSelectedOrderId(hit.conversationId)
      if (hit.kind === 'order' && !isViewLocked('auftraege')) {
        goToView('auftraege')
      } else {
        selectThread(hit.conversationId)
      }
      closeHeaderSearch()
      showToast(hit.title)
      return
    }
    if (hit.view) {
      goToView(hit.view)
      closeHeaderSearch()
      return
    }
    closeHeaderSearch()
  }

  function onHeaderSearchKeyDown(e: ReactKeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Escape') {
      e.preventDefault()
      closeHeaderSearch()
      return
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      if (headerHits.length === 0) return
      setHeaderHitIndex((index) =>
        index < 0 ? 0 : (index + 1) % headerHits.length,
      )
      return
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      if (headerHits.length === 0) return
      setHeaderHitIndex((index) =>
        index < 0
          ? headerHits.length - 1
          : (index - 1 + headerHits.length) % headerHits.length,
      )
      return
    }
    if (e.key === 'Enter') {
      e.preventDefault()
      if (headerHitIndex < 0) return
      const hit = headerHits[headerHitIndex]
      if (hit) activateHeaderHit(hit)
    }
  }

  const orderConversations = useMemo(
    () => conversations.filter((conversation) => conversation.systemRole !== 'info'),
    [conversations],
  )
  const archivedOrderRows = useMemo(
    () =>
      Object.entries(archivedOrdersByConversation).flatMap(([conversationId, orders]) => {
        const conversation = conversations.find((item) => item.id === conversationId)
        return orders.map((order) => ({ order, conversation }))
      }),
    [archivedOrdersByConversation, conversations],
  )
  const active =
    conversations.find((c) => c.id === activeId) ??
    conversations[0] ??
    operatorLoadingConversation
  const activeGroup = activeGroupId
    ? chatLists.find((group) => group.id === activeGroupId) ?? null
    : null
  const infoActive = active.systemRole === 'info'
  const selectedOrder =
    orderConversations.find((c) => c.id === selectedOrderId) ?? orderConversations[0]
  const messageFingerprint = useMemo(
    () => conversationsMessagesFingerprint(conversations),
    [conversations],
  )

  useLayoutEffect(() => {
    // The live engine only reads the active draft segment. The Worker returns
    // the immutable archive boundary, so a fresh enquiry in an old chat never
    // inherits product details from a previously archived order.
    let flashKeys: (keyof StructuredOrder)[] = []
    let statusChanged = false
    let changed = false
    const next = conversations.map((conversation) => {
      const persistedBoundary = conversation.draftStartAfterMessageId
      const boundaryIndex = persistedBoundary
        ? conversation.messages.findIndex((message) => message.id === persistedBoundary)
        : -1
      const draftStart = IS_OPERATOR_RUNTIME
        ? boundaryIndex >= 0 ? boundaryIndex + 1 : 0
        : draftStartByConversation[conversation.id] ?? 0
      const semanticInput = draftStart > 0
        ? { ...conversation, messages: conversation.messages.slice(draftStart) }
        : conversation
      const result = applyOrderSemantics(semanticInput)
      if (result.conversation === semanticInput) return conversation
      changed = true
      if (IS_OPERATOR_RUNTIME) {
        const structured = Object.fromEntries(
          result.changedKeys.map((key) => [key, result.conversation.structured[key]]),
        ) as Partial<StructuredOrder>
        if (Object.keys(structured).length || result.statusChanged) {
          scheduleOrderPersist(conversation.id, {
            ...(Object.keys(structured).length ? { structured } : {}),
            ...(result.statusChanged ? { status: result.conversation.status } : {}),
          })
        }
      }
      if (conversation.id === activeId) {
        flashKeys = result.changedKeys
        statusChanged = result.statusChanged
      }
      return { ...result.conversation, messages: conversation.messages }
    })
    const skipFlash = !hydratedSemanticsRef.current
    hydratedSemanticsRef.current = true
    if (!changed) return
    setConversations(next)
    if (skipFlash) return
    const visible = flashKeys.filter((key) => key !== 'konfidenz')
    if (!visible.length && !statusChanged) return
    if (liveTimerRef.current) window.clearTimeout(liveTimerRef.current)
    setLiveFields(new Set(visible.map(String)))
    setLiveStatus(statusChanged)
    setLiveTick((tick) => tick + 1)
    liveTimerRef.current = window.setTimeout(() => {
      setLiveFields(new Set())
      setLiveStatus(false)
    }, 1700)
    // Nur Nachrichten-Fingerprint: manuelle Feldedits dürfen nicht zurückgeschrieben werden.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messageFingerprint, draftStartByConversation])

  useEffect(() => {
    setLiveFields(new Set())
    setLiveStatus(false)
  }, [activeId])

  useEffect(() => {
    if (!liveFields.size) return
    document
      .querySelector<HTMLElement>('.order-inner .field.is-live')
      ?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [liveTick, liveFields])
  const unread = useMemo(
    () => conversations.reduce((s, c) => s + c.unread, 0),
    [conversations],
  )
  const openTodos = todos.filter((t) => !t.done).length

  const semanticCounts = useMemo(() => {
    const counts: Record<SemanticGroup, number> = {
      offen: 0,
      bearbeitung: 0,
      abgeschlossen: 0,
    }
    for (const c of orderConversations) {
      counts[getSemanticGroup(c.status)] += 1
    }
    return counts
  }, [orderConversations])

  const selectedGroupMemberships = useMemo(() => {
    const selectedIds = new Set(selectedConversationIds)
    return chatLists
      .map((group) => {
        const selectedIdsInGroup = group.chatIds.filter((id) => selectedIds.has(id))
        return {
          group,
          selectedIds: selectedIdsInGroup,
          includesEntireGroup: selectedIdsInGroup.length === group.chatIds.length,
        }
      })
      .filter((membership) => membership.selectedIds.length > 0)
  }, [chatLists, selectedConversationIds])

  const infoConversation = useMemo(
    () => conversations.find((c) => c.systemRole === 'info'),
    [conversations],
  )

  const filtered = useMemo(() => {
    const list = conversations.filter((c) => {
      // Der Informationsbereich ist kein Chat und darf deshalb nie ein
      // Ergebnis eines Chatfilters sein.
      if (c.systemRole === 'info') return false

      if (query.trim() && !isNewChatCommand(query)) {
        if (!conversationMatchesChatListQuery(c, query, chatLists)) return false
      }

      if (chatFilter.kind === 'unread') return c.unread > 0
      if (chatFilter.kind === 'groups') {
        return chatLists.some((list) => list.chatIds.includes(c.id))
      }
      if (chatFilter.kind === 'semantic') {
        return getSemanticGroup(c.status) === chatFilter.group
      }
      if (chatFilter.kind === 'list') {
        const found = chatLists.find((l) => l.id === chatFilter.listId)
        return found?.chatIds.includes(c.id) ?? false
      }
      return true
    })
    return [...list].sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned))
  }, [conversations, query, chatFilter, chatLists])

  // Der feste Informationsbereich steht nur in der ungefilterten Standardansicht
  // zur Verfügung. Er ist bewusst nicht Teil der Ergebnisse von „Alle“,
  // „Ungelesen“, Status- oder Gruppenfiltern.
  const visibleThreads = useMemo(() => {
    const showInfo = chatFilter.kind === 'all' && !query.trim() && infoConversation
    return showInfo ? [infoConversation, ...filtered] : filtered
  }, [chatFilter.kind, filtered, infoConversation, query])

  function toggleFilterMenu(menu: FilterMenu, event: ReactMouseEvent<HTMLButtonElement>) {
    if (filterMenu === menu) {
      setFilterMenu(null)
      return
    }
    const bounds = event.currentTarget.getBoundingClientRect()
    setFilterMenuPosition({
      top: bounds.bottom + 6,
      left: Math.max(8, Math.min(bounds.left, window.innerWidth - 248)),
    })
    setFilterMenu(menu)
  }

  const headerHits = useMemo(
    () =>
      headerSearchOpen
        ? collectHeaderSearchHits({
            query: headerQuery,
            conversations,
            // The public customer seed is never consulted by the live app.
            customers: IS_OPERATOR_RUNTIME ? [] : listCustomers(),
            todos,
          })
        : [],
    [conversations, headerQuery, headerSearchOpen, todos],
  )

  const pickerCustomers = useMemo(() => {
    if (IS_OPERATOR_RUNTIME || !newChatPickerOpen) return []
    const all = listCustomers()
    const q = contactPickerQuery.trim().toLowerCase()
    if (!q) return all
    return all.filter((c) => customerMatchesQuery(c, contactPickerQuery))
  }, [contactPickerQuery, newChatPickerOpen])

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (listMenuRef.current && !listMenuRef.current.contains(e.target as Node)) {
        setListMenuOpen(false)
      }
      if (statusMenuRef.current && !statusMenuRef.current.contains(e.target as Node)) {
        setStatusMenuOpen(false)
      }
      const inFilterMenu =
        filterMenuRef.current?.contains(e.target as Node) ||
        filterMenuPortalRef.current?.contains(e.target as Node)
      if (!inFilterMenu) {
        setFilterMenu(null)
      }
      const isInGroupSubmenu = groupSubmenuRef.current?.contains(e.target as Node)
      if (threadMenuRef.current && !threadMenuRef.current.contains(e.target as Node) && !isInGroupSubmenu) {
        setThreadMenuId(null)
        setGroupSubmenu(null)
      }
      const inHeaderSearch =
        headerSearchWrapRef.current?.contains(e.target as Node) ||
        searchToggleRef.current?.contains(e.target as Node)
      if (headerSearchOpen && !inHeaderSearch) {
        closeHeaderSearch()
      }
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [headerSearchOpen])

  useEffect(() => {
    if (view !== 'whatsapp') return

    let rafId = 0

    function updateFilterScrollHints() {
      const el = filterScrollRef.current
      if (!el) return
      const maxScroll = el.scrollWidth - el.clientWidth
      const overflow = maxScroll > 1
      const next = {
        left: overflow && el.scrollLeft > 1,
        right: overflow && el.scrollLeft < maxScroll - 1,
      }
      setFilterScrollHints((prev) =>
        prev.left === next.left && prev.right === next.right ? prev : next,
      )
    }

    function scheduleUpdate() {
      window.cancelAnimationFrame(rafId)
      rafId = window.requestAnimationFrame(updateFilterScrollHints)
    }

    const el = filterScrollRef.current
    scheduleUpdate()
    el?.addEventListener('scroll', updateFilterScrollHints, { passive: true })
    window.addEventListener('resize', scheduleUpdate)
    const ro =
      typeof ResizeObserver !== 'undefined'
        ? new ResizeObserver(scheduleUpdate)
        : null
    if (el) ro?.observe(el)
    if (chatListColRef.current) ro?.observe(chatListColRef.current)

    return () => {
      window.cancelAnimationFrame(rafId)
      el?.removeEventListener('scroll', updateFilterScrollHints)
      window.removeEventListener('resize', scheduleUpdate)
      ro?.disconnect()
    }
  }, [view, chatLists.length, unread, conversations.length, semanticCounts])

  function scrollFilterRail(direction: 'left' | 'right') {
    const el = filterScrollRef.current
    if (!el) return
    const delta = Math.round(Math.min(160, el.clientWidth * 0.45))
    el.scrollBy({
      left: direction === 'left' ? -delta : delta,
      behavior: 'smooth',
    })
  }

  useEffect(() => {
    const firstFrame = window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        endRef.current?.scrollIntoView({
          behavior: mobilePane === 'chat' ? 'auto' : 'smooth',
          block: 'end',
        })
      })
    })
    return () => window.cancelAnimationFrame(firstFrame)
  }, [active?.messages.length, activeId, mobilePane])

  function showToast(msg: string) {
    setToast(msg)
    const ms = /PDF|export/i.test(msg) ? 4500 : 2200
    window.setTimeout(() => setToast(null), ms)
  }

  /**
   * Schreibstatus setzen — für Finalversion mit WhatsApp-API-Connector:
   * Presence/Typing-Events → setContactTyping(chatId, true|false).
   * UI: Chatliste „{Vorname} schreibt …“, Header „schreibt …“.
   */
  function setContactTyping(chatId: string, typing: boolean) {
    setTypingChatIds((prev) => {
      const has = prev.includes(chatId)
      if (typing && !has) return [...prev, chatId]
      if (!typing && has) return prev.filter((id) => id !== chatId)
      return prev
    })
  }

  function clearAnnaTimers() {
    for (const timer of annaTimersRef.current) window.clearTimeout(timer)
    annaTimersRef.current = []
    if (annaDebounceRef.current != null) {
      window.clearTimeout(annaDebounceRef.current)
      annaDebounceRef.current = null
    }
  }

  function trackAnnaTimer(id: number) {
    annaTimersRef.current.push(id)
  }

  function appendAnnaBubble(chatId: string, bubble: AnnaBubble) {
    const now = new Date()
    const at = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
    const incoming: Message = {
      id: `anna-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      from: 'kunde',
      kind: bubble.kind,
      text: bubble.text,
      image: bubble.image,
      video: bubble.video,
      duration: bubble.duration,
      forwarded: bubble.forwarded,
      attribution: bubble.attribution,
      at,
      status: 'delivered',
    }
    setConversations((prev) =>
      prev.map((c) => {
        if (c.id !== chatId) return c
        return {
          ...c,
          online: true,
          lastAt: at,
          lastPreview: messagePreview(incoming),
          unread: activeIdRef.current === chatId ? 0 : c.unread + 1,
          messages: [...c.messages, incoming],
        }
      }),
    )
  }

  async function resolveAnnaBubbles(bubbles: AnnaBubble[]): Promise<AnnaBubble[]> {
    const resolved: AnnaBubble[] = []
    for (const item of bubbles) {
      if (!item.referenceSearch) {
        resolved.push(item)
        continue
      }
      try {
        const kind = item.referenceSearch.kind
        const hit = await searchReferenceImageForKind(kind, {
          limit: 10,
          timeoutMs: 4000,
          preferredQuery: item.referenceSearch.query,
          pickSeed: `${kind}|${item.referenceSearch.query}|${item.text ?? ''}`,
        })
        // Zweite, verbindliche Freigabe vor Chat — synchron, keine Extra-Wartezeit
        if (
          hit &&
          (hit.url || hit.thumbUrl) &&
          validateReferenceImage(kind, hit)
        ) {
          resolved.push({
            ...item,
            kind: 'image',
            image: hit.thumbUrl || hit.url,
            attribution: formatAttribution(hit),
            forwarded: true,
            text:
              item.text && !/^referenz\b/i.test(item.text)
                ? item.text
                : 'So ungefähr stelle ich mir das vor.',
            referenceSearch: undefined,
          })
        }
        // Ungültig / kein Treffer → kein Bild im Chat
      } catch {
        // Netzwerkfehler → keine Fake-Textnachricht
      }
    }
    return resolved
  }

  function scheduleAnnaBubbles(
    chatId: string,
    gen: number,
    bubbles: AnnaBubble[],
    startElapsedMs = 0,
  ): number {
    let elapsed = startElapsedMs
    for (const item of bubbles) {
      elapsed += item.gapMs
      const typingAt = elapsed
      const sendAt = elapsed + item.typingMs
      trackAnnaTimer(
        window.setTimeout(() => {
          if (annaGenRef.current !== gen) return
          setContactTyping(chatId, true)
          setConversations((prev) =>
            prev.map((c) => (c.id === chatId ? { ...c, online: true } : c)),
          )
        }, typingAt),
      )
      trackAnnaTimer(
        window.setTimeout(() => {
          if (annaGenRef.current !== gen) return
          setContactTyping(chatId, false)
          appendAnnaBubble(chatId, item)
        }, sendAt),
      )
      elapsed = sendAt
    }
    return elapsed
  }

  async function playAnnaPlan(chatId: string, gen: number, conversation: Conversation) {
    const live = conversationsRef.current.find((c) => c.id === chatId) ?? conversation
    if (live.blocked) {
      setContactTyping(chatId, false)
      return
    }

    // Sofort Tippen anzeigen — nicht erst nach Bildsuche warten
    setContactTyping(chatId, true)
    setConversations((prev) =>
      prev.map((c) => (c.id === chatId ? { ...c, online: true } : c)),
    )

    const plan = await planAnnaRepliesAsync(live)
    if (annaGenRef.current !== gen) return

    if (plan.reactToLast) {
      const lastAtelier = [...live.messages].reverse().find((m) => m.from === 'atelier')
      if (lastAtelier) {
        const emoji = plan.reactToLast
        setConversations((prev) =>
          prev.map((c) => {
            if (c.id !== chatId) return c
            return {
              ...c,
              messages: c.messages.map((m) => {
                if (m.id !== lastAtelier.id) return m
                const list = m.reactions ?? []
                if (list.includes(emoji)) return m
                return { ...m, reactions: [...list, emoji] }
              }),
            }
          }),
        )
      }
    }
    if (!plan.bubbles.length) {
      setContactTyping(chatId, false)
      return
    }

    const isRefAnnounce = (text: string | undefined) =>
      /referenzbild|freie[sn]? referenz|schicke dir .{0,40}(bild|referenz)|leite dir .{0,40}(bild|referenz)|bild zur orientierung|bild,?\s*damit du siehst/i.test(
        text ?? '',
      )

    const textBubbles = plan.bubbles.filter(
      (b) => !b.referenceSearch && !isRefAnnounce(b.text),
    )
    const announceBubbles = plan.bubbles.filter(
      (b) => !b.referenceSearch && isRefAnnounce(b.text),
    )
    const refBubbles = plan.bubbles.filter((b) => Boolean(b.referenceSearch))

    // Text zuerst — Bildsuche/Validierung blockiert die Antwort nicht
    setContactTyping(chatId, false)
    let elapsed = scheduleAnnaBubbles(chatId, gen, textBubbles, 0)

    if (refBubbles.length === 0) {
      // Ankündigung ohne Bildsuche nur senden, wenn ohnehin kein Ref geplant
      if (announceBubbles.length) {
        scheduleAnnaBubbles(chatId, gen, announceBubbles, elapsed)
      }
      return
    }

    const resolvedRefs = await resolveAnnaBubbles(refBubbles)
    if (annaGenRef.current !== gen) return
    // Ankündigung + Bild nur nach erfolgreicher Validierung
    if (resolvedRefs.length === 0) return

    scheduleAnnaBubbles(
      chatId,
      gen,
      [...announceBubbles, ...resolvedRefs],
      Math.max(elapsed, 400),
    )
  }

  function queueAnnaReply(conversation: Conversation) {
    // The simulated Anna customer is strictly a preview fixture. Real inbound
    // WhatsApp traffic arrives only through the protected webhook/API.
    if (IS_OPERATOR_RUNTIME) return
    if (!isAnnaBotChat(conversation) || conversation.blocked) return
    if (annaDebounceRef.current != null) {
      window.clearTimeout(annaDebounceRef.current)
    }
    annaGenRef.current += 1
    const gen = annaGenRef.current
    for (const timer of annaTimersRef.current) window.clearTimeout(timer)
    annaTimersRef.current = []
    setContactTyping(conversation.id, false)
    annaDebounceRef.current = window.setTimeout(() => {
      annaDebounceRef.current = null
      if (annaGenRef.current !== gen) return
      playAnnaPlan(conversation.id, gen, conversation)
    }, 280)
  }

  useEffect(() => {
    return () => {
      clearAnnaTimers()
    }
  }, [])

  useEffect(() => {
    if (!mediaLightbox) return
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Escape') return
      e.preventDefault()
      setMediaLightbox(null)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [mediaLightbox])

  function openGroupSubmenu(chatId: string, anchor: HTMLElement) {
    const rect = anchor.getBoundingClientRect()
    // Portaled menus are not constrained by the list column.  Keep the
    // grouping controls fully reachable on narrow viewports instead of
    // positioning them off the right edge.
    const menuWidth = 224
    setGroupSubmenu({
      chatId,
      top: Math.max(8, Math.min(rect.top, window.innerHeight - 156)),
      left: Math.max(8, Math.min(rect.right - 2, window.innerWidth - menuWidth - 8)),
    })
  }

  function selectThread(id: string) {
    setActiveGroupId(null)
    setGroupOverviewOpen(false)
    setActiveId(id)
    const target = conversationsRef.current.find((conversation) => conversation.id === id)
    if (target && target.systemRole !== 'info') setSelectedOrderId(id)
    setMobilePane('chat')
    setConversations((prev) =>
      prev.map((c) => (c.id === id ? { ...c, unread: 0 } : c)),
    )
    setView('whatsapp')
    setThreadMenuId(null)
    setGroupSubmenu(null)
    setMsgMenuId(null)
    setReplyTo(null)
    setSelectMode(false)
    setSelectedMsgIds([])
    setStarredOnly(false)
    setForwardIds(null)
    setDeleteIds(null)
  }

  function returnFromInfoHubToChatList() {
    // The information hub is a system entry, not a conversation. On compact
    // layouts it must release the chat pane as well as reveal the list;
    // otherwise its selected state can keep the Q&A view on screen.
    const fallbackConversation = conversationsRef.current.find(
      (conversation) => conversation.systemRole !== 'info',
    )
    if (fallbackConversation) {
      setActiveId(fallbackConversation.id)
      setSelectedOrderId(fallbackConversation.id)
    }
    setMobilePane('list')
  }

  function mergeChatGroup(nextGroup: ChatList) {
    setChatLists((previous) => {
      const index = previous.findIndex((item) => item.id === nextGroup.id)
      if (index < 0) return [...previous, nextGroup]
      return previous.map((item) => (item.id === nextGroup.id ? { ...item, ...nextGroup } : item))
    })
  }

  async function openGroupWorkspace(groupId: string) {
    const known = chatLists.find((group) => group.id === groupId)
    if (!known) return
    setFilterMenu(null)
    setActiveGroupId(groupId)
    setGroupOverviewOpen(false)
    setMobilePane('chat')
    setView('whatsapp')
    setSelectionMode(false)
    setSelectedConversationIds([])
    if (!IS_OPERATOR_RUNTIME) return
    try {
      const detailed = await operatorApi.getChatGroup(groupId)
      if (detailed) mergeChatGroup(detailed)
    } catch (error) {
      // The already-loaded membership remains usable; the next live snapshot
      // will fill the timeline as soon as the protected request succeeds.
      if (error instanceof OperatorApiError && error.status === 401) {
        showToast(error.message)
      }
    }
  }

  function openGroupOverview() {
    setFilterMenu(null)
    setGroupOverviewOpen(true)
    setActiveGroupId(null)
    setMobilePane('list')
    setSelectionMode(false)
    setSelectedConversationIds([])
  }

  async function addGroupMember(groupId: string, conversationId: string): Promise<boolean> {
    const group = chatLists.find((item) => item.id === groupId)
    if (!group || group.chatIds.includes(conversationId)) return false
    if (IS_OPERATOR_RUNTIME) {
      try {
        const updated = await operatorApi.addChatToGroup(groupId, conversationId)
        if (!updated) throw new Error('CHAT_GROUP_MEMBERSHIP_FAILED')
        mergeChatGroup(updated)
        return true
      } catch (error) {
        showToast(error instanceof OperatorApiError ? error.message : 'Das Mitglied konnte nicht hinzugefügt werden.')
        return false
      }
    }
    setChatLists((previous) => previous.map((item) => item.id === groupId
      ? { ...item, chatIds: [...item.chatIds, conversationId], updatedAt: new Date().toISOString() }
      : item))
    return true
  }

  async function removeGroupMember(groupId: string, conversationId: string): Promise<boolean> {
    const group = chatLists.find((item) => item.id === groupId)
    if (!group || !group.chatIds.includes(conversationId)) return false
    if (IS_OPERATOR_RUNTIME) {
      try {
        const updated = await operatorApi.removeChatFromGroup(groupId, conversationId)
        if (!updated) throw new Error('CHAT_GROUP_MEMBERSHIP_FAILED')
        mergeChatGroup(updated)
        return true
      } catch (error) {
        showToast(error instanceof OperatorApiError ? error.message : 'Das Mitglied konnte nicht entfernt werden.')
        return false
      }
    }
    setChatLists((previous) => previous.map((item) => item.id === groupId
      ? { ...item, chatIds: item.chatIds.filter((id) => id !== conversationId), updatedAt: new Date().toISOString() }
      : item))
    return true
  }

  async function sendGroupMessage(groupId: string, text: string): Promise<{ queuedCount: number; skippedCount: number } | undefined> {
    const group = chatLists.find((item) => item.id === groupId)
    const normalized = text.trim()
    if (!group || !normalized) return undefined
    const clientMessageId = `group-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
    if (IS_OPERATOR_RUNTIME) {
      try {
        const result = await operatorApi.sendChatGroupMessage(groupId, { clientMessageId, text: normalized })
        if (result.group) mergeChatGroup(result.group)
        const message = result.groupMessage
        return {
          queuedCount: message?.queuedCount ?? 0,
          skippedCount: message?.skippedCount ?? 0,
        }
      } catch (error) {
        showToast(error instanceof OperatorApiError ? error.message : 'Die Gruppennachricht konnte nicht übergeben werden.')
        return undefined
      }
    }

    const recipientIds = group.chatIds.filter((id) => {
      const conversation = conversationsRef.current.find((item) => item.id === id)
      return conversation && !conversation.systemRole && !conversation.blocked && conversation.replyWindowOpen !== false
    })
    const now = new Date()
    const createdAt = now.toISOString()
    const at = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
    const groupMessage: GroupMessage = {
      id: clientMessageId,
      text: normalized,
      createdAt,
      recipientCount: group.chatIds.length,
      queuedCount: recipientIds.length,
      skippedCount: group.chatIds.length - recipientIds.length,
    }
    setChatLists((previous) => previous.map((item) => item.id === groupId
      ? { ...item, messages: [...(item.messages ?? []), groupMessage], updatedAt: createdAt }
      : item))
    setConversations((previous) => {
      const next = previous.map((conversation) => {
        if (!recipientIds.includes(conversation.id)) return conversation
        const message: Message = {
          id: `${clientMessageId}-${conversation.id}`,
          from: 'atelier',
          kind: 'text',
          text: normalized,
          at,
          createdAt,
          status: 'read',
        }
        return {
          ...conversation,
          messages: [...conversation.messages, message],
          lastAt: at,
          lastPreview: normalized,
        }
      })
      conversationsRef.current = next
      return next
    })
    return { queuedCount: groupMessage.queuedCount, skippedCount: groupMessage.skippedCount }
  }

  function openOrderPane() {
    setMobilePane('order')
  }

  function closeOrderPane() {
    setMobilePane('chat')
  }

  const orderPaneVisible = orderInline || mobilePane === 'order'

  function openNewChatPicker(prefill = '') {
    if (IS_OPERATOR_RUNTIME) {
      // Customer records in this public demo are intentionally not an operator
      // data source. A real outbound conversation must be initiated by the
      // protected WhatsApp workflow (including its template-window rules).
      showToast('Neue Chats werden über die geschützte WhatsApp-API angelegt.')
      return
    }
    if (window.matchMedia('(max-width: 899.98px)').matches) setMobilePane('list')
    setContactPickerQuery(prefill)
    setNewChatPickerOpen(true)
    showToast('Kontakt wählen')
  }

  function runChatListSearchAction() {
    if (isNewChatCommand(query)) {
      openNewChatPicker(parseNewChatCommand(query).name)
      return
    }
    // Lupe ohne Befehl: Fokus bleibt; leere Suche ist ok
    if (!query.trim()) {
      showToast('Suchbegriff eingeben oder „Neuen Chat starten“ wählen')
    }
  }

  function startChatWithCustomer(customer: CustomerRecord) {
    const anna = isAnnaCustomerName(customer.name)
    const preferredId = anna ? ANNA_CHAT_ID : `chat-${customer.kundenNr}`

    const existing =
      (customer.conversationId
        ? conversations.find((c) => c.id === customer.conversationId)
        : undefined) ??
      conversations.find((c) => c.id === preferredId) ??
      conversations.find((c) => isAnnaCustomerName(c.kunde) && anna)

    if (existing) {
      linkCustomerToConversation(customer.kundenNr, existing.id)
      if (existing.kunde !== customer.name) {
        setConversations((prev) =>
          prev.map((c) => (c.id === existing.id ? { ...c, kunde: customer.name } : c)),
        )
      }
      selectThread(existing.id)
      setNewChatPickerOpen(false)
      setQuery('')
      closeHeaderSearch()
      showToast(`Chat mit ${customer.name}`)
      if (existing.messages.length === 0) queueAnnaReply(existing)
      return
    }

    const now = new Date()
    const at = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
    const id = preferredId
    const address = [customer.strasse, customer.plzOrt].filter(Boolean).join(', ')
    const next: Conversation = {
      id,
      kunde: customer.name,
      telefon: customer.telefon || '—',
      online: anna,
      unread: 0,
      lastPreview: 'Neuer Chat',
      lastAt: at,
      status: 'anfrage',
      structured: emptyStructuredOrder({
        adresse: address,
        konfidenz: 0,
      }),
      messages: [],
    }
    linkCustomerToConversation(customer.kundenNr, id)
    conversationsRef.current = [next, ...conversationsRef.current.filter((c) => c.id !== id)]
    setConversations((prev) => [next, ...prev.filter((c) => c.id !== id)])
    setSelectedOrderId(id)
    selectThread(id)
    setNewChatPickerOpen(false)
    setQuery('')
    closeHeaderSearch()
    showToast(`Neuer Chat: ${customer.name}`)
    queueAnnaReply(next)
  }

  function applyOperatorConversation(conversation?: Conversation) {
    if (!IS_OPERATOR_RUNTIME || !conversation?.id) return
    setConversations((prev) => {
      const exists = prev.some((item) => item.id === conversation.id)
      const next = exists
        ? prev.map((item) => (item.id === conversation.id ? conversation : item))
        : [conversation, ...prev]
      conversationsRef.current = next
      return next
    })
  }

  function scheduleOrderPersist(conversationId: string, patch: OperatorOrderPatch) {
    if (!IS_OPERATOR_RUNTIME || !conversationId) return
    const pending = pendingOrderPatchRef.current.get(conversationId) ?? {}
    pendingOrderPatchRef.current.set(conversationId, {
      ...pending,
      ...patch,
      structured: {
        ...pending.structured,
        ...patch.structured,
      },
    })
    if (orderPersistTimerRef.current != null) {
      window.clearTimeout(orderPersistTimerRef.current)
    }
    orderPersistTimerRef.current = window.setTimeout(() => {
      const patches = [...pendingOrderPatchRef.current.entries()]
      pendingOrderPatchRef.current.clear()
      orderPersistTimerRef.current = null
      void Promise.all(
        patches.map(async ([id, nextPatch]) => {
          try {
            const result = await operatorApi.patchOrder(id, nextPatch)
            applyOperatorConversation(result.conversation)
          } catch {
            showToast('Auftragsänderung konnte nicht gespeichert werden.')
          }
        }),
      )
    }, 420)
  }

  function scheduleConversationPersist(
    conversationId: string,
    patch: OperatorConversationPatch,
  ) {
    if (!IS_OPERATOR_RUNTIME || !conversationId) return
    const pending = pendingConversationPatchRef.current.get(conversationId) ?? {}
    pendingConversationPatchRef.current.set(conversationId, { ...pending, ...patch })
    if (conversationPersistTimerRef.current != null) {
      window.clearTimeout(conversationPersistTimerRef.current)
    }
    conversationPersistTimerRef.current = window.setTimeout(() => {
      const patches = [...pendingConversationPatchRef.current.entries()]
      pendingConversationPatchRef.current.clear()
      conversationPersistTimerRef.current = null
      void Promise.all(
        patches.map(async ([id, nextPatch]) => {
          try {
            const result = await operatorApi.patchConversation(id, nextPatch)
            applyOperatorConversation(result.conversation)
          } catch {
            showToast('Chatänderung konnte nicht gespeichert werden.')
          }
        }),
      )
    }, 260)
  }

  function patchConversation(id: string, patch: Partial<Conversation>) {
    setConversations((prev) => {
      const next = prev.map((c) => (c.id === id ? { ...c, ...patch } : c))
      conversationsRef.current = next
      return next
    })
    const livePatch: OperatorConversationPatch = {}
    if (typeof patch.muted === 'boolean') livePatch.muted = patch.muted
    if (typeof patch.pinned === 'boolean') livePatch.pinned = patch.pinned
    if (typeof patch.blocked === 'boolean') livePatch.blocked = patch.blocked
    if (typeof patch.unread === 'number') livePatch.unread = patch.unread
    if (Object.keys(livePatch).length) scheduleConversationPersist(id, livePatch)
  }

  function muteChat(id: string) {
    const chat = conversations.find((c) => c.id === id)
    const next = !chat?.muted
    patchConversation(id, { muted: next })
    setThreadMenuId(null)
    showToast(next ? 'Benachrichtigungen stummgeschaltet' : 'Stummschaltung aufgehoben')
  }

  function pinChat(id: string) {
    const chat = conversations.find((c) => c.id === id)
    const next = !chat?.pinned
    patchConversation(id, { pinned: next })
    setThreadMenuId(null)
    showToast(next ? 'Chat fixiert' : 'Fixierung entfernt')
  }

  function markUnread(id: string) {
    patchConversation(id, { unread: 1 })
    setThreadMenuId(null)
    setGroupSubmenu(null)
    showToast('Als ungelesen markiert')
  }

  function markRead(id: string) {
    patchConversation(id, { unread: 0 })
    setThreadMenuId(null)
    setGroupSubmenu(null)
    showToast('Als gelesen markiert')
  }

  function addChatToGroup(chatId: string, listId?: string) {
    if (listId) {
      void toggleChatInList(listId, chatId)
      return
    }
    setGroupSubmenu(null)
    setThreadMenuId(null)
    setNewGroupName('')
    setNewGroupForChat(chatId)
  }

  function confirmNewGroup() {
    if (!newGroupForChat) return
    const name = newGroupName.trim() || 'Neue Gruppe'
    void createChatList(name, newGroupForChat)
    setNewGroupForChat(null)
    setNewGroupName('')
  }

  function blockChat(id: string) {
    const chat = conversations.find((c) => c.id === id)
    const next = !chat?.blocked
    patchConversation(id, { blocked: next })
    setThreadMenuId(null)
    if (next && chat && isAnnaBotChat(chat)) {
      annaGenRef.current += 1
      clearAnnaTimers()
      setContactTyping(id, false)
    }
    showToast(next ? 'Kontakt blockiert' : 'Blockierung aufgehoben')
  }

  function deleteChat(id: string) {
    if (IS_OPERATOR_RUNTIME) {
      setThreadMenuId(null)
      setOperatorDeleteTarget({ kind: 'conversation', conversationId: id })
      return
    }
    setConversations((prev) => {
      const next = prev.filter((c) => c.id !== id)
      if (activeId === id) {
        setActiveId(next[0]?.id ?? '')
        if (!next[0]) setMobilePane('list')
      }
      return next
    })
    setChatLists((prev) =>
      prev.map((list) => ({
        ...list,
        chatIds: list.chatIds.filter((cid) => cid !== id),
      })),
    )
    setThreadMenuId(null)
    showToast('Chat gelöscht')
  }

  function toggleConversationSelection(id: string) {
    const conversation = conversationsRef.current.find((item) => item.id === id)
    if (!conversation || conversation.systemRole === 'info') return
    setSelectedConversationIds((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    )
  }

  function openChatContextMenu(event: ReactMouseEvent<HTMLDivElement>, conversationId: string) {
    const conversation = conversationsRef.current.find((item) => item.id === conversationId)
    if (!conversation || conversation.systemRole === 'info') return
    event.preventDefault()
    setThreadMenuId(null)
    setGroupSubmenu(null)
    setChatContextMenu({
      conversationId,
      top: Math.max(8, Math.min(event.clientY, window.innerHeight - 112)),
      left: Math.max(8, Math.min(event.clientX, window.innerWidth - 224)),
    })
  }

  function beginConversationSelection(conversationId: string) {
    setChatContextMenu(null)
    setThreadMenuId(null)
    setGroupSubmenu(null)
    setFilterMenu(null)
    setSelectionMode(true)
    setSelectedConversationIds((current) =>
      current.includes(conversationId) ? current : [...current, conversationId],
    )
  }

  function startConversationSelection() {
    setChatContextMenu(null)
    setThreadMenuId(null)
    setGroupSubmenu(null)
    setFilterMenu(null)
    // A selection always operates on the direct-chat list.  Leaving the
    // groups overview visible here created an empty selection state with no
    // chats to mark, particularly on phones where only one pane is shown.
    setChatFilter({ kind: 'all' })
    setGroupOverviewOpen(false)
    setActiveGroupId(null)
    setMobilePane('list')
    setSelectionMode(true)
  }

  function cancelConversationSelection() {
    setSelectedConversationIds([])
    setSelectionMode(false)
    setBulkGroupManageOpen(false)
  }

  function markSelectedConversationsUnread(unread: number) {
    const ids = selectedConversationIds
    if (!ids.length) return
    ids.forEach((id) => patchConversation(id, { unread }))
    showToast(unread ? `${ids.length} Chat${ids.length === 1 ? '' : 's'} als ungelesen markiert` : `${ids.length} Chat${ids.length === 1 ? '' : 's'} als gelesen markiert`)
  }

  async function removeSelectedConversationsFromGroup(groupId: string) {
    const group = chatLists.find((item) => item.id === groupId)
    if (!group) return
    const ids = selectedConversationIds.filter((id) => group.chatIds.includes(id))
    if (!ids.length) return

    try {
      if (IS_OPERATOR_RUNTIME) {
        let latest = group
        for (const conversationId of ids) {
          const updated = await operatorApi.removeChatFromGroup(groupId, conversationId)
          if (updated) latest = updated
        }
        setChatLists((current) => current.map((item) => (item.id === groupId ? latest : item)))
      } else {
        setChatLists((current) => current.map((item) =>
          item.id === groupId
            ? { ...item, chatIds: item.chatIds.filter((id) => !ids.includes(id)) }
            : item,
        ))
      }
      showToast(`${ids.length} Chat${ids.length === 1 ? '' : 's'} aus „${group.name}“ gelöst`)
    } catch (error) {
      showToast(error instanceof OperatorApiError ? error.message : 'Die Chats konnten nicht aus der Gruppe gelöst werden.')
    }
  }

  async function addSelectedConversationsToGroup(groupId: string, ids = selectedConversationIds) {
    if (!ids.length) return
    const group = chatLists.find((item) => item.id === groupId)
    if (!group) return
    try {
      if (IS_OPERATOR_RUNTIME) {
        let latest = group
        for (const conversationId of ids) {
          if (latest.chatIds.includes(conversationId)) continue
          const updated = await operatorApi.addChatToGroup(groupId, conversationId)
          if (updated) latest = updated
        }
        setChatLists((current) => current.map((item) => (item.id === groupId ? latest : item)))
      } else {
        setChatLists((current) => current.map((item) =>
          item.id === groupId
            ? { ...item, chatIds: [...new Set([...item.chatIds, ...ids])] }
            : item,
        ))
      }
      setSelectedConversationIds([])
      setSelectionMode(false)
      showToast(`${ids.length} Chat${ids.length === 1 ? '' : 's'} zu „${group.name}“ hinzugefügt`)
    } catch (error) {
      showToast(error instanceof OperatorApiError ? error.message : 'Die Chats konnten nicht gruppiert werden.')
    }
  }

  async function groupSelectedConversations() {
    const ids = selectedConversationIds
    const name = bulkGroupName.trim()
    if (!ids.length) return
    if (bulkGroupExistingId) {
      await addSelectedConversationsToGroup(bulkGroupExistingId, ids)
      setBulkGroupDialogOpen(false)
      setBulkGroupExistingId('')
      return
    }
    if (!name) {
      showToast('Bitte gib einen Namen für die Kundengruppe ein.')
      return
    }
    try {
      if (IS_OPERATOR_RUNTIME) {
        const created = await operatorApi.createChatGroup(name, ids[0])
        if (!created) throw new Error('CHAT_GROUP_CREATE_FAILED')
        let latest = created
        for (const conversationId of ids.slice(1)) {
          const updated = await operatorApi.addChatToGroup(created.id, conversationId)
          if (updated) latest = updated
        }
        setChatLists((current) => [...current, latest])
      } else {
        setChatLists((current) => [...current, {
          id: `list-${Date.now()}`,
          name,
          chatIds: ids,
        }])
      }
      setSelectedConversationIds([])
      setSelectionMode(false)
      setBulkGroupDialogOpen(false)
      setBulkGroupName('')
      showToast(`Kundengruppe „${name}“ erstellt`)
    } catch (error) {
      showToast(error instanceof OperatorApiError ? error.message : 'Die Kundengruppe konnte nicht erstellt werden.')
    }
  }

  function requestBulkConversationDeletion() {
    if (!selectedConversationIds.length) return
    setBulkDeleteIds(selectedConversationIds)
  }

  async function confirmBulkConversationDeletion() {
    const ids = bulkDeleteIds
    if (!ids?.length || bulkDeleteBusy) return
    const selected = conversationsRef.current.filter((item) => ids.includes(item.id))
    if (selected.length !== ids.length) {
      setBulkDeleteIds(null)
      showToast('Die Auswahl hat sich geändert. Bitte prüfe sie erneut.')
      return
    }
    setBulkDeleteBusy(true)
    try {
      if (IS_OPERATOR_RUNTIME) {
        await operatorApi.deleteConversations(selected.map((item) => ({
          conversationId: item.id,
          version: item.version,
        })))
      }
      setConversations((current) => {
        const next = current.filter((item) => !ids.includes(item.id))
        conversationsRef.current = next
        if (ids.includes(activeIdRef.current)) {
          const nextId = next.find((item) => item.systemRole !== 'info')?.id ?? next[0]?.id ?? ''
          setActiveId(nextId)
          setSelectedOrderId(nextId)
          if (!nextId) setMobilePane('list')
        }
        return next
      })
      setChatLists((current) => current.map((group) => ({
        ...group,
        chatIds: group.chatIds.filter((id) => !ids.includes(id)),
      })))
      setSelectedConversationIds([])
      setSelectionMode(false)
      setBulkDeleteIds(null)
      showToast(`${ids.length} Chat${ids.length === 1 ? '' : 's'} einschließlich lokaler Aufträge und Medien gelöscht`)
    } catch (error) {
      showToast(error instanceof OperatorApiError && error.status === 409
        ? 'Ein Chat wurde inzwischen geändert. Bitte aktualisiere die Ansicht und prüfe die Auswahl erneut.'
        : 'Löschen war nicht möglich. Die Auswahl bleibt erhalten.')
    } finally {
      setBulkDeleteBusy(false)
    }
  }

  function requestOperatorMessageDeletion(messageId: string) {
    if (!IS_OPERATOR_RUNTIME || !active.id) return
    setDeleteIds(null)
    setSelectedMsgIds((prev) => prev.filter((id) => id !== messageId))
    setMsgMenuId(null)
    setSelectMode(false)
    setOperatorDeleteTarget({
      kind: 'message',
      conversationId: active.id,
      messageId,
    })
  }

  async function confirmOperatorDeletion() {
    const target = operatorDeleteTarget
    if (!target || !IS_OPERATOR_RUNTIME || operatorDeleteBusy) return
    const conversation = conversationsRef.current.find((item) => item.id === target.conversationId)
    setOperatorDeleteBusy(true)
    try {
      if (target.kind === 'message') {
        await operatorApi.deleteMessage(target.conversationId, target.messageId, conversation?.version)
        setConversations((prev) => {
          const next = prev.map((item) => {
            if (item.id !== target.conversationId) return item
            const messages = item.messages.filter((message) => message.id !== target.messageId)
            const last = messages.at(-1)
            return {
              ...item,
              messages,
              lastPreview: last ? messagePreview(last) : '',
              lastAt: last?.at ?? '',
            }
          })
          conversationsRef.current = next
          return next
        })
        showToast('Nachricht wurde in Kundenzettel gelöscht.')
      } else {
        await operatorApi.deleteConversation(target.conversationId, conversation?.version)
        setConversations((prev) => {
          const next = prev.filter((item) => item.id !== target.conversationId)
          conversationsRef.current = next
          if (activeIdRef.current === target.conversationId) {
            const nextId = next[0]?.id ?? ''
            setActiveId(nextId)
            setSelectedOrderId(nextId)
            if (!nextId) setMobilePane('list')
          }
          return next
        })
        showToast('Chat, Auftrag und lokale Medien wurden in Kundenzettel gelöscht.')
      }
      setOperatorDeleteTarget(null)
    } catch (error) {
      if (error instanceof OperatorApiError && error.status === 409) {
        showToast('Der Chat wurde inzwischen geändert. Bitte Ansicht aktualisieren und erneut prüfen.')
      } else {
        showToast('Löschen war nicht möglich. Die Daten bleiben unverändert.')
      }
    } finally {
      setOperatorDeleteBusy(false)
    }
  }

  function updateField<K extends keyof Conversation['structured']>(
    key: K,
    value: Conversation['structured'][K],
  ) {
    if (!active.id) return
    setConversations((prev) =>
      prev.map((c) =>
        c.id === active.id
          ? { ...c, structured: { ...c.structured, [key]: value } }
        : c,
      ),
    )
    scheduleOrderPersist(active.id, {
      structured: { [key]: value },
    })
  }

  function setStatus(status: OrderStatus, conversationId = active.id) {
    if (!conversationId) return
    setConversations((prev) =>
      prev.map((c) => (c.id === conversationId ? { ...c, status } : c)),
    )
    scheduleOrderPersist(conversationId, { status })
    const group = semanticGroupLabel[getSemanticGroup(status)]
    showToast(`Status: ${group}`)
  }

  function setSemanticStatus(group: SemanticGroup) {
    // Bereits in der Gruppe: feineren OrderStatus behalten
    if (getSemanticGroup(active.status) === group) {
      setStatusMenuOpen(false)
      return
    }
    setStatus(semanticGroupToStatus[group])
    setStatusMenuOpen(false)
  }

  function mergeOperatorMessage(
    conversationId: string,
    clientMessageId: string,
    serverMessage: Message,
  ) {
    setConversations((prev) => {
      const next = prev.map((conversation) => {
        if (conversation.id !== conversationId) return conversation
        const messages = conversation.messages.map((message) =>
          message.id === clientMessageId ? serverMessage : message,
        )
        const last = messages[messages.length - 1]
        return {
          ...conversation,
          messages,
          lastPreview: last ? messagePreview(last) : conversation.lastPreview,
          lastAt: last?.at ?? conversation.lastAt,
        }
      })
      conversationsRef.current = next
      return next
    })
  }

  function markOperatorMessageFailed(
    conversationId: string,
    messageId: string,
    error: string,
  ) {
    setConversations((prev) => {
      const next = prev.map((conversation) =>
        conversation.id !== conversationId
          ? conversation
          : {
              ...conversation,
              messages: conversation.messages.map((item) =>
                item.id === messageId
                  ? { ...item, status: 'failed' as const, error }
                  : item,
              ),
            },
      )
      conversationsRef.current = next
      return next
    })
  }

  async function deliverOperatorMessage(
    conversationId: string,
    outgoing: Message,
    mediaFile: File | undefined,
  ) {
    try {
      let media
      if (mediaFile) {
        media = await operatorApi.uploadMedia(mediaFile)
      } else if (outgoing.kind !== 'text') {
        throw new OperatorApiError(
          'Diese Mediendatei muss vor dem Versand ausgewählt oder aufgenommen werden.',
        400,
        )
      }
      const result = await operatorApi.sendMessage(conversationId, {
        clientMessageId: outgoing.id,
        kind: outgoing.kind,
        text: outgoing.text,
        transcript: outgoing.transcript,
        documentName: outgoing.documentName,
        duration: outgoing.duration,
        replyToMessageId: outgoing.replyTo?.id,
        media,
      })
      if (result.conversation) {
        applyOperatorConversation(result.conversation)
      } else if (result.message) {
        mergeOperatorMessage(conversationId, outgoing.id, result.message)
      }
    } catch (error) {
      const message =
        error instanceof OperatorApiError
          ? error.message
          : 'Nachricht konnte nicht an WhatsApp übergeben werden.'
      markOperatorMessageFailed(conversationId, outgoing.id, message)
      showToast(message)
    }
  }

  function sendOutgoing(message: OutgoingMessage) {
    if (!active.id) return
    const { mediaFile, ...messageData } = message
    const now = new Date()
    const at = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
    const preview =
      messageData.kind === 'text'
        ? (messageData.text ?? '')
        : messageData.kind === 'voice'
          ? 'Sprachnachricht'
          : messageData.kind === 'image'
            ? 'Bild'
            : messageData.kind === 'video'
              ? 'Video'
              : messageData.kind === 'document'
                ? (messageData.documentName ?? 'Dokument')
                : 'Nachricht'
    const withReply =
      replyTo && messageData.kind === 'text'
        ? {
            ...messageData,
            replyTo: {
              id: replyTo.externalId ?? replyTo.id,
              preview: messagePreview(replyTo).slice(0, 120),
              from: replyTo.from,
            },
          }
        : messageData
    const outgoing: Message = {
      ...withReply,
      id: `out-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      from: 'atelier',
      at,
      createdAt: now.toISOString(),
      status: IS_OPERATOR_RUNTIME ? 'queued' : 'read',
    }
    const current =
      conversationsRef.current.find((c) => c.id === active.id) ?? active
    const nextConversation: Conversation = {
      ...current,
      lastAt: at,
      lastPreview: preview,
      messages: [...current.messages, outgoing],
    }
    conversationsRef.current = conversationsRef.current.map((c) =>
      c.id === current.id ? nextConversation : c,
    )
    setConversations((prev) =>
      prev.map((c) => (c.id === active.id ? nextConversation : c)),
    )
    setReplyTo(null)
    const toastByKind: Record<Message['kind'], string> = {
      text: 'Über WhatsApp gesendet',
      voice: 'Sprachnachricht gesendet',
      image: 'Bild gesendet',
      video: 'Video gesendet',
      document: 'Dokument gesendet',
    }
    if (IS_OPERATOR_RUNTIME) {
      showToast('Nachricht wird an WhatsApp übergeben …')
      void deliverOperatorMessage(current.id, outgoing, mediaFile)
      return
    }
    showToast(toastByKind[messageData.kind] ?? 'Gesendet')
    queueAnnaReply(nextConversation)
  }

  function forwardMessagesToChat(targetChatId: string, messageIds: string[]) {
    const sourceChat =
      conversations.find((c) =>
        c.messages.some((m) => messageIds.includes(m.id)),
      ) ?? active
    const sources = sourceChat.messages.filter((m) => messageIds.includes(m.id))
    if (!sources.length) return
    const now = new Date()
    const at = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
    const clones: Message[] = sources.map((m, i) => ({
      ...m,
      id: `fwd-${Date.now()}-${i}`,
      from: 'atelier',
      at,
      status: 'read',
      forwarded: true,
      replyTo: undefined,
      reactions: undefined,
    }))
    const last = clones[clones.length - 1]
    setConversations((prev) =>
      prev.map((c) =>
        c.id !== targetChatId
          ? c
          : {
              ...c,
              lastAt: at,
              lastPreview: messagePreview(last),
              unread: c.id === activeId ? 0 : c.unread + clones.length,
              messages: [...c.messages, ...clones],
            },
      ),
    )
    setForwardIds(null)
    setSelectMode(false)
    setSelectedMsgIds([])
    setMsgMenuId(null)
    if (targetChatId !== activeId) {
      setActiveId(targetChatId)
      setMobilePane('chat')
    }
    showToast(
      clones.length > 1
        ? `${clones.length} Nachrichten weitergeleitet`
        : 'Nachricht weitergeleitet',
    )
  }

  /** Weiterleiten ohne zweiten Kontakt: Kopie als „Weitergeleitet“ im aktuellen Chat. */
  function forwardInCurrentChat(messageIds: string[]) {
    forwardMessagesToChat(active.id, messageIds)
  }

  function askMetaAi(message: Message) {
    const preview = messagePreview(message)
    const suggestion =
      message.from === 'kunde'
        ? `Danke dir! Zu „${preview.slice(0, 70)}${preview.length > 70 ? '…' : ''}“: ${
            active.structured.termin
              ? `Der Termin (${active.structured.termin}) steht. `
              : ''
          }Soll ich noch etwas anpassen?`
        : `Kurz dazu („${preview.slice(0, 60)}${preview.length > 60 ? '…' : ''}“): Alles klar — ich melde mich mit dem nächsten Schritt.`
    setReplyTo(message)
    setComposerDraftSeed(suggestion)
    setComposerFocusNonce((n) => n + 1)
    setMsgMenuId(null)
    showToast('Meta-AI-Vorschlag übernommen')
  }

  function patchMessage(messageId: string, patch: Partial<Message>) {
    setConversations((prev) =>
      prev.map((c) =>
        c.id !== active.id
          ? c
          : {
              ...c,
              messages: c.messages.map((m) =>
                m.id === messageId ? { ...m, ...patch } : m,
              ),
            },
      ),
    )
  }

  function reactToMessage(messageId: string, emoji: string) {
    const current = active.messages.find((m) => m.id === messageId)?.reactions ?? []
    const removing = current.includes(emoji)
    setConversations((prev) =>
      prev.map((c) => {
        if (c.id !== active.id) return c
        return {
          ...c,
          messages: c.messages.map((m) => {
            if (m.id !== messageId) return m
            const list = m.reactions ?? []
            const next = list.includes(emoji)
              ? list.filter((e) => e !== emoji)
              : [...list.filter((e) => e !== emoji), emoji]
            return { ...m, reactions: next }
          }),
        }
      }),
    )
    setMsgMenuId(null)
    showToast(removing ? 'Reaktion entfernt' : `Reaktion ${emoji}`)
  }

  function deleteMessagesForMe(ids: string[]) {
    if (!ids.length) return
    setConversations((prev) =>
      prev.map((c) =>
        c.id !== active.id
          ? c
          : { ...c, messages: c.messages.filter((m) => !ids.includes(m.id)) },
      ),
    )
    setSelectedMsgIds((prev) => prev.filter((id) => !ids.includes(id)))
    setMsgMenuId(null)
    setDeleteIds(null)
    setSelectMode(false)
    showToast(
      ids.length > 1 ? 'Nachrichten gelöscht' : 'Nachricht gelöscht',
    )
  }

  function deleteMessagesForEveryone(ids: string[]) {
    if (!ids.length) return
    setConversations((prev) =>
      prev.map((c) => {
        if (c.id !== active.id) return c
        const messages = c.messages.map((m) => {
          if (!ids.includes(m.id)) return m
          return {
            id: m.id,
            from: m.from,
            kind: 'text' as const,
            at: m.at,
            status: m.status,
            deletedForEveryone: true,
          }
        })
        const last = messages[messages.length - 1]
        return {
          ...c,
          messages,
          lastPreview: last ? messagePreview(last) : c.lastPreview,
        }
      }),
    )
    setSelectedMsgIds((prev) => prev.filter((id) => !ids.includes(id)))
    setMsgMenuId(null)
    setDeleteIds(null)
    setSelectMode(false)
    showToast(
      ids.length > 1 ? 'Nachrichten gelöscht' : 'Nachricht gelöscht',
    )
  }

  function sendReply(text: string) {
    const content = text.trim()
    if (!content) return
    sendOutgoing({ kind: 'text', text: content })
  }

  async function confirmOrder() {
    if (!active.id || archivingOrder) return
    if (!active.structured.produkt.trim()) {
      showToast('Bitte mindestens das Werkstück prüfen, bevor du den Auftrag erstellst.')
      return
    }
    const sourceMessages = active.messages.slice(draftStartByConversation[active.id] ?? 0)
    if (!sourceMessages.length) {
      showToast('Für einen neuen Auftrag fehlen noch Chatnachrichten im aktuellen Abschnitt.')
      return
    }
    setArchivingOrder(true)
    try {
      if (IS_OPERATOR_RUNTIME) {
        const result = await operatorApi.archiveOrder(active.id, active.version)
        if (!result.order || !result.conversation) {
          throw new OperatorApiError('Der Auftrag konnte nicht archiviert werden.')
        }
        applyOperatorConversation(result.conversation)
        setArchivedOrdersByConversation((previous) => ({
          ...previous,
          [active.id]: [result.order!, ...(previous[active.id] ?? [])],
        }))
      } else {
        const now = new Date().toISOString()
        const archive: ArchivedOrder = {
          id: `archive-${Date.now()}`,
          conversationId: active.id,
          orderNumber: `KZ-DEMO-${String((archivedOrdersByConversation[active.id]?.length ?? 0) + 1).padStart(3, '0')}`,
          sequence: (archivedOrdersByConversation[active.id]?.length ?? 0) + 1,
          status: active.status,
          structured: { ...active.structured },
          source: {
            startMessageId: sourceMessages[0]?.id,
            endMessageId: sourceMessages.at(-1)?.id,
            startAt: sourceMessages[0]?.createdAt,
            endAt: sourceMessages.at(-1)?.createdAt,
            messageCount: sourceMessages.length,
            snapshot: sourceMessages.map((message) => ({
              id: message.id,
              ...(message.externalId ? { externalId: message.externalId } : {}),
              direction: message.from === 'kunde' ? 'inbound' : 'outbound',
              kind: message.kind,
              text: message.text ?? message.transcript ?? messagePreview(message),
              createdAt: message.createdAt ?? now,
            })),
          },
          createdAt: now,
          archivedAt: now,
        }
        setArchivedOrdersByConversation((previous) => ({
          ...previous,
          [active.id]: [archive, ...(previous[active.id] ?? [])],
        }))
        setDraftStartByConversation((previous) => ({
          ...previous,
          [active.id]: active.messages.length,
        }))
        setConversations((previous) => {
          const next = previous.map((conversation) =>
            conversation.id === active.id
              ? {
                  ...conversation,
                  status: 'anfrage' as const,
                  structured: emptyStructuredOrder({ kanal: 'WhatsApp' }),
                }
              : conversation,
          )
          conversationsRef.current = next
          return next
        })
      }
      showToast('Auftrag archiviert. Der nächste Chatabschnitt ist ein neuer Entwurf.')
    } catch (error) {
      if (error instanceof OperatorApiError && error.status === 409) {
        showToast('Der Chat wurde inzwischen geändert. Bitte Ansicht aktualisieren und erneut prüfen.')
      } else {
        showToast('Auftrag konnte nicht archiviert werden. Der Live-Entwurf bleibt erhalten.')
      }
    } finally {
      setArchivingOrder(false)
    }
  }

  async function beginNewOrderDraft() {
    const boundary = active.messages.at(-1)
    if (!active.id || !boundary || archivingOrder) {
      showToast('Zum Trennen des Entwurfs wird mindestens eine Chatnachricht benötigt.')
      return
    }
    setArchivingOrder(true)
    try {
      if (IS_OPERATOR_RUNTIME) {
        const result = await operatorApi.startOrderDraftAfterMessage(active.id, boundary.id, active.version)
        if (!result.conversation) {
          throw new OperatorApiError('Der neue Auftragsentwurf konnte nicht vorbereitet werden.')
        }
        applyOperatorConversation(result.conversation)
      } else {
        setDraftStartByConversation((previous) => ({
          ...previous,
          [active.id]: active.messages.length,
        }))
        setConversations((previous) => {
          const next = previous.map((conversation) =>
            conversation.id === active.id
              ? {
                  ...conversation,
                  status: 'anfrage' as const,
                  structured: emptyStructuredOrder({ kanal: 'WhatsApp' }),
                }
              : conversation,
          )
          conversationsRef.current = next
          return next
        })
      }
      showToast('Neuer Entwurf vorbereitet. Erst die nächste Nachricht gehört zum neuen Auftrag.')
    } catch (error) {
      if (error instanceof OperatorApiError && error.status === 409) {
        showToast('Der Chat wurde inzwischen geändert. Bitte Ansicht aktualisieren und erneut prüfen.')
      } else {
        showToast('Der neue Auftragsentwurf konnte nicht vorbereitet werden.')
      }
    } finally {
      setArchivingOrder(false)
    }
  }

  function addReminder() {
    setTodos((prev) => [
      {
        id: `t-${Date.now()}`,
        title: `Nachfassen: ${active.kunde} · ${active.structured.produkt}`,
        relatedTo: active.kunde,
        due: 'Morgen · 09:30',
        done: false,
        kind: 'reminder',
      },
      ...prev,
    ])
    showToast('Erinnerung angelegt')
    goToView('agenda')
  }

  async function createChatList(name: string, assignChatId?: string) {
    const trimmed = name.trim()
    if (!trimmed) return
    if (IS_OPERATOR_RUNTIME) {
      try {
        const group = await operatorApi.createChatGroup(trimmed, assignChatId)
        if (!group) throw new Error('CHAT_GROUP_CREATE_FAILED')
        setChatLists((prev) => [...prev, group])
        setChatFilter({ kind: 'all' })
        setActiveGroupId(group.id)
        setGroupOverviewOpen(false)
        setMobilePane('chat')
        setNewListName('')
        setListMenuOpen(false)
        showToast(`Gruppe „${trimmed}“ erstellt`)
      } catch (error) {
        showToast(
          error instanceof OperatorApiError
            ? error.message
            : 'Die Gruppe konnte nicht erstellt werden.',
        )
      }
      return
    }
    const id = `list-${Date.now()}`
    setChatLists((prev) => [
      ...prev,
      { id, name: trimmed, chatIds: assignChatId ? [assignChatId] : [] },
    ])
    setChatFilter({ kind: 'all' })
    setActiveGroupId(id)
    setGroupOverviewOpen(false)
    setMobilePane('chat')
    setNewListName('')
    setListMenuOpen(false)
    showToast(`Gruppe „${trimmed}“ erstellt`)
  }

  async function toggleChatInList(listId: string, chatId: string) {
    const list = chatLists.find((item) => item.id === listId)
    const wasMember = Boolean(list?.chatIds.includes(chatId))
    if (!list) return
    if (IS_OPERATOR_RUNTIME) {
      try {
        const group = wasMember
          ? await operatorApi.removeChatFromGroup(listId, chatId)
          : await operatorApi.addChatToGroup(listId, chatId)
        if (!group) throw new Error('CHAT_GROUP_MEMBERSHIP_FAILED')
        setChatLists((prev) => prev.map((item) => (item.id === group.id ? group : item)))
        showToast(wasMember ? 'Aus Gruppe entfernt' : 'Zur Gruppe hinzugefügt')
      } catch (error) {
        showToast(
          error instanceof OperatorApiError
            ? error.message
            : 'Die Gruppenzuordnung konnte nicht geändert werden.',
        )
      }
      return
    }
    setChatLists((prev) =>
      prev.map((list) => {
        if (list.id !== listId) return list
        const has = list.chatIds.includes(chatId)
        return {
          ...list,
          chatIds: has
            ? list.chatIds.filter((id) => id !== chatId)
            : [...list.chatIds, chatId],
        }
      }),
    )
    showToast(wasMember ? 'Aus Gruppe entfernt' : 'Zur Gruppe hinzugefügt')
  }

  async function deleteChatList(listId: string): Promise<boolean> {
    if (IS_OPERATOR_RUNTIME) {
      try {
        await operatorApi.deleteChatGroup(listId)
      } catch (error) {
        showToast(
          error instanceof OperatorApiError
            ? error.message
            : 'Die Gruppe konnte nicht aufgelöst werden.',
        )
        return false
      }
    }
    setChatLists((prev) => prev.filter((l) => l.id !== listId))
    setChatChannels((previous) => previous
      .map((channel) => ({ ...channel, groupIds: channel.groupIds.filter((id) => id !== listId) }))
      .filter((channel) => channel.groupIds.length > 0))
    if (chatFilter.kind === 'list' && chatFilter.listId === listId) {
      setChatFilter({ kind: 'all' })
    }
    if (activeGroupId === listId) {
      setActiveGroupId(null)
      setGroupOverviewOpen(true)
      setMobilePane('list')
    }
    setThreadMenuId(null)
    setGroupSubmenu(null)
    showToast('Gruppe aufgelöst')
    return true
  }

  async function confirmGroupDissolve() {
    if (!groupDissolveTarget || groupDissolveBusy) return
    setGroupDissolveBusy(true)
    try {
      const dissolved = await deleteChatList(groupDissolveTarget)
      if (!dissolved) return
      setGroupDissolveTarget(null)
      setBulkGroupManageOpen(false)
    } finally {
      setGroupDissolveBusy(false)
    }
  }

  function createChannel() {
    const name = newChannelName.trim()
    if (!name || newChannelGroupIds.length === 0) {
      showToast('Bitte wähle einen Namen und mindestens eine Gruppe.')
      return
    }
    setChatChannels((previous) => [
      ...previous,
      { id: `channel-${Date.now()}`, name, groupIds: newChannelGroupIds },
    ])
    setNewChannelOpen(false)
    setNewChannelName('')
    setNewChannelGroupIds([])
    showToast(`Kanal „${name}“ erstellt`)
  }

  function publishAnnouncement() {
    const title = announcementTitle.trim()
    const text = announcementText.trim()
    if (!title || !text) {
      showToast('Bitte gib Titel und Nachricht ein.')
      return
    }
    if ((announcementAudience === 'group' || announcementAudience === 'channel') && !announcementTargetId) {
      showToast('Bitte wähle den Empfängerkreis aus.')
      return
    }
    const audienceLabel = announcementAudience === 'all'
      ? 'Alle Kontakte'
      : announcementAudience === 'group'
        ? chatLists.find((group) => group.id === announcementTargetId)?.name || 'Ausgewählte Gruppe'
        : announcementAudience === 'channel'
          ? chatChannels.find((channel) => channel.id === announcementTargetId)?.name || 'Ausgewählter Kanal'
          : `${announcementContactIds.length} ausgewählte Kontakte`
    if (announcementAudience === 'contacts' && announcementContactIds.length === 0) {
      showToast('Bitte wähle mindestens einen Kontakt.')
      return
    }
    setAnnouncements((previous) => [{
      id: `announcement-${Date.now()}`,
      title,
      text,
      audienceLabel,
      createdAt: new Date().toISOString(),
    }, ...previous])
    setAnnouncementOpen(false)
    setAnnouncementTitle('')
    setAnnouncementText('')
    setAnnouncementTargetId('')
    setAnnouncementContactIds([])
    showToast('Ankündigung veröffentlicht')
  }

  function isFilterActive(filter: ChatFilter) {
    if (filter.kind !== chatFilter.kind) return false
    if (filter.kind === 'semantic' && chatFilter.kind === 'semantic') {
      return filter.group === chatFilter.group
    }
    if (filter.kind === 'list' && chatFilter.kind === 'list') {
      return filter.listId === chatFilter.listId
    }
    return true
  }

  void setContactTyping

  return (
    <div className={`app app-view-${view}`}>
      <header className="topbar">
        {headerSearchOpen && !preciseHeaderSearch ? (
          <div className="topbar-search-replace">
            <a className="topbar-search-brand" href={landingHomeUrl(window.location.hostname)} aria-label={`${PRODUCT_NAME} – zur Startseite`}>
              <img src="/brand/kundenzettel-mark.png" alt="" />
              <span>{PRODUCT_NAME}</span>
            </a>
            <div className="topbar-search-field" ref={headerSearchWrapRef}>
              <input
                ref={headerSearchRef}
                className="header-search-input topbar-search-replace-input"
                type="search"
                value={headerQuery}
                onChange={(e) => {
                  setHeaderQuery(e.target.value)
                  setHeaderHitIndex(-1)
                }}
                placeholder="Website durchsuchen"
                aria-label="Website durchsuchen"
                aria-autocomplete="list"
                aria-expanded={headerQuery.trim() !== ''}
                aria-controls="header-search-results"
                autoComplete="off"
                onKeyDown={onHeaderSearchKeyDown}
              />
              {headerQuery.trim() !== '' && (
                <div
                  id="header-search-results"
                  className="header-search-results topbar-search-replace-results"
                  role="listbox"
                  aria-label="Suchvorschläge"
                >
                  {headerHits.length === 0 ? (
                    <p className="header-search-empty">
                      Keine Treffer zu „{headerQuery.trim()}“
                    </p>
                  ) : (
                    headerHits.map((hit, index) => (
                      <Fragment key={hit.key}>
                        {(index === 0 ||
                          headerHits[index - 1]?.section !== hit.section) && (
                          <p className="header-search-section">{hit.section}</p>
                        )}
                        <button
                          type="button"
                          role="option"
                          aria-selected={index === headerHitIndex}
                          className={`header-search-hit${index === headerHitIndex ? ' is-active' : ''}`}
                          onMouseEnter={() => setHeaderHitIndex(index)}
                          onClick={() => activateHeaderHit(hit)}
                        >
                          <span
                            className="avatar sm"
                            style={{
                              background: `hsl(${(index * 48 + 20) % 360} 28% 42%)`,
                            }}
                          >
                            {initials(hit.title)}
                          </span>
                          <span className="header-search-hit-meta">
                            <strong>{hit.title}</strong>
                            <span>{hit.subtitle}</span>
                          </span>
                        </button>
                      </Fragment>
                    ))
                  )}
                </div>
              )}
            </div>
            <button
              type="button"
              className="icon-btn topbar-search-close"
              aria-label="Suche schließen"
              title="Schließen"
              onClick={closeHeaderSearch}
            >
              <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden>
                <path
                  d="M4 4l8 8M12 4l-8 8"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          </div>
        ) : (
        <div
          ref={topbarMainRef}
          className={`topbar-main${headerSearchOpen ? ' is-searching' : ''}${
            singlePane ? ' is-compact' : ''
          }${!preciseHeaderSearch ? ' is-narrow' : ''}`}
          style={
            headerSearchOpen && preciseHeaderSearch
              ? ({
                  ['--logo-zone-width' as string]: `${headerSearchLayout.logoZoneWidth}px`,
                  ['--nav-zone-width' as string]: `${headerSearchLayout.navWidth}px`,
                  ['--search-input-width' as string]: `${headerSearchLayout.inputWidth}px`,
                } as CSSProperties)
              : undefined
          }
        >
          <div className="topbar-logo-zone">
            <a
              className="brand"
              href={landingHomeUrl(window.location.hostname)}
              aria-label={`${PRODUCT_NAME} – zur Startseite`}
            >
              <img src={brandWordmarkUrl} alt={PRODUCT_NAME} />
            </a>
            <a
              href={`mailto:${INTEREST_EMAIL}`}
              className="interest-header-btn"
              aria-label="Kontakt aufnehmen"
              title="Kontakt aufnehmen"
              onClick={(event) => {
                if (!window.matchMedia('(max-width: 899.98px)').matches) {
                  event.preventDefault()
                  openInterestLead()
                }
              }}
            >
              <span className="interest-header-icon" aria-hidden>
                <svg viewBox="0 0 20 20">
                  <path d="M3.2 5.25h13.6v9.5H3.2z" />
                  <path d="m3.8 6 6.2 4.75L16.2 6" />
                </svg>
              </span>
              <span className="interest-header-label">Kontakt</span>
            </a>
          </div>

          <nav className="nav" aria-label="Hauptnavigation">
            <button
              type="button"
              className="is-locked"
              disabled
              title="Derzeit in Entwicklung"
              aria-label="Home – derzeit in Entwicklung"
            >
              Home
              <span className="nav-lock" aria-hidden>
                <IconNavLock />
              </span>
            </button>
            <button
              type="button"
              className={view === 'whatsapp' ? 'is-on' : ''}
              onClick={() => goToView('whatsapp')}
            >
              WhatsApp
              {unread > 0 && <span className="count">{unread}</span>}
            </button>
            {(['auftraege', 'agenda', 'kunden', 'kollektion'] as const).map((lockedView) => (
              <button
                key={lockedView}
                type="button"
                className="is-locked"
                disabled
                title="Derzeit in Entwicklung"
                aria-label={`${
                  lockedView === 'auftraege'
                    ? 'Aufträge'
                    : lockedView === 'agenda'
                      ? 'Agenda'
                      : lockedView === 'kunden'
                        ? 'Kunden'
                        : 'Kollektion'
                } – derzeit in Entwicklung`}
              >
                {lockedView === 'auftraege'
                  ? 'Aufträge'
                  : lockedView === 'agenda'
                    ? 'Agenda'
                    : lockedView === 'kunden'
                      ? 'Kunden'
                      : 'Kollektion'}
                <span className="nav-lock" aria-hidden>
                  <IconNavLock />
                </span>
              </button>
            ))}
          </nav>

          <div className="topbar-tools">
            <div
              ref={headerSearchWrapRef}
              className={`header-search${headerSearchOpen ? ' is-open' : ''}`}
            >
              <input
                ref={headerSearchRef}
                className="header-search-input"
                type="search"
                value={headerQuery}
                onChange={(e) => {
                  setHeaderQuery(e.target.value)
                  setHeaderHitIndex(-1)
                }}
                placeholder="Website durchsuchen"
                aria-label="Website durchsuchen"
                aria-autocomplete="list"
                aria-expanded={headerSearchOpen && headerQuery.trim() !== ''}
                aria-controls="header-search-results"
                autoComplete="off"
                tabIndex={headerSearchOpen ? 0 : -1}
                onKeyDown={onHeaderSearchKeyDown}
              />
              {headerSearchOpen && headerQuery.trim() !== '' && (
                <div
                  id="header-search-results"
                  className="header-search-results"
                  role="listbox"
                  aria-label="Suchvorschläge"
                >
                  {headerHits.length === 0 ? (
                    <p className="header-search-empty">
                      Keine Treffer zu „{headerQuery.trim()}“
                    </p>
                  ) : (
                    headerHits.map((hit, index) => (
                      <Fragment key={hit.key}>
                        {(index === 0 ||
                          headerHits[index - 1]?.section !== hit.section) && (
                          <p className="header-search-section">{hit.section}</p>
                        )}
                        <button
                          type="button"
                          role="option"
                          aria-selected={index === headerHitIndex}
                          className={`header-search-hit${index === headerHitIndex ? ' is-active' : ''}`}
                          onMouseEnter={() => setHeaderHitIndex(index)}
                          onClick={() => activateHeaderHit(hit)}
                        >
                          <span
                            className="avatar sm"
                            style={{
                              background: `hsl(${(index * 48 + 20) % 360} 28% 42%)`,
                            }}
                          >
                            {initials(hit.title)}
                          </span>
                          <span className="header-search-hit-meta">
                            <strong>{hit.title}</strong>
                            <span>{hit.subtitle}</span>
                          </span>
                        </button>
                      </Fragment>
                    ))
                  )}
                </div>
              )}
            </div>
            <div className="top-actions">
              <button
                type="button"
                className="icon-btn legal-topbar-button"
                aria-label="Rechtliche Informationen"
                title="Rechtliches"
                onClick={() => window.dispatchEvent(new Event('kundenzettel:legal-menu'))}
              >
                <svg viewBox="0 0 24 24" aria-hidden>
                  <circle cx="5" cy="12" r="1.7" fill="currentColor" />
                  <circle cx="12" cy="12" r="1.7" fill="currentColor" />
                  <circle cx="19" cy="12" r="1.7" fill="currentColor" />
                </svg>
              </button>
              <button
                ref={searchToggleRef}
                type="button"
                className={`icon-btn${headerSearchOpen ? ' is-active' : ''}`}
                aria-label={headerSearchOpen ? 'Suche schließen' : 'Suchen'}
                aria-expanded={headerSearchOpen}
                title={headerSearchOpen ? 'Suche schließen' : 'Suchen'}
                onClick={toggleHeaderSearch}
              >
                <IconSearch />
              </button>
              <button
                type="button"
                className="icon-btn"
                aria-label="Profil"
                title="Profil"
                onClick={() => showToast('Profil — demnächst')}
              >
                <IconProfile />
              </button>
              <button
                className="btn btn-wa btn-wa-open"
                type="button"
                aria-label="Chat öffnen"
                onClick={() => goToView('whatsapp')}
              >
                <WhatsAppLogo size={18} tone="inverse" />
                <span className="btn-wa-open-label">Chat öffnen</span>
              </button>
            </div>
          </div>
        </div>
        )}
      </header>

      {view === 'whatsapp' && (
        <div
          className={`workspace ops wa-layout${!infoActive && !activeGroup && orderInline ? ' has-order-inline' : ''}${infoActive ? ' is-info' : ''}${activeGroup ? ' is-group' : ''}${
            singlePane ? ` is-${mobilePane}` : ' is-split'
          }`}
        >
          {singlePane && (
            <div className="wa-pane-switch">
              <label className="wa-pane-switch-label" htmlFor="wa-pane-select">
                Ansicht
              </label>
              <select
                id="wa-pane-select"
                className="wa-pane-select"
                value={mobilePane}
                aria-label="Bereich wählen"
                onChange={(e) => {
                  const next = e.target.value as 'list' | 'chat' | 'order'
                  if ((next === 'chat' || next === 'order') && !activeId && !activeGroup) return
                  if (next === 'order' && activeGroup) return
                  setMobilePane(next)
                }}
              >
                <option value="list">Kontakte</option>
                <option value="chat" disabled={!activeId && !activeGroup}>
                  Chat
                </option>
                <option value="order" disabled={!activeId || !!activeGroup}>
                  Auftrag
                </option>
              </select>
            </div>
          )}
          <section className="col chat-list" ref={chatListColRef}>
            <div className="mobile-chat-actions" aria-label="Chataktionen">
              <button
                type="button"
                className="mobile-chat-action is-muted"
                aria-label="Weitere Optionen"
                onClick={() => window.dispatchEvent(new Event('kundenzettel:legal-menu'))}
              >
                <svg viewBox="0 0 24 24" aria-hidden>
                  <circle cx="5" cy="12" r="1.7" fill="currentColor" />
                  <circle cx="12" cy="12" r="1.7" fill="currentColor" />
                  <circle cx="19" cy="12" r="1.7" fill="currentColor" />
                </svg>
              </button>
              <div>
                <button
                  type="button"
                  className="mobile-chat-action is-muted"
                  aria-label="Kamera"
                  onClick={() => showToast('Kamera — demnächst')}
                >
                  <svg viewBox="0 0 24 24" aria-hidden>
                    <path d="M4 7.5h3l1.4-2h7.2l1.4 2h3v11H4z" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
                    <circle cx="12" cy="13" r="3.4" fill="none" stroke="currentColor" strokeWidth="1.7" />
                  </svg>
                </button>
                <button
                  type="button"
                  className="mobile-chat-action is-primary"
                  aria-label="Neuen Chat starten"
                  onClick={() => openNewChatPicker()}
                >
                  <svg viewBox="0 0 24 24" aria-hidden>
                    <path d="M12 5v14M5 12h14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                </button>
              </div>
            </div>
            <div className="col-head">
              <div className="col-head-title">
                <WhatsAppLogo size={18} />
                <h2>Chats</h2>
              </div>
              <div
                className={`wa-connect ${waStatus.state === 'connected' ? 'is-ok' : waStatus.state === 'degraded' ? 'is-degraded' : waStatus.state === 'checking' ? 'is-checking' : 'is-fail'}`}
                title={waStatus.detail}
                role="status"
                aria-live="polite"
                aria-label={`WhatsApp-Cloud-API: ${waStatus.label}. ${waStatus.detail}`}
              >
                <span className="live" aria-hidden />
                <span>{waStatus.label}</span>
              </div>
            </div>
            <div className="search">
              <button
                type="button"
                className="search-icon-btn"
                aria-label="Suchen"
                title="Suchen"
                onClick={runChatListSearchAction}
              >
                <IconSearch size={18} />
              </button>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Chats oder Nachrichten"
                aria-label="Chats, Gruppen oder Nachrichten suchen"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    runChatListSearchAction()
                  }
                }}
              />
            </div>
            <div className="chat-filters">
              <div className="filter-rail" ref={filterMenuRef}>
                {filterScrollHints.left && (
                  <button
                    type="button"
                    className="filter-scroll-arrow is-left"
                    aria-label="Filter nach links scrollen"
                    onClick={() => scrollFilterRail('left')}
                  >
                    <svg viewBox="0 0 10 10" aria-hidden>
                      <path
                        d="M6.4 1.2 2.8 5l3.6 3.8"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.4"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </button>
                )}
                <div className="filter-scroll" ref={filterScrollRef}>
                <button
                  type="button"
                  className={`filter-pill ${!groupOverviewOpen && !activeGroup && isFilterActive({ kind: 'all' }) ? 'is-on' : ''}`}
                  onClick={() => { setChatFilter({ kind: 'all' }); setFilterMenu(null); setGroupOverviewOpen(false); setActiveGroupId(null) }}
                >
                  Alle
                </button>
                <button
                  type="button"
                  className={`filter-pill ${isFilterActive({ kind: 'unread' }) ? 'is-on' : ''}`}
                  onClick={() => { setChatFilter({ kind: 'unread' }); setFilterMenu(null); setGroupOverviewOpen(false); setActiveGroupId(null) }}
                >
                  Ungelesen{unread > 0 ? ` ${unread}` : ''}
                </button>
                <div className="filter-menu-wrap">
                  <button type="button" className={`filter-pill ${chatFilter.kind === 'semantic' ? 'is-on' : ''}`} onClick={(event) => toggleFilterMenu('status', event)} aria-expanded={filterMenu === 'status'}>
                    Status <span aria-hidden>▾</span>
                  </button>
                </div>
                <div className="filter-menu-wrap">
                  <button type="button" className={`filter-pill ${groupOverviewOpen || activeGroup || chatFilter.kind === 'groups' || chatFilter.kind === 'list' ? 'is-on' : ''}`} onClick={(event) => toggleFilterMenu('groups', event)} aria-expanded={filterMenu === 'groups'}>
                    Gruppen <span aria-hidden>▾</span>
                  </button>
                </div>
                <div className="filter-menu-wrap">
                  <button type="button" className="filter-pill" onClick={(event) => toggleFilterMenu('announcements', event)} aria-expanded={filterMenu === 'announcements'}>
                    Ankündigungen <span aria-hidden>▾</span>
                  </button>
                </div>
                </div>
                {filterScrollHints.right && (
                  <button
                    type="button"
                    className="filter-scroll-arrow is-right"
                    aria-label="Filter nach rechts scrollen"
                    onClick={() => scrollFilterRail('right')}
                  >
                    <svg viewBox="0 0 10 10" aria-hidden>
                      <path
                        d="M3.6 1.2 7.2 5l-3.6 3.8"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.4"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </button>
                )}
              </div>
              {chatFilter.kind === 'list' && (
                <div className="filter-active-label">
                  <span>Gruppe: {chatLists.find((l) => l.id === chatFilter.listId)?.name}</span>
                  <button
                    type="button"
                    onClick={() => setGroupDissolveTarget(chatFilter.listId)}
                    aria-label="Aktive Gruppe auflösen"
                  >
                    Gruppe auflösen
                  </button>
                </div>
              )}
            </div>
            {filterMenu && filterMenuPosition && createPortal(
              <div
                ref={filterMenuPortalRef}
                className={`filter-dropdown is-portal${filterMenu === 'announcements' ? ' filter-announcements' : ''}`}
                role="menu"
                style={{ top: filterMenuPosition.top, left: filterMenuPosition.left }}
              >
                {filterMenu === 'status' && (
                  (Object.keys(semanticGroupLabel) as SemanticGroup[]).map((group) => (
                    <button key={group} type="button" role="menuitem" className={isFilterActive({ kind: 'semantic', group }) ? 'is-on' : ''} onClick={() => { setChatFilter({ kind: 'semantic', group }); setFilterMenu(null); setGroupOverviewOpen(false); setActiveGroupId(null) }}>
                      <span>{semanticGroupLabel[group]}</span><small>{semanticCounts[group]}</small>
                    </button>
                  ))
                )}
                {filterMenu === 'groups' && (
                  <>
                    <span className="filter-dropdown-section-label">GRUPPEN</span>
                    <button type="button" role="menuitem" className={groupOverviewOpen ? 'is-on' : ''} onClick={openGroupOverview}>
                      <span>Gruppenübersicht öffnen</span><small>{chatLists.length}</small>
                    </button>
                    <button type="button" role="menuitem" onClick={startConversationSelection}>
                      <span>Chats gruppieren</span><small>Mehrere markieren</small>
                    </button>
                    <div className="filter-dropdown-divider" />
                    <span className="filter-dropdown-section-label">CHATS IN GRUPPEN</span>
                    <button type="button" role="menuitem" onClick={() => { setChatFilter({ kind: 'groups' }); setFilterMenu(null); setGroupOverviewOpen(false); setActiveGroupId(null) }}>Alle gruppierten Chats <small>{new Set(chatLists.flatMap((group) => group.chatIds)).size}</small></button>
                    {chatLists.length === 0 ? <p>Noch keine Gruppe angelegt</p> : chatLists.map((group) => <button key={group.id} type="button" role="menuitem" onClick={() => void openGroupWorkspace(group.id)}><span>{group.name}</span><small>{group.chatIds.length}</small></button>)}
                    <div className="filter-dropdown-divider" />
                    <button type="button" role="menuitem" onClick={() => { setFilterMenu(null); setNewChannelOpen(true) }}>Kanal aus Gruppen erstellen</button>
                  </>
                )}
                {filterMenu === 'announcements' && (
                  <>
                    <button type="button" role="menuitem" onClick={() => { setFilterMenu(null); setAnnouncementOpen(true) }}>Neue Ankündigung</button>
                    {announcements.length === 0 ? <p>Noch keine Ankündigungen</p> : announcements.slice(0, 4).map((item) => <article key={item.id}><strong>{item.title}</strong><span>{item.audienceLabel}</span></article>)}
                  </>
                )}
              </div>,
              document.body,
            )}
            {selectionMode && (
              <div className="chat-bulk-bar" role="region" aria-label="Aktionen für markierte Chats">
                <strong>{selectedConversationIds.length} markiert</strong>
                <div className="chat-bulk-actions">
                  <button type="button" disabled={!selectedConversationIds.length} onClick={() => markSelectedConversationsUnread(0)}>Gelesen</button>
                  <button type="button" disabled={!selectedConversationIds.length} onClick={() => markSelectedConversationsUnread(1)}>Ungelesen</button>
                  <button
                    type="button"
                    disabled={!selectedGroupMemberships.length}
                    onClick={() => setBulkGroupManageOpen(true)}
                    aria-label="Gruppenzuordnungen verwalten"
                    title="Gruppenzuordnungen verwalten"
                  >
                    Gruppen
                  </button>
                  <button type="button" disabled={!selectedConversationIds.length} onClick={() => setBulkGroupDialogOpen(true)}>Gruppieren</button>
                  <button type="button" disabled={!selectedConversationIds.length} className="is-danger" onClick={requestBulkConversationDeletion}>Löschen</button>
                  <button type="button" className="is-quiet" onClick={cancelConversationSelection}>Abbrechen</button>
                </div>
              </div>
            )}
            <div className="thread-list">
              {groupOverviewOpen ? (
                <GroupOverview
                  groups={chatLists}
                  conversations={conversations}
                  onOpenGroup={(groupId) => void openGroupWorkspace(groupId)}
                />
              ) : <>
              {IS_OPERATOR_RUNTIME && operatorDataState === 'loading' && (
                <p className="thread-empty">Geschützte Chats werden geladen …</p>
              )}
              {IS_OPERATOR_RUNTIME && operatorDataState === 'error' && (
                <div className="thread-empty">
                  <p>{operatorDataError || 'Kundenzettel konnte keine geschützten Chats laden. Zugriff und Verbindung prüfen.'}</p>
                  <a href="/_v/whatsapp/status">Betreiberzugang erneuern</a>
                </div>
              )}
              {(!query.trim() || isNewChatCommand(query)) && (
                <button
                  type="button"
                  className="thread-newchat-hit"
                  onClick={() =>
                    openNewChatPicker(
                      isNewChatCommand(query) ? parseNewChatCommand(query).name : '',
                    )
                  }
                >
                  <span className="avatar thread-newchat-avatar" aria-hidden>
                    +
                  </span>
                  <span className="thread-newchat-copy">
                    <strong>Neuen Chat starten</strong>
                    <span>
                      {isNewChatCommand(query) && parseNewChatCommand(query).name
                        ? `Kontakt: ${parseNewChatCommand(query).name}`
                        : 'Kontakt aus der Liste wählen'}
                    </span>
                  </span>
                </button>
              )}
              {visibleThreads.length === 0 && !isNewChatCommand(query) && (
                <p className="thread-empty">Keine Chats in dieser Ansicht</p>
              )}
              {visibleThreads.map((c, idx) => {
                const memberLists = chatLists.filter((l) => l.chatIds.includes(c.id))
                const lastMsg = c.messages[c.messages.length - 1]
                const previewTicks =
                  lastMsg?.from === 'atelier'
                    ? (lastMsg.status ?? 'sent')
                    : null
                const menuOpen = threadMenuId === c.id
                const isSelected = selectedConversationIds.includes(c.id)
                return (
                <div
                  key={c.id}
                  className={`thread${c.id === active.id ? ' is-on' : ''}${c.pinned ? ' is-pinned' : ''}${c.muted ? ' is-muted' : ''}${c.blocked ? ' is-blocked' : ''}${isSelected ? ' is-selected' : ''}`}
                  onContextMenu={(event) => openChatContextMenu(event, c.id)}
                >
                  <button
                    type="button"
                    className="thread-main"
                    aria-pressed={selectionMode && c.systemRole !== 'info' ? isSelected : undefined}
                    onClick={() => {
                      if (selectionMode && c.systemRole !== 'info') {
                        toggleConversationSelection(c.id)
                        return
                      }
                      selectThread(c.id)
                    }}
                  >
                    <div
                      className={`avatar${c.systemRole === 'info' ? ' thread-info-avatar' : ''}`}
                      style={
                        c.systemRole === 'info'
                          ? undefined
                          : {
                              background: `hsl(${(idx * 48 + 20) % 360} 28% 42%)`,
                              position: 'relative',
                            }
                      }
                    >
                      {c.systemRole === 'info' ? <IconInfo size={29} /> : initials(c.kunde)}
                      {selectionMode && c.systemRole !== 'info' && (
                        <span className="thread-select-indicator" aria-hidden>{isSelected ? '✓' : ''}</span>
                      )}
                      {c.systemRole !== 'info' && c.online && (
                        <span
                          className="online"
                          style={{ position: 'absolute', right: 0, bottom: 0 }}
                        />
                      )}
                    </div>
                    <div className="thread-body">
                      <div className="thread-top">
                        {c.systemRole === 'info' ? (
                          <strong className="thread-info-brand">
                            <img
                              src="/brand/kundenzettel-mark.png"
                              alt=""
                              aria-hidden
                            />
                            <span>Kundenzettel</span>
                          </strong>
                        ) : (
                          <strong>{c.kunde}</strong>
                        )}
                        <time>{c.lastAt}</time>
                      </div>
                      {memberLists.length > 0 && (
                        <div className="thread-meta">
                          {memberLists.map((l) => (
                            <span key={l.id} className="list-tag">
                              {l.name}
                            </span>
                          ))}
                        </div>
                      )}
                      <div className="thread-preview">
                        <p>
                          {typingChatIds.includes(c.id) ? (
                            <span className="thread-typing">
                              {contactFirstName(c.kunde)} schreibt …
                            </span>
                          ) : (
                            <>
                              {previewTicks && <IconMsgTicks status={previewTicks} />}
                              <span className="thread-preview-text">{c.lastPreview}</span>
                            </>
                          )}
                        </p>
                        <div className="thread-preview-end">
                          {c.unread > 0 && !typingChatIds.includes(c.id) && (
                            <span className="badge">{c.unread}</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </button>
                  <div
                    className={`thread-menu-wrap${menuOpen ? ' is-open' : ''}`}
                    ref={menuOpen ? threadMenuRef : undefined}
                    onPointerDown={(event) => event.stopPropagation()}
                    onClick={(event) => event.stopPropagation()}
                  >
                    <button
                      type="button"
                      className="thread-menu-btn"
                      aria-label="Chat-Optionen"
                      aria-haspopup="menu"
                      aria-expanded={menuOpen}
                      onClick={(e) => {
                        e.stopPropagation()
                        setGroupSubmenu(null)
                        setThreadMenuId((id) => (id === c.id ? null : c.id))
                      }}
                    >
                      <svg viewBox="0 0 12 8" width="10" height="7" aria-hidden>
                        <path
                          d="M1.5 1.6 6 5.8l4.5-4.2"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.35"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </button>
                    {menuOpen && (
                      <div className="thread-menu" role="menu">
                        {c.systemRole !== 'info' && (
                          <button
                            type="button"
                            role="menuitem"
                            className="thread-menu-item"
                            onClick={() => beginConversationSelection(c.id)}
                          >
                            <span className="thread-menu-ico" aria-hidden>✓</span>
                            Markieren
                          </button>
                        )}
                        <button
                          type="button"
                          role="menuitem"
                          className="thread-menu-item"
                          onClick={() => muteChat(c.id)}
                        >
                          <span className="thread-menu-ico" aria-hidden>
                            <svg viewBox="0 0 24 24"><path d="M5 9v6h4l5 4V5L9 9H5zm11.5 3a3.5 3.5 0 0 0-1.8-3.1v6.2A3.5 3.5 0 0 0 16.5 12zM4.3 3.7 3 5l16 16 1.3-1.3L4.3 3.7z" fill="currentColor"/></svg>
                          </span>
                          {c.muted ? 'Stummschaltung aufheben' : 'Benachr. stummschalten'}
                        </button>
                        <button
                          type="button"
                          role="menuitem"
                          className="thread-menu-item"
                          onClick={() => pinChat(c.id)}
                        >
                          <span className="thread-menu-ico" aria-hidden>
                            <svg viewBox="0 0 24 24"><path d="M16 12V4h1V2H7v2h1v8l-2 2v2h5.2v6h1.6v-6H18v-2l-2-2z" fill="currentColor"/></svg>
                          </span>
                          {c.pinned ? 'Fixierung entfernen' : 'Chat fixieren'}
                        </button>
                        <button
                          type="button"
                          role="menuitem"
                          className="thread-menu-item"
                          onClick={() => markRead(c.id)}
                        >
                          <span className="thread-menu-ico" aria-hidden>
                            <svg viewBox="0 0 24 24"><path d="M20 2H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h4l4 4 4-4h4c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-2 12H6v-2h12v2zm0-3H6V9h12v2zm0-3H6V6h12v2z" fill="currentColor"/></svg>
                          </span>
                          Als gelesen markieren
                        </button>
                        <button
                          type="button"
                          role="menuitem"
                          className="thread-menu-item"
                          onClick={() => markUnread(c.id)}
                        >
                          <span className="thread-menu-ico" aria-hidden>
                            <svg viewBox="0 0 24 24"><path d="M22 8V4c0-1.1-.9-2-2-2H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h4l4 4 4-4h1v-2H9.2L8 17.2V16H4V4h16v4h2z" fill="currentColor"/></svg>
                          </span>
                          Als ungelesen markieren
                        </button>
                        <div
                          className={`thread-menu-item-wrap${groupSubmenu?.chatId === c.id ? ' is-open' : ''}`}
                          onMouseEnter={(e) => openGroupSubmenu(c.id, e.currentTarget)}
                        >
                          <button
                            type="button"
                            role="menuitem"
                            className="thread-menu-item has-sub"
                            onClick={(e) => {
                              const wrap = e.currentTarget.parentElement
                              if (!wrap) return
                              if (groupSubmenu?.chatId === c.id) {
                                setGroupSubmenu(null)
                              } else {
                                openGroupSubmenu(c.id, wrap)
                              }
                            }}
                            onFocus={(e) => {
                              const wrap = e.currentTarget.parentElement
                              if (wrap) openGroupSubmenu(c.id, wrap)
                            }}
                          >
                            <span className="thread-menu-ico" aria-hidden>
                              <svg viewBox="0 0 24 24"><path d="M16 11c1.7 0 3-1.3 3-3s-1.3-3-3-3-3 1.3-3 3 1.3 3 3 3zm-8 0c1.7 0 3-1.3 3-3S9.7 5 8 5 5 6.3 5 8s1.3 3 3 3zm0 2c-2.3 0-7 1.2-7 3.5V19h14v-2.5C15 14.2 10.3 13 8 13zm8 0c-.3 0-.6 0-1 .1 1.2.8 2 2 2 3.4V19h6v-2.5c0-2.3-4.7-3.5-7-3.5z" fill="currentColor"/></svg>
                            </span>
                            Zur Gruppe hinzufügen
                            <span className="thread-menu-chevron" aria-hidden>›</span>
                          </button>
                        </div>
                        <div className="thread-menu-divider" />
                        <button
                          type="button"
                          role="menuitem"
                          className="thread-menu-item"
                          onClick={() => blockChat(c.id)}
                        >
                          <span className="thread-menu-ico" aria-hidden>
                            <svg viewBox="0 0 24 24"><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10S17.5 2 12 2zm0 18c-4.4 0-8-3.6-8-8 0-1.8.6-3.4 1.6-4.7L16.7 18.4C15.4 19.4 13.8 20 12 20zm6.4-3.3L7.3 5.6C8.6 4.6 10.2 4 12 4c4.4 0 8 3.6 8 8 0 1.8-.6 3.4-1.6 4.7z" fill="currentColor"/></svg>
                          </span>
                          {c.blocked ? 'Blockierung aufheben' : 'Blockieren'}
                        </button>
                        <button
                          type="button"
                          role="menuitem"
                          className="thread-menu-item is-danger"
                          onClick={() => deleteChat(c.id)}
                        >
                          <span className="thread-menu-ico" aria-hidden>
                            <svg viewBox="0 0 24 24"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z" fill="currentColor"/></svg>
                          </span>
                          Chat löschen
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )})}
              </>}
            </div>
          </section>

          {newChatPickerOpen && (
            <div
              className="chat-dialog-backdrop contact-picker-backdrop"
              role="presentation"
              onClick={() => setNewChatPickerOpen(false)}
            >
              <div
                className="chat-dialog contact-picker"
                role="dialog"
                aria-modal="true"
                aria-label="Kontakt wählen"
                onClick={(event) => event.stopPropagation()}
              >
                <h3>Neuen Chat starten</h3>
                <p className="chat-dialog-hint">Kontakt aus der Kundenliste wählen</p>
                <div className="search contact-picker-search">
                  <span className="search-icon-btn" aria-hidden>
                    <IconSearch size={16} />
                  </span>
                  <input
                    autoFocus
                    value={contactPickerQuery}
                    onChange={(e) => setContactPickerQuery(e.target.value)}
                    placeholder="Kunden suchen"
                    aria-label="Kunden suchen"
                  />
                </div>
                <div className="chat-dialog-list contact-picker-list">
                  {pickerCustomers.map((c) => (
                    <button
                      key={c.kundenNr}
                      type="button"
                      className="chat-dialog-item contact-picker-item"
                      onClick={() => startChatWithCustomer(c)}
                    >
                      <span className="avatar sm">{initials(c.name)}</span>
                      <span className="contact-picker-meta">
                        <strong>{c.name}</strong>
                        <span>
                          {[c.strasse, c.plzOrt].filter(Boolean).join(', ') || 'Keine Adresse'}
                        </span>
                        <span>{c.telefon || 'Kein Telefon'}</span>
                      </span>
                    </button>
                  ))}
                  {pickerCustomers.length === 0 && (
                    <p className="chat-dialog-hint">Kein Kontakt gefunden</p>
                  )}
                </div>
                <button
                  type="button"
                  className="chat-dialog-cancel"
                  onClick={() => setNewChatPickerOpen(false)}
                >
                  Abbrechen
                </button>
              </div>
            </div>
          )}

          <section className="col chat">
            {activeGroup ? (
              <GroupWorkspace
                group={activeGroup}
                conversations={conversations}
                operatorReady={!IS_OPERATOR_RUNTIME || operatorDataState === 'ready'}
                onBack={() => {
                  setActiveGroupId(null)
                  setGroupOverviewOpen(true)
                  setMobilePane('list')
                }}
                onOpenConversation={selectThread}
                onAddMember={(conversationId) => addGroupMember(activeGroup.id, conversationId)}
                onRemoveMember={(conversationId) => removeGroupMember(activeGroup.id, conversationId)}
                onRequestDissolve={() => setGroupDissolveTarget(activeGroup.id)}
                onSend={(text) => sendGroupMessage(activeGroup.id, text)}
                onToast={showToast}
              />
            ) : <>
            <div className="chat-head">
              <button
                type="button"
                className="chat-back"
                aria-label="Zurück zur Chatliste"
                title="Zurück"
                onClick={returnFromInfoHubToChatList}
              >
                <svg viewBox="0 0 16 16" width="18" height="18" aria-hidden>
                  <path
                    d="M10.2 3.2 5.4 8l4.8 4.8"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
              <div
                className={`avatar${active.systemRole === 'info' ? ' chat-info-avatar' : ''}`}
                style={
                  active.systemRole === 'info'
                    ? undefined
                    : { background: 'hsl(12 28% 42%)' }
                }
              >
                {active.systemRole === 'info' ? (
                  <IconInfo size={20} />
                ) : (
                  initials(active.kunde)
                )}
              </div>
              <div className="meta">
                <h2>
                  {active.systemRole === 'info' ? (
                    <span className="chat-info-brand">
                      <img src="/brand/kundenzettel-mark.png" alt="" aria-hidden />
                      <span>Kundenzettel</span>
                    </span>
                  ) : (
                    active.kunde
                  )}
                </h2>
                <p>
                  {active.systemRole === 'info' ? (
                    <span>Informationen &amp; Funktionen</span>
                  ) : typingChatIds.includes(active.id) ? (
                    <span className="chat-head-typing">schreibt …</span>
                  ) : (
                    <>
                      <span className="chat-head-phone">
                        {active.online ? 'online' : active.telefon}
                      </span>
                      <span className="chat-head-sep" aria-hidden>
                        ·
                      </span>
                      <span className="wa-mark">
                        <WhatsAppLogo size={11} />
                        <span>WhatsApp</span>
                      </span>
                    </>
                  )}
                </p>
              </div>
              {active.systemRole !== 'info' && <div className="chat-head-actions">
                {!orderInline && (
                  <button
                    type="button"
                    className={`order-toggle${orderPaneVisible && !orderInline ? ' is-open' : ''}`}
                    aria-label="Auftrag anzeigen"
                    aria-expanded={orderPaneVisible && !orderInline}
                    title="Auftrag anzeigen"
                    onClick={openOrderPane}
                  >
                    <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden>
                      <path
                        d="M4.5 3.5h11v13h-11zM7 6.5h6M7 9.5h6M7 12.5h4"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.4"
                        strokeLinecap="round"
                      />
                    </svg>
                    <span>Auftrag</span>
                  </button>
                )}
                <span
                  ref={bearbeitungAnchorRef}
                  className={`semantic-badge semantic-${getSemanticGroup(active.status)} chat-head-badge`}
                >
                  {semanticGroupLabel[getSemanticGroup(active.status)]}
                </span>
                <div className="status-menu-wrap" ref={statusMenuRef}>
                  <button
                    type="button"
                    className="status-menu-btn"
                    onClick={() => setStatusMenuOpen((o) => !o)}
                    aria-expanded={statusMenuOpen}
                    aria-haspopup="listbox"
                    aria-label="Status ändern"
                  >
                    <span className="status-menu-label">Status</span>
                    <span className="status-menu-caret" aria-hidden>
                      ▾
                    </span>
                  </button>
                  {statusMenuOpen && (
                    <div className="status-menu-popover" role="listbox">
                      {(
                        Object.keys(semanticGroupLabel) as SemanticGroup[]
                      ).map((group) => {
                        const activeGroup = getSemanticGroup(active.status)
                        return (
                          <button
                            key={group}
                            type="button"
                            role="option"
                            aria-selected={activeGroup === group}
                            className={`status-menu-item${activeGroup === group ? ' is-on' : ''}`}
                            onClick={() => setSemanticStatus(group)}
                          >
                            {semanticGroupLabel[group]}
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>
              </div>}
            </div>

            {active.systemRole === 'info' ? <InfoHub /> : <>
            <div className="messages">
              {active.messages.some((m) => m.pinned) && (
                <div className="msg-pinned-strip">
                  {active.messages
                    .filter((m) => m.pinned)
                    .map((m) => (
                      <button
                        key={`pin-${m.id}`}
                        type="button"
                        className="msg-pinned-item"
                        onClick={() => {
                          document
                            .getElementById(`msg-${m.id}`)
                            ?.scrollIntoView({ behavior: 'smooth', block: 'center' })
                          showToast('Zur fixierten Nachricht')
                        }}
                      >
                        <span aria-hidden>📌</span>
                        <span>{messagePreview(m)}</span>
                      </button>
                    ))}
                </div>
              )}

              <div className="msg-toolbar">
                <div className="day-chip">Heute</div>
                {active.messages.some((m) => m.starred) && (
                  <button
                    type="button"
                    className={`msg-starred-filter${starredOnly ? ' is-on' : ''}`}
                    onClick={() => {
                      setStarredOnly((v) => !v)
                      showToast(
                        starredOnly
                          ? 'Alle Nachrichten'
                          : 'Nur mit Stern markierte',
                      )
                    }}
                  >
                    ★ Sternchen
                  </button>
                )}
              </div>

              {(starredOnly
                ? active.messages.filter((m) => m.starred)
                : active.messages
              ).map((m) => (
                <MessageBubble
                  key={m.id}
                  message={m}
                  poster={active.produktBild}
                  menuOpen={msgMenuId === m.id}
                  selectMode={selectMode}
                  selected={selectedMsgIds.includes(m.id)}
                  onToggleMenu={() =>
                    setMsgMenuId((id) => (id === m.id ? null : m.id))
                  }
                  onCloseMenu={() => setMsgMenuId(null)}
                  onReply={() => {
                    setReplyTo(m)
                    setMsgMenuId(null)
                    setComposerFocusNonce((n) => n + 1)
                    showToast('Antworten')
                  }}
                  onCopy={async () => {
                    const text = messagePreview(m)
                    try {
                      await navigator.clipboard.writeText(text)
                      showToast('Kopiert')
                    } catch {
                      showToast('Kopieren nicht möglich')
                    }
                    setMsgMenuId(null)
                  }}
                  onForward={() => {
                    setForwardIds([m.id])
                    setMsgMenuId(null)
                  }}
                  onPin={() => {
                    patchMessage(m.id, { pinned: !m.pinned })
                    setMsgMenuId(null)
                    showToast(m.pinned ? 'Fixierung aufgehoben' : 'Nachricht fixiert')
                  }}
                  onAskAi={() => askMetaAi(m)}
                  onStar={() => {
                    patchMessage(m.id, { starred: !m.starred })
                    setMsgMenuId(null)
                    showToast(m.starred ? 'Stern entfernt' : 'Mit Stern markiert')
                  }}
                  onSelect={() => {
                    setSelectMode(true)
                    setSelectedMsgIds((prev) =>
                      prev.includes(m.id)
                        ? prev.filter((id) => id !== m.id)
                        : [...prev, m.id],
                    )
                    setMsgMenuId(null)
                    showToast('Auswahlmodus')
                  }}
                  onDelete={() => {
                    setMsgMenuId(null)
                    setDeleteIds([m.id])
                  }}
                  onReact={(emoji) => reactToMessage(m.id, emoji)}
                  onOpenMedia={(item) => {
                    setMsgMenuId(null)
                    setMediaLightbox(item)
                  }}
                />
              ))}
              <div ref={endRef} />
            </div>

            {selectMode && (
              <div className="msg-select-bar">
                <button
                  type="button"
                  onClick={() => {
                    setSelectMode(false)
                    setSelectedMsgIds([])
                  }}
                >
                  Abbrechen
                </button>
                <span>{selectedMsgIds.length} ausgewählt</span>
                <button
                  type="button"
                  disabled={!selectedMsgIds.length}
                  onClick={() => {
                    selectedMsgIds.forEach((id) => {
                      const msg = active.messages.find((x) => x.id === id)
                      if (msg && !msg.starred) patchMessage(id, { starred: true })
                    })
                    showToast('Mit Stern markiert')
                  }}
                >
                  Stern
                </button>
                <button
                  type="button"
                  disabled={!selectedMsgIds.length}
                  onClick={() => setForwardIds([...selectedMsgIds])}
                >
                  Weiterleiten
                </button>
                <button
                  type="button"
                  className="is-danger"
                  disabled={!selectedMsgIds.length}
                  onClick={() => {
                    setDeleteIds([...selectedMsgIds])
                  }}
                >
                  Löschen
                </button>
              </div>
            )}

            {replyTo && !selectMode && (
              <div className="msg-reply-bar">
                <div className="msg-reply-bar-body">
                  <strong>Antworten</strong>
                  <span>{messagePreview(replyTo)}</span>
                </div>
                <button
                  type="button"
                  aria-label="Antwort abbrechen"
                  onClick={() => setReplyTo(null)}
                >
                  ×
                </button>
              </div>
            )}

            <Composer
              onSend={sendOutgoing}
              onToast={showToast}
              focusNonce={composerFocusNonce}
              draftSeed={composerDraftSeed}
              onDraftSeedConsumed={() => setComposerDraftSeed(null)}
              mediaEnabled={!IS_OPERATOR_RUNTIME || (runtimeConfig.mediaEnabled && waStatus.mediaEnabled)}
              disabled={
                !!active.blocked ||
                (IS_OPERATOR_RUNTIME && active.replyWindowOpen === false) ||
                (IS_OPERATOR_RUNTIME &&
                  (!active.id || operatorDataState !== 'ready'))
              }
              disabledReason={
                active.blocked
                  ? 'Kontakt ist blockiert — Blockierung aufheben, um zu schreiben.'
                  : IS_OPERATOR_RUNTIME && active.replyWindowOpen === false
                    ? 'Das 24-Stunden-Fenster ist abgelaufen. Eine genehmigte WhatsApp-Vorlage ist erforderlich.'
                    : 'Geschützte Chats werden geladen.'
              }
            />
            </>}
            </>}

            {forwardIds && (
              <div className="chat-dialog-backdrop" role="presentation">
                <div className="chat-dialog" role="dialog" aria-label="Weiterleiten">
                  <h3>Weiterleiten</h3>
                  <p className="chat-dialog-hint">
                    Nachricht als weitergeleitet in diesen Chat einfügen.
                  </p>
                  <div className="chat-dialog-actions">
                    <button type="button" onClick={() => setForwardIds(null)}>
                      Abbrechen
                    </button>
                    <button
                      type="button"
                      className="is-primary"
                      onClick={() => forwardInCurrentChat(forwardIds)}
                    >
                      Weiterleiten
                    </button>
                  </div>
                </div>
              </div>
            )}

            {deleteIds && (
              <div className="chat-dialog-backdrop" role="presentation">
                <div
                  className="msg-delete-dialog"
                  role="dialog"
                  aria-modal="true"
                  aria-label="Nachricht löschen"
                >
                  <h3>
                    {deleteIds.length > 1
                      ? `${deleteIds.length} Nachrichten löschen?`
                      : 'Nachricht löschen?'}
                  </h3>
                  <button
                    type="button"
                    className="msg-delete-opt is-everyone"
                    onClick={() => deleteMessagesForEveryone(deleteIds)}
                  >
                    Für alle löschen
                  </button>
                  <button
                    type="button"
                    className="msg-delete-opt is-me"
                    onClick={() => deleteMessagesForMe(deleteIds)}
                  >
                    Für mich löschen
                  </button>
                  {IS_OPERATOR_RUNTIME && deleteIds.length === 1 && (
                    <button
                      type="button"
                      className="msg-delete-opt is-everyone"
                      onClick={() => requestOperatorMessageDeletion(deleteIds[0])}
                    >
                      In Kundenzettel endgültig löschen
                    </button>
                  )}
                  <button
                    type="button"
                    className="msg-delete-cancel"
                    onClick={() => setDeleteIds(null)}
                  >
                    Abbrechen
                  </button>
                </div>
              </div>
            )}

            {operatorDeleteTarget && (
              <div className="chat-dialog-backdrop" role="presentation">
                <div
                  className="msg-delete-dialog"
                  role="dialog"
                  aria-modal="true"
                  aria-label={operatorDeleteTarget.kind === 'message' ? 'Nachricht endgültig löschen' : 'Chat endgültig löschen'}
                >
                  <h3>
                    {operatorDeleteTarget.kind === 'message'
                      ? 'Nachricht endgültig löschen?'
                      : 'Gesamten Chat endgültig löschen?'}
                  </h3>
                  <p className="chat-dialog-hint">
                    {operatorDeleteTarget.kind === 'message'
                      ? 'Die Nachricht und eine nur dazugehörige private Mediendatei werden aus Kundenzettel entfernt.'
                      : 'Auftrag, Nachrichten und nicht mehr referenzierte private Mediendateien werden aus Kundenzettel entfernt.'}
                    {' '}Bereits bei WhatsApp oder Meta vorhandene Nachrichten werden nicht zurückgerufen.
                  </p>
                  <div className="chat-dialog-actions">
                    <button
                      type="button"
                      disabled={operatorDeleteBusy}
                      onClick={() => setOperatorDeleteTarget(null)}
                    >
                      Abbrechen
                    </button>
                    <button
                      type="button"
                      className="is-primary"
                      disabled={operatorDeleteBusy}
                      onClick={() => void confirmOperatorDeletion()}
                    >
                      {operatorDeleteBusy ? 'Wird gelöscht …' : 'Endgültig in Kundenzettel löschen'}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {newGroupForChat && createPortal(
              <div className="chat-dialog-backdrop" role="presentation">
                <div className="chat-dialog" role="dialog" aria-label="Neue Gruppe">
                  <h3>Neue Gruppe</h3>
                  <label>
                    Gruppenname
                    <input
                      autoFocus
                      value={newGroupName}
                      onChange={(e) => setNewGroupName(e.target.value)}
                      placeholder="z. B. Stammkunden"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') confirmNewGroup()
                      }}
                    />
                  </label>
                  <div className="chat-dialog-actions">
                    <button type="button" onClick={() => setNewGroupForChat(null)}>
                      Abbrechen
                    </button>
                    <button type="button" className="is-primary" onClick={confirmNewGroup}>
                      Erstellen
                    </button>
                  </div>
                </div>
              </div>
            , document.body)}

            {newChannelOpen && createPortal(
              <div className="chat-dialog-backdrop" role="presentation">
                <div className="chat-dialog" role="dialog" aria-modal="true" aria-label="Kanal erstellen">
                  <h3>Kanal erstellen</h3>
                  <p className="chat-dialog-hint">Ein Kanal fasst mehrere Gruppen zusammen. Er verändert keine Chats und keine Gruppen.</p>
                  <label>Bezeichnung<input autoFocus value={newChannelName} onChange={(event) => setNewChannelName(event.target.value)} placeholder="z. B. Stammkunden Rhein-Ruhr" /></label>
                  <fieldset className="channel-group-select"><legend>Gruppen auswählen</legend>{chatLists.length === 0 ? <p>Lege zuerst mindestens eine Gruppe an.</p> : chatLists.map((group) => <label key={group.id}><input type="checkbox" checked={newChannelGroupIds.includes(group.id)} onChange={() => setNewChannelGroupIds((current) => current.includes(group.id) ? current.filter((id) => id !== group.id) : [...current, group.id])} />{group.name}</label>)}</fieldset>
                  <div className="chat-dialog-actions"><button type="button" onClick={() => setNewChannelOpen(false)}>Abbrechen</button><button type="button" className="is-primary" onClick={createChannel}>Erstellen</button></div>
                </div>
              </div>, document.body)}

            {announcementOpen && createPortal(
              <div className="chat-dialog-backdrop" role="presentation">
                <div className="chat-dialog announcement-dialog" role="dialog" aria-modal="true" aria-label="Neue Ankündigung">
                  <h3>Neue Ankündigung</h3>
                  <p className="chat-dialog-hint">Ankündigungen sind einseitige Beiträge im Kundenzettel-Feed. Sie erzeugen keine Chatantwort.</p>
                  <label>Titel<input autoFocus value={announcementTitle} onChange={(event) => setAnnouncementTitle(event.target.value)} placeholder="z. B. Geänderte Öffnungszeiten" /></label>
                  <label>Nachricht<textarea value={announcementText} onChange={(event) => setAnnouncementText(event.target.value)} placeholder="Was möchtest du mitteilen?" /></label>
                  <label>Empfängerkreis<select value={announcementAudience} onChange={(event) => { setAnnouncementAudience(event.target.value as 'all' | 'group' | 'channel' | 'contacts'); setAnnouncementTargetId(''); setAnnouncementContactIds([]) }}><option value="all">Alle Kontakte</option><option value="group">Eine Gruppe</option><option value="channel">Ein Kanal</option><option value="contacts">Ausgewählte Kontakte</option></select></label>
                  {(announcementAudience === 'group' || announcementAudience === 'channel') && <label>{announcementAudience === 'group' ? 'Gruppe' : 'Kanal'}<select value={announcementTargetId} onChange={(event) => setAnnouncementTargetId(event.target.value)}><option value="">Bitte auswählen</option>{(announcementAudience === 'group' ? chatLists : chatChannels).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>}
                  {announcementAudience === 'contacts' && <fieldset className="channel-group-select"><legend>Kontakte auswählen</legend>{conversations.filter((conversation) => conversation.systemRole !== 'info').map((conversation) => <label key={conversation.id}><input type="checkbox" checked={announcementContactIds.includes(conversation.id)} onChange={() => setAnnouncementContactIds((current) => current.includes(conversation.id) ? current.filter((id) => id !== conversation.id) : [...current, conversation.id])} />{conversation.kunde}</label>)}</fieldset>}
                  <div className="chat-dialog-actions"><button type="button" onClick={() => setAnnouncementOpen(false)}>Abbrechen</button><button type="button" className="is-primary" onClick={publishAnnouncement}>Veröffentlichen</button></div>
                </div>
              </div>, document.body)}
          </section>

          <section
            className={`col order-col order${orderInline ? ' is-inline' : ' is-pane'}`}
            aria-hidden={infoActive || !!activeGroup || !orderPaneVisible}
          >
            <div className="col-head">
              <div className="col-head-title">
                {!orderInline && (
                  <button
                    type="button"
                    className="order-back"
                    aria-label="Zurück zum Gespräch"
                    title="Zurück"
                    onClick={closeOrderPane}
                  >
                    <svg viewBox="0 0 16 16" width="18" height="18" aria-hidden>
                      <path
                        d="M10.2 3.2 5.4 8l4.8 4.8"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.6"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </button>
                )}
                <h2>Auftrag</h2>
              </div>
              <div className="order-col-head-end">
                <span
                  className={`order-ki${liveFields.size || liveStatus ? ' is-live' : ''}`}
                  title="Anteil der Auftragfelder, die aus dem Chat semantisch erkannt und übernommen wurden"
                >
                  KI {Math.round(Math.max(0, Math.min(1, active.structured.konfidenz)) * 100)}%
                </span>
              </div>
            </div>
            <div className="order-inner">
              <div className={`product-strip${liveFields.has('produkt') ? ' is-live' : ''}`}>
                {active.produktBild ? (
                  <img src={active.produktBild} alt="" />
                ) : (
                  <div className="product-strip-ph" aria-hidden />
                )}
                <div>
                  <h3>{active.structured.produkt || 'Noch kein Auftrag erkannt'}</h3>
                  <p>
                    {[active.structured.sku, active.structured.groesse]
                      .filter(Boolean)
                      .join(' · ') || 'Felder füllen sich mit jeder Chat-Nachricht'}
                  </p>
                </div>
              </div>

              <OrderFields
                structured={active.structured}
                liveFields={liveFields}
                liveTick={liveTick}
                onChange={updateField}
              />

              <div className="status-track">
                {(Object.keys(statusLabel) as OrderStatus[]).map((s) => (
                  <button
                    key={s}
                    type="button"
                    className={`${active.status === s ? 'is-on' : ''}${liveStatus && active.status === s ? ' is-live' : ''}`}
                    onClick={() => setStatus(s)}
                  >
                    {statusLabel[s]}
                  </button>
                ))}
              </div>

              <section className="order-archive" aria-label="Archivierte Aufträge">
                <div className="order-archive-head">
                  <div>
                    <span>ARCHIV</span>
                    <strong>Bestätigte Aufträge</strong>
                  </div>
                  <span>{(archivedOrdersByConversation[active.id] ?? []).length}</span>
                </div>
                {(archivedOrdersByConversation[active.id] ?? []).length ? (
                  <div className="order-archive-list">
                    {(archivedOrdersByConversation[active.id] ?? []).map((order) => (
                      <details className="order-archive-item" key={order.id}>
                        <summary>
                          <span>
                            <strong>{order.orderNumber}</strong>
                            <small>{order.structured.produkt || 'Individueller Auftrag'}</small>
                          </span>
                          <span className="order-archive-meta">
                            {order.source.messageCount} Nachrichten · {formatArchiveTimestamp(order.archivedAt)}
                          </span>
                        </summary>
                        <div className="order-archive-detail">
                          <p>
                            Quellenbereich: {formatArchiveTimestamp(order.source.startAt)} bis {formatArchiveTimestamp(order.source.endAt)}
                          </p>
                          <dl>
                            {orderFieldOrder.map((key) => {
                              const value = order.structured[key]
                              if (!value || key === 'konfidenz') return null
                              return (
                                <div key={key}>
                                  <dt>{orderFieldLabels[key]}</dt>
                                  <dd>{String(value)}</dd>
                                </div>
                              )
                            })}
                          </dl>
                          <details className="order-archive-transcript">
                            <summary>Gespeicherte Chatquellen anzeigen</summary>
                            <ol>
                              {order.source.snapshot.map((message) => (
                                <li key={message.id}>
                                  <strong>{message.direction === 'inbound' ? 'Kunde' : 'Atelier'}:</strong>{' '}
                                  {message.text || 'Mediennachricht'}
                                </li>
                              ))}
                            </ol>
                          </details>
                        </div>
                      </details>
                    ))}
                  </div>
                ) : (
                  <p className="order-archive-empty">
                    Noch kein bestätigter Auftrag. Die Live-Auslesung bleibt ein Entwurf, bis du ihn freigibst.
                  </p>
                )}
              </section>

              <div className="order-actions">
                <button
                  className="btn btn-sage"
                  type="button"
                  disabled={archivingOrder || !active.structured.produkt.trim()}
                  onClick={() => void confirmOrder()}
                >
                  {archivingOrder ? 'Wird archiviert …' : 'Auftrag erstellen'}
                </button>
                <button
                  className="btn btn-line"
                  type="button"
                  disabled={archivingOrder || !active.messages.length}
                  onClick={() => void beginNewOrderDraft()}
                >
                  Neuen Entwurf ab nächster Nachricht beginnen
                </button>
                <button className="btn btn-wa" type="button" onClick={() => sendReply('Angebot folgt in Kürze – danke für die Referenzen!')}>
                  <WhatsAppLogo size={14} />
                  Per WhatsApp antworten
                </button>
                <button className="btn btn-line" type="button" onClick={addReminder}>
                  Erinnerung setzen
                </button>
              </div>
            </div>
          </section>

          {singlePane && (
            <nav className="wa-pane-nav" aria-label="Bereich wählen">
              <button
                type="button"
                className={mobilePane === 'list' ? 'is-on' : ''}
                onClick={() => setMobilePane('list')}
              >
                <span className="wa-pane-nav-icon" aria-hidden>
                  <svg className="wa-pane-nav-contacts-icon" viewBox="0 0 24 24">
                    <circle cx="12" cy="7.25" r="3.25" fill="none" stroke="currentColor" strokeWidth="1.8" />
                    <path d="M5.25 20c.38-4.15 2.78-6.25 6.75-6.25s6.37 2.1 6.75 6.25" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                  </svg>
                </span>
                <span>Kontakt</span>
              </button>
              <button
                type="button"
                className={mobilePane === 'chat' ? 'is-on' : ''}
                disabled={!activeId}
                onClick={() => setMobilePane('chat')}
              >
                <span className="wa-pane-nav-icon" aria-hidden>
                  <svg viewBox="0 0 24 24"><path d="M4 5.5h16v11H9l-5 3z" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" /></svg>
                </span>
                <span>Chat</span>
              </button>
              <button
                type="button"
                className={mobilePane === 'order' ? 'is-on' : ''}
                disabled={!activeId}
                onClick={() => setMobilePane('order')}
              >
                <span className="wa-pane-nav-icon" aria-hidden>
                  <svg viewBox="0 0 24 24"><path d="M7 4h10v16H7zM9.5 8h5M9.5 12h5M9.5 16h3" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>
                </span>
                <span>Auftrag</span>
              </button>
            </nav>
          )}
        </div>
      )}

      {view === 'home' && !IS_WHATSAPP_PREVIEW && (
        <div className="workspace single">
          <h1 className="page-title">Home</h1>
          <p className="page-lead">Willkommen bei {PRODUCT_NAME}.</p>
          <div className="stats">
            <button type="button" className="stat stat-link" onClick={() => goToView('whatsapp')}>
              <span>WhatsApp</span>
              <strong>{conversations.length}</strong>
            </button>
            <button type="button" className="stat stat-link" onClick={() => goToView('auftraege')}>
              <span>Aufträge</span>
              <strong>{orderConversations.length}</strong>
            </button>
            <button type="button" className="stat stat-link" onClick={() => goToView('agenda')}>
              <span>Agenda</span>
              <strong>{openTodos}</strong>
            </button>
            <button type="button" className="stat stat-link" onClick={() => goToView('kunden')}>
              <span>Kunden</span>
              <strong>{listCustomers().length}</strong>
            </button>
          </div>
        </div>
      )}

      {view === 'auftraege' && !IS_WHATSAPP_PREVIEW && (
        <div className="workspace single orders-page">
          <h1 className="page-title">Aufträge</h1>
          <div className="stats">
            <div className="stat"><span>Offen</span><strong>{semanticCounts.offen}</strong></div>
            <div className="stat"><span>Ungelesen</span><strong>{unread}</strong></div>
            <div className="stat"><span>Agenda</span><strong>{openTodos}</strong></div>
            <div className="stat"><span>In Arbeit</span><strong>{semanticCounts.bearbeitung}</strong></div>
          </div>

          <div className="orders-layout">
            <section className="orders-list">
              <div className="section-head">
                <h2>Alle Aufträge</h2>
              </div>
              <table className="table">
                <thead>
                  <tr>
                    <th>Kunde</th>
                    <th>Werkstück</th>
                    <th>Termin</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {orderConversations.map((c) => (
                    <tr
                      key={c.id}
                      className={c.id === selectedOrderId ? 'is-selected' : ''}
                      onClick={() => setSelectedOrderId(c.id)}
                    >
                      <td>
                        {c.kunde}
                        {c.id === 'demo-marie' && <span className="demo-pill">Demo</span>}
                        {c.id === 'demo-anna' && <span className="demo-pill">Live</span>}
                      </td>
                      <td className="prod">{c.structured.produkt}</td>
                      <td>{c.structured.termin}</td>
                      <td>{statusLabel[c.status]}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="orders-archive-index">
                <div className="section-head">
                  <h2>Auftragsarchiv</h2>
                  <span className="order-meta">{archivedOrderRows.length} bestätigt</span>
                </div>
                {archivedOrderRows.length ? (
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Auftrag</th>
                        <th>Kunde</th>
                        <th>Quellen</th>
                        <th>Erstellt</th>
                      </tr>
                    </thead>
                    <tbody>
                      {archivedOrderRows.map(({ order, conversation }) => (
                        <tr key={order.id} onClick={() => selectThread(order.conversationId)}>
                          <td>
                            <strong>{order.orderNumber}</strong>
                            <span className="table-subline">{order.structured.produkt || 'Individueller Auftrag'}</span>
                          </td>
                          <td>{conversation?.kunde || 'Kontakt gelöscht'}</td>
                          <td>{order.source.messageCount} Nachrichten</td>
                          <td>{formatArchiveTimestamp(order.archivedAt)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <p className="order-archive-empty">
                    Archivierte Aufträge erscheinen hier nach ihrer bewussten Freigabe.
                  </p>
                )}
              </div>
            </section>

            <section className="order-dossier">
              <div className="section-head">
                <h2>Auftragsdossier</h2>
                <span className="order-meta">
                  {Math.round(Math.max(0, Math.min(1, selectedOrder.structured.konfidenz)) * 100)}% · KI-Erkennung
                </span>
              </div>

              <div className="order-dossier-head">
                <img
                  src={selectedOrder.produktBild ?? '/products/blickfang.jpg'}
                  alt=""
                />
                <div>
                  <h3>{selectedOrder.kunde}</h3>
                  <p>{selectedOrder.telefon}</p>
                  <span className="status-pill">{statusLabel[selectedOrder.status]}</span>
                </div>
              </div>

              <dl className="order-fields">
                {orderFieldOrder.map((key) => {
                  const value = selectedOrder.structured[key]
                  if (!value || key === 'konfidenz') return null
                  const label = orderFieldLabels[key]
                  if (!label) return null
                  return (
                    <div className="order-field" key={key}>
                      <dt>{label}</dt>
                      <dd>{String(value)}</dd>
                    </div>
                  )
                })}
              </dl>

              <OfferEditor conversation={selectedOrder} onToast={showToast} />

              <div className="order-dossier-actions">
                <button
                  className="btn btn-sage"
                  type="button"
                  onClick={() => selectThread(selectedOrder.id)}
                >
                  Chat öffnen
                </button>
                {(selectedOrder.id === 'demo-marie' || selectedOrder.id === 'demo-anna') && (
                  <button
                    className="btn btn-line"
                    type="button"
                    onClick={() =>
                      showToast(
                        selectedOrder.id === 'demo-anna'
                          ? 'Live-Kundin Anna Hartmann (Test) · Chat antwortet selbst'
                          : 'Demo-Auftrag · Referenz für Präsentation',
                      )
                    }
                  >
                    {selectedOrder.id === 'demo-anna' ? 'Live-Kundin' : 'Referenz-Demo'}
                  </button>
                )}
              </div>
            </section>
          </div>
        </div>
      )}

      {view === 'agenda' && !IS_WHATSAPP_PREVIEW && (
        <div className="workspace single">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'end', gap: '1rem' }}>
            <h1 className="page-title">Agenda</h1>
            <button
              className="btn btn-dark"
              type="button"
              onClick={() => {
                setTodos((prev) => [
                  { id: `t-${Date.now()}`, title: 'Neues To-Do', due: 'Heute', done: false, kind: 'todo' },
                  ...prev,
                ])
                showToast('To-Do hinzugefügt')
              }}
            >
              Neu
            </button>
          </div>
          {todos.map((t) => (
            <label key={t.id} className={`todo ${t.done ? 'is-done' : ''}`}>
              <input type="checkbox" checked={t.done} onChange={() => setTodos((prev) => prev.map((x) => (x.id === t.id ? { ...x, done: !x.done } : x)))} />
              <div>
                <p className="t">{t.title}</p>
                <div className="m">
                  <span>{t.kind === 'reminder' ? 'Erinnerung' : 'To-Do'}</span>
                  <span>{t.due}</span>
                  {t.relatedTo && <span>{t.relatedTo}</span>}
                </div>
              </div>
            </label>
          ))}
        </div>
      )}

      {view === 'kunden' && !IS_WHATSAPP_PREVIEW && (
        <div className="workspace single orders-page">
          <h1 className="page-title">Kunden</h1>
          <div className="orders-layout">
            <section className="orders-list">
              <div className="section-head">
                <h2>Stammdaten</h2>
              </div>
              <table className="table">
                <thead>
                  <tr>
                    <th>Kunden-Nr.</th>
                    <th>Name</th>
                    <th>Adresse</th>
                    <th>Telefon</th>
                  </tr>
                </thead>
                <tbody>
                  {listCustomers().map((c) => (
                    <tr key={c.kundenNr}>
                      <td>{c.kundenNr}</td>
                      <td>
                        {[c.anrede, c.name].filter(Boolean).join(' ')}
                      </td>
                      <td>
                        {[c.strasse, c.plzOrt].filter(Boolean).join(', ') || '—'}
                      </td>
                      <td>{c.telefon || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          </div>
        </div>
      )}

      {view === 'kollektion' && !IS_WHATSAPP_PREVIEW && (
        <div className="workspace single" style={{ maxWidth: 1100 }}>
          <h1 className="page-title">Kollektion</h1>
          <div className="grid-products">
            {products.map((p) => (
              <button
                key={p.id}
                className="p-card"
                type="button"
                onClick={() => {
                  showToast(`${p.name} als Referenz`)
                  goToView('whatsapp')
                }}
              >
                <img src={p.image} alt={p.name} />
                <figcaption>
                  <div className="n">{p.name}</div>
                  <div className="p">{p.price} · {p.sku}</div>
                </figcaption>
              </button>
            ))}
          </div>
        </div>
      )}

      {mediaLightbox &&
        createPortal(
          <div
            className="media-lightbox"
            role="dialog"
            aria-modal="true"
            aria-label={mediaLightbox.kind === 'video' ? 'Video' : 'Bild'}
            onClick={() => setMediaLightbox(null)}
          >
            <button
              type="button"
              className="media-lightbox-close"
              aria-label="Schließen"
              onClick={() => setMediaLightbox(null)}
            >
              <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden>
                <path
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  d="M6.4 6.4 17.6 17.6M17.6 6.4 6.4 17.6"
                />
              </svg>
            </button>
            <div
              className="media-lightbox-stage"
              onClick={(e) => e.stopPropagation()}
            >
              {mediaLightbox.forwarded && <ForwardedLabel tone="lightbox" />}
              {mediaLightbox.kind === 'image' ? (
                <img src={mediaLightbox.src} alt="" />
              ) : (
                <video
                  src={mediaLightbox.src}
                  poster={mediaLightbox.poster}
                  controls
                  autoPlay
                  playsInline
                />
              )}
              {mediaLightbox.caption && (
                <p className="media-lightbox-caption">{mediaLightbox.caption}</p>
              )}
            </div>
          </div>,
          document.body,
        )}

      {toast && (
        <div className="toast" role="status">
          <WhatsAppLogo size={16} />
          {toast}
        </div>
      )}

      {chatContextMenu &&
        createPortal(
          <div
            className="chat-context-menu"
            role="menu"
            style={{ top: chatContextMenu.top, left: chatContextMenu.left }}
          >
            <button
              type="button"
              role="menuitem"
              onClick={() => beginConversationSelection(chatContextMenu.conversationId)}
            >
              Markieren
            </button>
          </div>,
          document.body,
        )}

      {bulkGroupDialogOpen &&
        createPortal(
          <div className="chat-dialog-backdrop" role="presentation" onClick={() => setBulkGroupDialogOpen(false)}>
            <div className="chat-dialog" role="dialog" aria-modal="true" aria-label="Chats gruppieren" onClick={(event) => event.stopPropagation()}>
              <h3>Chats gruppieren</h3>
              <p className="chat-dialog-hint">Die Chats bleiben getrennt. Kundenzettel ordnet sie nur gemeinsam einer Kundengruppe zu.</p>
              <label>
                Bestehende Kundengruppe
                <select value={bulkGroupExistingId} onChange={(event) => setBulkGroupExistingId(event.target.value)}>
                  <option value="">Neue Kundengruppe erstellen</option>
                  {chatLists.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
                </select>
              </label>
              {!bulkGroupExistingId && (
                <label>
                  Name der Kundengruppe
                  <input autoFocus value={bulkGroupName} onChange={(event) => setBulkGroupName(event.target.value)} placeholder="z. B. Hochzeiten 2026" />
                </label>
              )}
              <div className="chat-dialog-actions">
                <button type="button" onClick={() => setBulkGroupDialogOpen(false)}>Abbrechen</button>
                <button type="button" className="is-primary" onClick={() => void groupSelectedConversations()}>
                  {bulkGroupExistingId ? 'Hinzufügen' : 'Gruppe erstellen'}
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}

      {bulkGroupManageOpen &&
        createPortal(
          <div className="chat-dialog-backdrop" role="presentation" onClick={() => setBulkGroupManageOpen(false)}>
            <div className="chat-dialog bulk-group-manager" role="dialog" aria-modal="true" aria-label="Gruppen für ausgewählte Chats verwalten" onClick={(event) => event.stopPropagation()}>
              <h3>Gruppen verwalten</h3>
              <p className="chat-dialog-hint">Du entscheidest je Gruppe, ob die markierten Chats nur gelöst werden oder die gesamte Gruppe aufgelöst wird.</p>
              <div className="bulk-group-list">
                {selectedGroupMemberships.map(({ group, selectedIds, includesEntireGroup }) => (
                  <section key={group.id} className="bulk-group-item">
                    <div className="bulk-group-item-head">
                      <strong>{group.name}</strong>
                      <span>{selectedIds.length} von {group.chatIds.length} markiert</span>
                    </div>
                    <p>{includesEntireGroup ? 'Alle Chats dieser Gruppe sind ausgewählt.' : 'Nicht markierte Chats bleiben in dieser Gruppe.'}</p>
                    <div className="bulk-group-item-actions">
                      <button type="button" onClick={() => void removeSelectedConversationsFromGroup(group.id)}>Aus Gruppe lösen</button>
                      {includesEntireGroup && (
                        <button type="button" className="is-danger" onClick={() => setGroupDissolveTarget(group.id)}>Gruppe auflösen</button>
                      )}
                    </div>
                  </section>
                ))}
                {selectedGroupMemberships.length === 0 && <p className="bulk-group-empty">Die ausgewählten Chats gehören zu keiner Gruppe.</p>}
              </div>
              <div className="chat-dialog-actions">
                <button type="button" onClick={() => setBulkGroupManageOpen(false)}>Fertig</button>
              </div>
            </div>
          </div>,
          document.body,
        )}

      {groupDissolveTarget &&
        createPortal(
          <div className="chat-dialog-backdrop" role="presentation" onClick={() => !groupDissolveBusy && setGroupDissolveTarget(null)}>
            <div className="chat-dialog group-dissolve-dialog" role="dialog" aria-modal="true" aria-label="Gruppe löschen bestätigen" onClick={(event) => event.stopPropagation()}>
              <h3>Gruppe auflösen und löschen?</h3>
              <p className="chat-dialog-hint">„{chatLists.find((group) => group.id === groupDissolveTarget)?.name || 'Diese Gruppe'}“ wird als Kundenzettel-Gruppe gelöscht. Die Einzelchats bleiben erhalten; ihre Gruppenzuordnung, der Gruppenverlauf und nicht mehr belegte Kanäle werden entfernt.</p>
              <div className="chat-dialog-actions">
                <button type="button" disabled={groupDissolveBusy} onClick={() => setGroupDissolveTarget(null)}>Abbrechen</button>
                <button type="button" className="is-danger" disabled={groupDissolveBusy} onClick={() => void confirmGroupDissolve()}>{groupDissolveBusy ? 'Wird gelöscht …' : 'Gruppe löschen'}</button>
              </div>
            </div>
          </div>,
          document.body,
        )}

      {bulkDeleteIds &&
        createPortal(
          <div className="chat-dialog-backdrop" role="presentation">
            <div className="msg-delete-dialog" role="dialog" aria-modal="true" aria-label="Mehrere Chats endgültig löschen">
              <h3>{bulkDeleteIds.length} Chats endgültig löschen?</h3>
              <p className="chat-dialog-hint">Die ausgewählten Chats, ihre Aufträge und nicht mehr verwendeten privaten Mediendateien werden aus Kundenzettel entfernt. Bereits bei WhatsApp oder Meta vorhandene Nachrichten bleiben davon unberührt.</p>
              <div className="chat-dialog-actions">
                <button type="button" disabled={bulkDeleteBusy} onClick={() => setBulkDeleteIds(null)}>Abbrechen</button>
                <button type="button" className="is-primary" disabled={bulkDeleteBusy} onClick={() => void confirmBulkConversationDeletion()}>
                  {bulkDeleteBusy ? 'Wird gelöscht …' : 'Endgültig in Kundenzettel löschen'}
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}

      {groupSubmenu &&
        createPortal(
          <div
            className="thread-submenu is-open"
            style={{ top: groupSubmenu.top, left: groupSubmenu.left }}
            role="menu"
            ref={groupSubmenuRef}
          >
            {chatLists.length === 0 && (
              <p className="thread-submenu-empty">Noch keine Gruppe angelegt</p>
            )}
            {chatLists.map((list) => {
              const inList = list.chatIds.includes(groupSubmenu.chatId)
              return (
                <button
                  key={list.id}
                  type="button"
                  className={`thread-menu-item${inList ? ' is-on' : ''}`}
                  onClick={() => void toggleChatInList(list.id, groupSubmenu.chatId)}
                >
                  {inList ? `Aus „${list.name}“ entfernen` : `Zu „${list.name}“ hinzufügen`}
                </button>
              )
            })}
            <button
              type="button"
              className="thread-menu-item"
              onClick={() => addChatToGroup(groupSubmenu.chatId)}
            >
              Neue Gruppe
            </button>
          </div>,
          document.body,
        )}

      <InterestLead />
      <LegalMenu />
      <InstallPrompt />
    </div>
  )
}
