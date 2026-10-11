import type { Message } from '../../data'

export const QUICK_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🙏'] as const

export function messagePreview(m: Message): string {
  if (m.deletedForEveryone) {
    return m.from === 'atelier'
      ? 'Du hast diese Nachricht gelöscht.'
      : 'Diese Nachricht wurde gelöscht.'
  }
  if (m.kind === 'text') return m.text ?? ''
  if (m.kind === 'voice') return 'Sprachnachricht'
  if (m.kind === 'image') return 'Bild'
  if (m.kind === 'video') return 'Video'
  if (m.kind === 'document') return m.documentName ?? 'Dokument'
  return 'Nachricht'
}
