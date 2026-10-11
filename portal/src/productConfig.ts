/**
 * Öffentliche Vorschau-Oberfläche.
 * Auf GitLab Pages: VITE_PUBLIC_SURFACE=whatsapp → nur WhatsApp freigeschaltet.
 */
export type PublicSurface = 'full' | 'whatsapp'

export const PUBLIC_SURFACE: PublicSurface =
  import.meta.env?.VITE_PUBLIC_SURFACE === 'whatsapp' ? 'whatsapp' : 'full'

export const IS_WHATSAPP_PREVIEW = PUBLIC_SURFACE === 'whatsapp'

export const PRODUCT_NAME = 'Kundenzettel'
