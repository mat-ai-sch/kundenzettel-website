import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react'
import { createPortal } from 'react-dom'
import type { Message } from '../../data'
import { ForwardedLabel, MediaZoomIcon, VideoMessage, type MediaLightboxItem } from './MessageMedia'
import { VoiceMessage } from './VoiceMessage'
import { IconMsgTicks } from './IconMsgTicks'
import { MsgMenuIcon } from './MsgMenuIcon'
import { QUICK_REACTIONS } from './messagePreview'

export function MessageBubble({
  message,
  poster,
  menuOpen,
  selectMode,
  selected,
  onToggleMenu,
  onCloseMenu,
  onReply,
  onCopy,
  onForward,
  onPin,
  onAskAi,
  onStar,
  onSelect,
  onDelete,
  onReact,
  onOpenMedia,
}: {
  message: Message
  poster?: string
  menuOpen: boolean
  selectMode: boolean
  selected: boolean
  onToggleMenu: (anchor: DOMRect) => void
  onCloseMenu: () => void
  onReply: () => void
  onCopy: () => void
  onForward: () => void
  onPin: () => void
  onAskAi: () => void
  onStar: () => void
  onSelect: () => void
  onDelete: () => void
  onReact: (emoji: string) => void
  onOpenMedia: (item: MediaLightboxItem) => void
}) {
  const rowRef = useRef<HTMLDivElement>(null)
  const [menuPos, setMenuPos] = useState<{
    placement: 'up' | 'down'
    top?: number
    bottom?: number
    left: number
    reactLeft: number
  } | null>(null)

  useEffect(() => {
    if (!menuOpen) {
      setMenuPos(null)
      return
    }
    function onDoc(e: MouseEvent) {
      const t = e.target as Node
      if (rowRef.current?.contains(t)) return
      if ((t as Element).closest?.('.msg-flyout')) return
      onCloseMenu()
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onCloseMenu()
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [menuOpen, onCloseMenu])

  useEffect(() => {
    if (!menuOpen || !rowRef.current) return

    function place() {
      const bubble = rowRef.current?.querySelector('.bubble') as HTMLElement | null
      if (!bubble && !rowRef.current) return
      const rect = (bubble ?? rowRef.current)!.getBoundingClientRect()
      const menuW = 220
      const reactW = 280
      const flyoutH = 400
      const gap = 6
      const isOut = message.from === 'atelier'
      const left = isOut
        ? Math.max(8, rect.right - menuW)
        : Math.min(window.innerWidth - menuW - 8, rect.left)
      const reactLeft = isOut
        ? Math.max(8, rect.right - reactW)
        : Math.min(window.innerWidth - reactW - 8, rect.left)

      const spaceBelow = window.innerHeight - rect.bottom - gap
      const spaceAbove = rect.top - gap
      const openUp = spaceBelow < flyoutH && spaceAbove > spaceBelow

      if (openUp) {
        setMenuPos({
          placement: 'up',
          bottom: Math.max(8, window.innerHeight - rect.top + gap),
          left,
          reactLeft,
        })
      } else {
        setMenuPos({
          placement: 'down',
          top: Math.min(rect.bottom + gap, window.innerHeight - 120),
          left,
          reactLeft,
        })
      }
    }

    place()
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => {
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
    }
  }, [menuOpen, message.from])

  function openMenu(e: ReactMouseEvent) {
    e.stopPropagation()
    const bubble = rowRef.current?.querySelector('.bubble') as HTMLElement | null
    const rect = (bubble ?? rowRef.current)!.getBoundingClientRect()
    onToggleMenu(rect)
  }

  return (
    <div
      ref={rowRef}
      id={`msg-${message.id}`}
      className={`bubble-row ${message.from}${menuOpen ? ' is-menu-open' : ''}${selected ? ' is-selected' : ''}${message.starred ? ' is-starred' : ''}${message.pinned ? ' is-pinned-msg' : ''}`}
    >
      {selectMode && (
        <button
          type="button"
          className={`msg-select-check${selected ? ' is-on' : ''}`}
          aria-label="Nachricht auswählen"
          aria-pressed={selected}
          onClick={onSelect}
        >
          {selected ? '✓' : ''}
        </button>
      )}
      <div className={`bubble${message.deletedForEveryone ? ' is-deleted' : ''}`}>
        {!message.deletedForEveryone && (
          <button
            type="button"
            className="msg-menu-btn"
            aria-label="Nachrichtenoptionen"
            aria-expanded={menuOpen}
            title="Optionen"
            onClick={openMenu}
          >
            <svg viewBox="0 0 10 6" aria-hidden>
              <path d="M1 1.2 5 5l4-3.8" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        )}

        {message.deletedForEveryone ? (
          <p className="msg-deleted-body">
            <span className="msg-deleted-ico" aria-hidden>
              <svg viewBox="0 0 24 24">
                <path
                  fill="currentColor"
                  d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10S17.5 2 12 2zm0 18c-4.4 0-8-3.6-8-8 0-1.8.6-3.4 1.6-4.7L16.7 18.4C15.4 19.4 13.8 20 12 20zm6.4-3.3L7.3 5.6C8.6 4.6 10.2 4 12 4c4.4 0 8 3.6 8 8 0 1.8-.6 3.4-1.6 4.7z"
                />
              </svg>
            </span>
            <em>
              {message.from === 'atelier'
                ? 'Du hast diese Nachricht gelöscht.'
                : 'Diese Nachricht wurde gelöscht.'}
            </em>
          </p>
        ) : (
          <>
            {message.replyTo && (
              <div className={`msg-quote from-${message.replyTo.from}`}>
                <strong>{message.replyTo.from === 'atelier' ? 'Du' : 'Kontakt'}</strong>
                <span>{message.replyTo.preview}</span>
              </div>
            )}

            {message.forwarded && <ForwardedLabel />}

            {message.kind === 'text' && <p className="caption">{message.text}</p>}

            {message.kind === 'image' && message.image && (
              <div>
                <div className="media-frame">
                  <img src={message.image} alt="" />
                  <button
                    type="button"
                    className="media-zoom-btn"
                    aria-label="Bild maximieren"
                    onClick={() =>
                      onOpenMedia({
                        kind: 'image',
                        src: message.image!,
                        caption: message.text,
                        forwarded: message.forwarded,
                      })
                    }
                  >
                    <MediaZoomIcon />
                  </button>
                </div>
                {message.text && <p className="caption">{message.text}</p>}
                {message.attribution && (
                  <p className="media-attribution">{message.attribution}</p>
                )}
              </div>
            )}

            {message.kind === 'video' && message.video && (
              <VideoMessage
                src={message.video}
                caption={message.text}
                duration={message.duration}
                poster={message.image ?? poster}
                onOpen={() =>
                  onOpenMedia({
                    kind: 'video',
                    src: message.video!,
                    poster: message.image ?? poster,
                    caption: message.text,
                    forwarded: message.forwarded,
                  })
                }
              />
            )}

            {message.kind === 'voice' && message.audio && (
              <VoiceMessage
                audio={message.audio}
                duration={message.duration ?? '0:00'}
                transcript={message.transcript}
              />
            )}

            {message.kind === 'document' && (
              <div className="doc-card">
                <div className="doc-icon">PDF</div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>
                    {message.documentName}
                  </div>
                  {message.text && (
                    <div style={{ fontSize: 12, color: '#667781', marginTop: 2 }}>
                      {message.text}
                    </div>
                  )}
                </div>
                <a
                  href={message.fileUrl ?? `/media/${message.documentName}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  Öffnen
                </a>
              </div>
            )}
          </>
        )}

        <div className="foot">
          {!message.deletedForEveryone && message.starred && (
            <span className="msg-star-mark" aria-label="Mit Stern">
              ★
            </span>
          )}
          {!message.deletedForEveryone && message.pinned && (
            <span className="msg-pin-mark" aria-hidden>
              📌
            </span>
          )}
          <span>{message.at}</span>
          {message.from === 'atelier' && !message.deletedForEveryone && (
            <IconMsgTicks status={message.status ?? 'sent'} />
          )}
        </div>

        {!message.deletedForEveryone && !!message.reactions?.length && (
          <div className="msg-reactions">
            {message.reactions.map((emoji) => (
              <span key={emoji} className="msg-reaction-chip">
                {emoji}
              </span>
            ))}
          </div>
        )}
      </div>

      {menuOpen &&
        !message.deletedForEveryone &&
        menuPos &&
        createPortal(
          <div
            className={`msg-flyout is-${menuPos.placement}`}
            style={
              menuPos.placement === 'up'
                ? { bottom: menuPos.bottom, left: menuPos.reactLeft, top: 'auto' }
                : { top: menuPos.top, left: menuPos.reactLeft }
            }
          >
            <div className="msg-react-bar" role="group" aria-label="Schnellreaktion">
              {QUICK_REACTIONS.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  className={`msg-react-btn${message.reactions?.includes(emoji) ? ' is-on' : ''}`}
                  onClick={() => onReact(emoji)}
                >
                  {emoji}
                </button>
              ))}
            </div>
            <div
              className="msg-ctx-menu"
              role="menu"
              style={{ marginLeft: menuPos.left - menuPos.reactLeft }}
            >
              {(
                [
                  { id: 'reply', label: 'Antworten', icon: 'reply' as const, run: onReply },
                  { id: 'copy', label: 'Kopieren', icon: 'copy' as const, run: onCopy },
                  { id: 'forward', label: 'Weiterleiten', icon: 'forward' as const, run: onForward },
                  {
                    id: 'pin',
                    label: message.pinned ? 'Fixierung aufheben' : 'Fixieren',
                    icon: 'pin' as const,
                    run: onPin,
                  },
                  { id: 'ai', label: 'Meta AI fragen', icon: 'ai' as const, run: onAskAi },
                  {
                    id: 'star',
                    label: message.starred ? 'Stern entfernen' : 'Mit Stern markieren',
                    icon: 'star' as const,
                    run: onStar,
                  },
                ] as const
              ).map((item) => (
                <button
                  key={item.id}
                  type="button"
                  role="menuitem"
                  className="msg-ctx-item"
                  onClick={item.run}
                >
                  <span className="msg-ctx-ico">
                    <MsgMenuIcon name={item.icon} />
                  </span>
                  {item.label}
                </button>
              ))}
              <div className="msg-ctx-divider" />
              <button type="button" role="menuitem" className="msg-ctx-item" onClick={onSelect}>
                <span className="msg-ctx-ico">
                  <MsgMenuIcon name="select" />
                </span>
                Auswählen
              </button>
              <button
                type="button"
                role="menuitem"
                className="msg-ctx-item is-danger"
                onClick={onDelete}
              >
                <span className="msg-ctx-ico">
                  <MsgMenuIcon name="delete" />
                </span>
                Löschen
              </button>
            </div>
          </div>,
          document.body,
        )}
    </div>
  )
}
