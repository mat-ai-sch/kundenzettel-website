import { memo } from 'react'
import type { Message } from '../data'
import { MessageBubble } from '../components/chat/MessageBubble'

const NOOP = () => {}

/** Bereich, in dem die Bubble steht; macht die DOM-`id` eindeutig (Hero und Trust zeigen dieselben Nachrichten). */
export type BubbleScope = 'hero' | 'trust' | 'ghost'

/**
 * Die echte Demo-`MessageBubble` ohne Interaktion (Menü, Auswahl, Medien-Lightbox sind stumm).
 * `data-source` steuert Hervorhebung bzw. Abdunkeln über die Landing-CSS.
 *
 * Doppelte `id="msg-…"` (Hero und Trust) werden ohne Änderung an `components/**` vermieden: Die Bubble
 * bekommt eine bereichsbezogene ID (`msg-hero-mk12`); die Fixture-ID bleibt in `data-msg-id`.
 */
export const StaticBubble = memo(function StaticBubble({
  message,
  scope,
  poster,
  source,
}: {
  message: Message
  scope: BubbleScope
  poster?: string
  source?: 'hit' | 'dim'
}) {
  return (
    <div className="lp-msg" data-msg-id={message.id} data-source={source}>
      <MessageBubble
        message={{ ...message, id: `${scope}-${message.id}` }}
        poster={poster}
        menuOpen={false}
        selectMode={false}
        selected={false}
        onToggleMenu={NOOP}
        onCloseMenu={NOOP}
        onReply={NOOP}
        onCopy={NOOP}
        onForward={NOOP}
        onPin={NOOP}
        onAskAi={NOOP}
        onStar={NOOP}
        onSelect={NOOP}
        onDelete={NOOP}
        onReact={NOOP}
        onOpenMedia={NOOP}
      />
    </div>
  )
})
