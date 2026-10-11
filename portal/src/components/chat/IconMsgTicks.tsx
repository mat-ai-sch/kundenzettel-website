import type { Message } from '../../data'

export function IconMsgTicks({
  status = 'sent',
}: {
  status?: Message['status']
}) {
  const isRead = status === 'read'
  const isDouble = status === 'delivered' || status === 'read'
  const label =
    status === 'failed'
      ? 'Senden fehlgeschlagen'
      : status === 'queued'
        ? 'Wird gesendet'
        : isRead
          ? 'Gelesen'
          : status === 'delivered'
            ? 'Zugestellt'
            : 'Gesendet'
  return (
    <span className={`msg-ticks${isRead ? ' is-read' : ''}${status === 'failed' ? ' is-failed' : ''}`} aria-label={label}>
      {isDouble ? (
        <svg viewBox="0 0 16 11" width="16" height="11" aria-hidden>
          <path
            fill="currentColor"
            d="M15.01 3.316l-.478-.372a.365.365 0 0 0-.51.063L8.666 9.879a.32.32 0 0 1-.484.033l-.358-.325a.319.319 0 0 0-.484.032l-.378.483a.418.418 0 0 0 .036.541l1.32 1.266a.32.32 0 0 0 .484-.034l6.272-8.048a.366.366 0 0 0-.063-.512zm-4.1 0l-.478-.372a.365.365 0 0 0-.51.063L4.566 9.879a.32.32 0 0 1-.484.033L1.891 7.769a.366.366 0 0 0-.515.006l-.423.433a.364.364 0 0 0 .006.514l3.258 3.185c.143.14.361.125.484-.033l6.272-8.048a.365.365 0 0 0-.063-.51z"
          />
        </svg>
      ) : (
        <svg viewBox="0 0 12 11" width="12" height="11" aria-hidden>
          <path
            fill="currentColor"
            d="M11.155.4a.5.5 0 0 0-.688.06L4.71 7.025 1.98 4.4a.5.5 0 1 0-.68.732l3.11 2.9a.5.5 0 0 0 .72-.03L11.22 1.08A.5.5 0 0 0 11.155.4z"
          />
        </svg>
      )}
    </span>
  )
}
