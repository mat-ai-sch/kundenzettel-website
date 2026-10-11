import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { ChatList, Conversation, GroupMessage } from './data'

type GroupSendResult = {
  queuedCount: number
  skippedCount: number
}

type GroupWorkspaceProps = {
  group: ChatList
  conversations: Conversation[]
  operatorReady: boolean
  onBack: () => void
  onOpenConversation: (conversationId: string) => void
  onAddMember: (conversationId: string) => Promise<boolean>
  onRemoveMember: (conversationId: string) => Promise<boolean>
  onRequestDissolve: () => void
  onSend: (text: string) => Promise<GroupSendResult | undefined>
  onToast: (message: string) => void
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')
}

function formatDate(value: string) {
  try {
    return new Intl.DateTimeFormat('de-DE', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(value))
  } catch {
    return value
  }
}

function GroupMark({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="9" cy="8" r="3" stroke="currentColor" strokeWidth="1.65" />
      <path d="M3.6 19c.75-3.1 2.75-4.8 5.4-4.8s4.65 1.7 5.4 4.8" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" />
      <path d="M16 8.2a2.55 2.55 0 0 1 0 5.05M17.2 14.55c1.75.35 2.85 1.8 3.2 4.1" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" />
    </svg>
  )
}

export function GroupOverview({
  groups,
  conversations,
  onOpenGroup,
}: {
  groups: ChatList[]
  conversations: Conversation[]
  onOpenGroup: (groupId: string) => void
}) {
  const conversationById = useMemo(
    () => new Map(conversations.filter((item) => !item.systemRole).map((item) => [item.id, item])),
    [conversations],
  )

  return (
    <div className="group-overview" aria-label="Gruppenübersicht">
      <div className="group-overview-heading">
        <span className="group-overview-icon"><GroupMark size={20} /></span>
        <div>
          <span>GRUPPEN</span>
          <h3>Deine Gruppen</h3>
        </div>
      </div>
      <p className="group-overview-intro">
        Gruppen bündeln bestehende Einzelchats im Kundenzettel. Öffne eine Gruppe, um ihre Mitglieder zu verwalten oder eine Nachricht getrennt an die verfügbaren Mitglieder zu übergeben.
      </p>
      {groups.length === 0 ? (
        <div className="group-overview-empty">
          <strong>Noch keine Gruppe angelegt</strong>
          <p>Markiere mindestens zwei Chats und wähle anschließend „Gruppieren“.</p>
        </div>
      ) : (
        <div className="group-overview-list">
          {groups.map((group) => {
            const members = group.chatIds
              .map((id) => conversationById.get(id))
              .filter((item): item is Conversation => Boolean(item))
            const names = members.map((member) => member.kunde).join(', ')
            return (
              <button
                key={group.id}
                type="button"
                className="group-overview-row"
                onClick={() => onOpenGroup(group.id)}
              >
                <span className="group-overview-avatars" aria-hidden>
                  {members.slice(0, 3).map((member, index) => (
                    <span key={member.id} className="group-overview-avatar" style={{ zIndex: 3 - index }}>
                      {initials(member.kunde)}
                    </span>
                  ))}
                  {members.length === 0 && <span className="group-overview-avatar is-empty"><GroupMark size={18} /></span>}
                </span>
                <span className="group-overview-copy">
                  <strong>{group.name}</strong>
                  <small>{members.length === 1 ? '1 Mitglied' : `${members.length} Mitglieder`}</small>
                  <span>{names || 'Noch keine Mitglieder'}</span>
                </span>
                <span className="group-overview-arrow" aria-hidden>›</span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

export function GroupWorkspace({
  group,
  conversations,
  operatorReady,
  onBack,
  onOpenConversation,
  onAddMember,
  onRemoveMember,
  onRequestDissolve,
  onSend,
  onToast,
}: GroupWorkspaceProps) {
  const [infoOpen, setInfoOpen] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)
  const [addingOpen, setAddingOpen] = useState(false)
  const [draft, setDraft] = useState('')
  const [pendingText, setPendingText] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const [memberBusyId, setMemberBusyId] = useState<string | null>(null)
  const infoAnchorRef = useRef<HTMLDivElement>(null)
  const moreMenuRef = useRef<HTMLDivElement>(null)
  const [infoPosition, setInfoPosition] = useState({ top: 0, left: 0 })

  const members = useMemo(
    () => group.chatIds
      .map((id) => conversations.find((conversation) => conversation.id === id))
      .filter((conversation): conversation is Conversation => conversation !== undefined && !conversation.systemRole),
    [conversations, group.chatIds],
  )
  const available = useMemo(
    () => conversations.filter((conversation) => !conversation.systemRole && !group.chatIds.includes(conversation.id)),
    [conversations, group.chatIds],
  )
  const eligibleCount = members.filter((member) => member.replyWindowOpen !== false && !member.blocked).length
  const unavailableCount = members.length - eligibleCount
  const messages = group.messages ?? []

  function updateInfoPosition() {
    const anchor = infoAnchorRef.current
    if (!anchor || typeof window === 'undefined') return
    const bounds = anchor.getBoundingClientRect()
    const width = Math.min(420, Math.max(280, window.innerWidth - 32))
    setInfoPosition({
      top: Math.max(12, bounds.bottom + 10),
      left: Math.max(12, Math.min(bounds.left - 47, window.innerWidth - width - 12)),
    })
  }

  function toggleGroupInfo() {
    if (infoOpen) {
      setInfoOpen(false)
      return
    }
    updateInfoPosition()
    setMoreOpen(false)
    setInfoOpen(true)
  }

  useEffect(() => {
    if (!infoOpen) return undefined
    const syncPosition = () => updateInfoPosition()
    window.addEventListener('resize', syncPosition)
    return () => window.removeEventListener('resize', syncPosition)
  }, [infoOpen])

  useEffect(() => {
    if (!infoOpen && !moreOpen) return undefined
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      setInfoOpen(false)
      setMoreOpen(false)
    }
    const closeMoreOnOutsidePointer = (event: PointerEvent) => {
      if (!moreOpen || !moreMenuRef.current) return
      if (event.target instanceof Node && !moreMenuRef.current.contains(event.target)) {
        setMoreOpen(false)
      }
    }
    window.addEventListener('keydown', closeOnEscape)
    window.addEventListener('pointerdown', closeMoreOnOutsidePointer)
    return () => {
      window.removeEventListener('keydown', closeOnEscape)
      window.removeEventListener('pointerdown', closeMoreOnOutsidePointer)
    }
  }, [infoOpen, moreOpen])

  async function addMember(conversationId: string) {
    setMemberBusyId(conversationId)
    try {
      const added = await onAddMember(conversationId)
      if (added) {
        setAddingOpen(false)
        onToast('Mitglied hinzugefügt')
      }
    } finally {
      setMemberBusyId(null)
    }
  }

  async function removeMember(conversationId: string) {
    setMemberBusyId(conversationId)
    try {
      const removed = await onRemoveMember(conversationId)
      if (removed) onToast('Mitglied aus der Gruppe entfernt')
    } finally {
      setMemberBusyId(null)
    }
  }

  async function confirmSend() {
    if (!pendingText || sending) return
    setSending(true)
    try {
      const result = await onSend(pendingText)
      if (result) {
        setDraft('')
        setPendingText(null)
        onToast(
          result.queuedCount > 0
            ? `An ${result.queuedCount} ${result.queuedCount === 1 ? 'Mitglied' : 'Mitglieder'} übergeben`
            : 'Keine Nachricht konnte versendet werden',
        )
      }
    } finally {
      setSending(false)
    }
  }

  return (
    <>
      <div className="chat-head group-chat-head">
        <button type="button" className="chat-back" aria-label="Zurück zur Gruppenübersicht" title="Zurück" onClick={onBack}>
          <svg viewBox="0 0 16 16" width="18" height="18" aria-hidden>
            <path d="M10.2 3.2 5.4 8l4.8 4.8" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <span className="avatar group-chat-avatar" aria-hidden><GroupMark size={22} /></span>
        <div className="group-chat-title-wrap" ref={infoAnchorRef}>
          <button
            type="button"
            className="group-chat-title"
            onClick={toggleGroupInfo}
            aria-haspopup="dialog"
            aria-expanded={infoOpen}
          >
            <strong>{group.name}</strong>
            <span>{members.length === 1 ? '1 Mitglied' : `${members.length} Mitglieder`} · Klicke hier für Gruppeninfo</span>
          </button>
        </div>
        <div className="group-chat-head-actions">
          <button type="button" className="group-chat-icon" aria-label="Gruppeninfo" title="Gruppeninfo" onClick={toggleGroupInfo}>
            <svg viewBox="0 0 24 24" fill="none" aria-hidden><circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="1.6" /><path d="M12 10.6v5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /><circle cx="12" cy="7.6" r="1" fill="currentColor" /></svg>
          </button>
          <div className="group-chat-more-wrap" ref={moreMenuRef}>
            <button type="button" className="group-chat-icon" aria-label="Gruppenoptionen" title="Gruppenoptionen" aria-expanded={moreOpen} onClick={() => setMoreOpen((value) => !value)}>
              <svg viewBox="0 0 24 24" aria-hidden><circle cx="5" cy="12" r="1.7" fill="currentColor" /><circle cx="12" cy="12" r="1.7" fill="currentColor" /><circle cx="19" cy="12" r="1.7" fill="currentColor" /></svg>
            </button>
            {moreOpen && (
              <div className="group-chat-menu" role="menu">
                <button type="button" role="menuitem" onClick={() => { setMoreOpen(false); setAddingOpen(true) }}>
                  <span>＋</span> Mitglied hinzufügen
                </button>
                <button type="button" role="menuitem" onClick={toggleGroupInfo}>
                  <span>ⓘ</span> Gruppeninfo
                </button>
                <div />
                <button type="button" role="menuitem" className="is-danger" onClick={() => { setMoreOpen(false); onRequestDissolve() }}>
                  <span>⊖</span> Gruppe löschen
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {infoOpen && typeof document !== 'undefined' && createPortal(
        <>
          <button type="button" className="group-info-backdrop" aria-label="Gruppeninfo schließen" onClick={() => setInfoOpen(false)} />
          <section
            className="group-info-popover"
            role="dialog"
            aria-modal="true"
            aria-label={`Gruppeninfo für ${group.name}`}
            style={infoPosition}
          >
            <header>
              <span className="group-info-symbol"><GroupMark size={24} /></span>
              <div><span>GRUPPENINFO</span><h3>{group.name}</h3></div>
              <button type="button" aria-label="Gruppeninfo schließen" onClick={() => setInfoOpen(false)}>×</button>
            </header>
            <p className="group-info-caption">{members.length === 1 ? '1 Mitglied' : `${members.length} Mitglieder`}</p>
            <button type="button" className="group-info-add" onClick={() => setAddingOpen(true)}><span>＋</span> Mitglied hinzufügen</button>
            <div className="group-info-members">
              {members.length === 0 ? <p>Noch keine Mitglieder hinzugefügt.</p> : members.map((member) => (
                <div className="group-info-member" key={member.id}>
                  <button type="button" className="group-info-member-main" onClick={() => { setInfoOpen(false); onOpenConversation(member.id) }}>
                    <span className="avatar">{initials(member.kunde)}</span>
                    <span><strong>{member.kunde}</strong><small>{member.replyWindowOpen === false ? 'Textfenster geschlossen' : member.telefon}</small></span>
                  </button>
                  <button type="button" className="group-info-remove" aria-label={`${member.kunde} aus Gruppe entfernen`} disabled={memberBusyId === member.id} onClick={() => void removeMember(member.id)}>Entfernen</button>
                </div>
              ))}
            </div>
            <button type="button" className="group-info-dissolve" onClick={() => { setInfoOpen(false); onRequestDissolve() }}>Gruppe löschen</button>
          </section>
        </>,
        document.body,
      )}

      <section className="group-workspace" aria-label={`Gruppe ${group.name}`}>
        <div className="group-workspace-notice">
          <span><GroupMark size={18} /></span>
          <p><strong>Gemeinsame Nachricht</strong> wird einzeln an die Mitglieder übergeben. Antworten bleiben in den jeweiligen Einzelchats.</p>
        </div>
        <div className="group-workspace-timeline">
          {messages.length === 0 ? (
            <div className="group-workspace-empty">
              <span><GroupMark size={28} /></span>
              <strong>Noch keine Gruppennachricht</strong>
              <p>Schreibe eine Nachricht, wenn du die berechtigten Mitglieder gleichzeitig informieren möchtest.</p>
            </div>
          ) : messages.map((message: GroupMessage) => (
            <article className="group-message-card" key={message.id}>
              <div className="group-message-card-head">
                <span>AN GRUPPE</span>
                <time>{formatDate(message.createdAt)}</time>
              </div>
              <p>{message.text}</p>
              <footer>
                <span>{message.queuedCount} {message.queuedCount === 1 ? 'Nachricht' : 'Nachrichten'} in Übergabe</span>
                {message.skippedCount > 0 && <span>{message.skippedCount} derzeit nicht berechtigt</span>}
              </footer>
            </article>
          ))}
        </div>
        <div className="group-composer">
          <textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder={members.length ? `Nachricht an ${members.length} ${members.length === 1 ? 'Mitglied' : 'Mitglieder'} schreiben …` : 'Füge zuerst mindestens ein Mitglied hinzu …'}
            aria-label="Gruppennachricht"
            maxLength={4096}
            disabled={!members.length || !operatorReady}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
                event.preventDefault()
                if (draft.trim()) setPendingText(draft.trim())
              }
            }}
          />
          <div className="group-composer-meta">
            <span>{members.length ? `${eligibleCount} von ${members.length} derzeit für Textnachrichten verfügbar` : 'Noch keine Mitglieder'}</span>
            <button type="button" disabled={!draft.trim() || !members.length || !operatorReady} onClick={() => setPendingText(draft.trim())}>
              <span>Nachricht prüfen</span>
              <svg viewBox="0 0 24 24" aria-hidden><path d="M4 12 20 4l-5.2 16-3.2-6.4L4 12Z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" /><path d="m11.6 13.6 4.8-4.8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
            </button>
          </div>
        </div>
      </section>

      {addingOpen && (
        <div className="chat-dialog-backdrop" role="presentation" onClick={() => setAddingOpen(false)}>
          <section className="chat-dialog group-add-dialog" role="dialog" aria-modal="true" aria-label="Mitglied hinzufügen" onClick={(event) => event.stopPropagation()}>
            <h3>Mitglied hinzufügen</h3>
            <p className="chat-dialog-hint">Wähle einen bestehenden Einzelchat aus. Der Kontakt wird nicht in eine native WhatsApp-Gruppe verschoben.</p>
            <div className="group-add-list">
              {available.length === 0 ? <p>Alle vorhandenen Chats sind bereits Mitglied.</p> : available.map((conversation) => (
                <button type="button" key={conversation.id} disabled={memberBusyId === conversation.id} onClick={() => void addMember(conversation.id)}>
                  <span className="avatar">{initials(conversation.kunde)}</span>
                  <span><strong>{conversation.kunde}</strong><small>{conversation.telefon}</small></span>
                  <span aria-hidden>＋</span>
                </button>
              ))}
            </div>
            <button type="button" className="chat-dialog-cancel" onClick={() => setAddingOpen(false)}>Abbrechen</button>
          </section>
        </div>
      )}

      {pendingText !== null && (
        <div className="chat-dialog-backdrop" role="presentation" onClick={() => !sending && setPendingText(null)}>
          <section className="chat-dialog group-send-dialog" role="dialog" aria-modal="true" aria-label="Gruppennachricht bestätigen" onClick={(event) => event.stopPropagation()}>
            <span className="group-send-symbol"><GroupMark size={24} /></span>
            <h3>Nachricht an Gruppe senden?</h3>
            <p>Der Text wird als einzelne WhatsApp-Nachricht an {eligibleCount} {eligibleCount === 1 ? 'Mitglied' : 'Mitglieder'} übergeben.</p>
            {unavailableCount > 0 && <p className="group-send-caution">{unavailableCount} {unavailableCount === 1 ? 'Mitglied ist' : 'Mitglieder sind'} wegen eines geschlossenen 24-Stunden-Fensters oder einer Blockierung ausgenommen.</p>}
            <blockquote>{pendingText}</blockquote>
            <div className="chat-dialog-actions">
              <button type="button" disabled={sending} onClick={() => setPendingText(null)}>Abbrechen</button>
              <button type="button" className="is-primary" disabled={sending || eligibleCount === 0} onClick={() => void confirmSend()}>{sending ? 'Wird übergeben …' : `An ${eligibleCount} senden`}</button>
            </div>
          </section>
        </div>
      )}
    </>
  )
}
