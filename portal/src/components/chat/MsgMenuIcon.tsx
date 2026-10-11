export function MsgMenuIcon({
  name,
}: {
  name:
    | 'reply'
    | 'copy'
    | 'forward'
    | 'pin'
    | 'ai'
    | 'star'
    | 'select'
    | 'delete'
}) {
  const props = { viewBox: '0 0 24 24', width: 18, height: 18, fill: 'currentColor' as const }
  switch (name) {
    case 'reply':
      return (
        <svg {...props} aria-hidden>
          <path d="M10 9V5l-7 7 7 7v-4.1c5 0 8.5 1.6 11 5.1-1-5-4-10-11-11z" />
        </svg>
      )
    case 'copy':
      return (
        <svg {...props} aria-hidden>
          <path d="M16 1H4a2 2 0 0 0-2 2v12h2V3h12V1zm3 4H8a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2zm0 16H8V7h11v14z" />
        </svg>
      )
    case 'forward':
      return (
        <svg {...props} aria-hidden>
          <path d="M14 9V5l7 7-7 7v-4.1c-5 0-8.5 1.6-11 5.1 1-5 4-10 11-11z" />
        </svg>
      )
    case 'pin':
      return (
        <svg {...props} aria-hidden>
          <path d="M16 12V4h1V2H7v2h1v8l-2 2v2h5.2v6h1.6v-6H18v-2l-2-2z" />
        </svg>
      )
    case 'ai':
      return (
        <svg {...props} aria-hidden>
          <circle cx="12" cy="5.5" r="1.4" />
          <circle cx="16.5" cy="7.8" r="1.4" />
          <circle cx="18.2" cy="12" r="1.4" />
          <circle cx="16.5" cy="16.2" r="1.4" />
          <circle cx="12" cy="18.5" r="1.4" />
          <circle cx="7.5" cy="16.2" r="1.4" />
          <circle cx="5.8" cy="12" r="1.4" />
          <circle cx="7.5" cy="7.8" r="1.4" />
        </svg>
      )
    case 'star':
      return (
        <svg {...props} aria-hidden>
          <path d="M12 17.3 18.2 21l-1.6-7.1L22 9.2l-7.2-.6L12 2 9.2 8.6 2 9.2l5.4 4.7L5.8 21 12 17.3z" />
        </svg>
      )
    case 'select':
      return (
        <svg {...props} aria-hidden>
          <path d="M19 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2zm-9 14-5-5 1.4-1.4L10 14.2l6.6-6.6L18 9l-8 8z" />
        </svg>
      )
    case 'delete':
      return (
        <svg {...props} aria-hidden>
          <path d="M6 19a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z" />
        </svg>
      )
  }
}
