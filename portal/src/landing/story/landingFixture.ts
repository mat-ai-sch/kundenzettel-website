import type { Conversation, Message } from '../../data'

/**
 * Eigenes Landing-Fixture (06b C-08, PT-P1): nur die Nachrichten `mk11` bis `mk14` und der Chat-Kopf.
 * Bewusst KEIN Import der Demo-Konversation aus `data.ts`, damit weder Telefonnummer noch Anschrift (`mk14c`)
 * aus der Demo in den öffentlichen Landing-Code gelangen. Wortlaut, Zeiten und Häkchen sind wörtlich
 * die der Demo; ein Test (`landingPresentation.test.tsx`) vergleicht sie gegen `data.ts`.
 */

export const LANDING_MESSAGE_IDS = ['mk11', 'mk12', 'mk13', 'mk14'] as const
export type LandingMessageId = (typeof LANDING_MESSAGE_IDS)[number]

/**
 * Produktkopf, konstant ab Beginn (02 §8, 06b C-02). Aus `[mk11..]` allein käme `Kranz`; der Wert
 * stammt aus dem ausgeblendeten Vorlauf der Demo (mk3 bis mk10).
 */
export const LANDING_PRODUCT_NAME = 'Individueller Kranz (Maßanfertigung)'

/** Chat-Kopf wie in der Demo; „(Demo)“ muss sichtbar bleiben (02 §2). */
export const LANDING_CUSTOMER_NAME = 'Marie Köbbler (Demo)'

export const LANDING_MESSAGES: readonly Message[] = [
  {
    id: 'mk11',
    from: 'atelier',
    kind: 'text',
    text: 'Alles klar, kein Problem. Sag mir doch bitte, wie viel der Kranz kosten darf und bis wann du ihn brauchst.',
    at: '14:14',
    status: 'read',
  },
  {
    id: 'mk12',
    from: 'kunde',
    kind: 'text',
    text: 'Ich brauche den Kranz bis Mittwoch und habe mir einen Preis bis 65€ vorgestellt.',
    at: '14:15',
    status: 'read',
  },
  {
    id: 'mk13',
    from: 'atelier',
    kind: 'text',
    text: 'Bis Mittwoch schaffe ich ihn. Den Preis müssten wir jedoch auf 75€ anpassen. Der Rohling ist aufwendiger zu fertigen, und rote Knospen kosten um diese Jahreszeit leider mehr.',
    at: '14:17',
    status: 'read',
  },
  {
    id: 'mk14',
    from: 'kunde',
    kind: 'text',
    text: 'Das ist es mir wert. Ganz lieben Dank schon mal.',
    at: '14:18',
    status: 'read',
  },
]

/** Nachricht des Fixtures; wirft bei unbekannter ID (Programmierfehler, nie Nutzereingabe). */
export function landingMessage(id: string): Message {
  const found = LANDING_MESSAGES.find((message) => message.id === id)
  if (!found) throw new Error(`Unbekannte Landing-Nachricht: ${id}`)
  return found
}

/**
 * Konversation für die Anzeige. `telefon` bleibt leer, `structured` ist der leere Ausgangsstand
 * (die Bühne zeigt ausschließlich abgeleitete Werte, siehe `orderDerivation.ts`).
 */
export const landingConversation: Conversation = {
  id: 'landing-marie',
  kunde: LANDING_CUSTOMER_NAME,
  telefon: '',
  online: false,
  unread: 0,
  lastPreview: '',
  lastAt: '',
  status: 'anfrage',
  produktBild: '/media/demo/WhatsApp-Referenzvideo_2-poster.jpg',
  structured: { produkt: '', notizen: '', konfidenz: 0 },
  messages: [...LANDING_MESSAGES],
}
