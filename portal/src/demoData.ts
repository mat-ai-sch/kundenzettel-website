/**
 * Demo-/Prüf-Daten (inkl. fiktiver Marie-Konversation). Nur App und Nicht-Landing-Pfade
 * dürfen dieses Modul importieren – niemals die Landing (dort: landing/story/landingFixture.ts).
 */
import {
  KUNDENZETTEL_INFO_CHAT_ID,
  MARIE_VOICE_NOTE,
  type Conversation,
  type TodoItem,
} from './data'

export const demoMarieConversation: Conversation = {
  id: 'demo-marie',
  kunde: 'Marie Köbbler (Demo)',
  telefon: '+49 170 5544332',
  online: false,
  unread: 0,
  lastPreview: 'Perfekt, bis Mittwoch!',
  lastAt: '14:21',
  status: 'bestaetigt',
  produktBild: '/media/demo/WhatsApp-Referenzvideo_2-poster.jpg',
  structured: {
    produkt: 'Individueller Kranz (Maßanfertigung)',
    sku: 'KZ-DEMO-MK-001',
    groesse: 'Individuell · angelehnt an Referenz-Rohling',
    rohling: 'Rohling aus Referenzvideo',
    stil: 'Frühlingshaft',
    farben: 'Saftiges Grün · Altrosa · Cremeweiß · dunkelrote Knospen (Akzente)',
    variante: 'Maßanfertigung nach Kundenvorgabe',
    abgelehnt: 'Eukalyptus · Blütenkombination laut Florawerk-Referenz (Julia)',
    referenz:
      '2× Referenzvideo (WhatsApp) · Sprachnachricht · Negativbeispiel: Kranz von Julia/Florawerk (Dienstag)',
    blumenauswahl:
      'Atelier entscheidet — Vertrauensreferenz: Anna war begeistert',
    anlass: 'Home Interior / Dekoration',
    termin: 'Mittwoch · Fertigstellung',
    abholung: '10:00–11:00 Uhr',
    lieferung: 'Abholung Atelier',
    adresse: 'Atelier Kundenzettel',
    budget: 'Wunsch bis 65 €',
    preisVereinbart: '75 € (vom Kunden bestätigt)',
    preisBegruendung:
      'Aufwendiger Rohling · dunkelrote Knospen (Saisonpreis, Jahreszeit)',
    medien:
      'WhatsApp-Referenzvideo_1.mp4 · WhatsApp-Referenzvideo_2.mp4 · WhatsApp_Sprachnachricht.mp3',
    kanal: 'WhatsApp',
    notizen:
      'Chatverlauf: Marie sucht Kranz → sendet 2 Referenzvideos → Rohling ja, Blumen nein. Sprachwunsch: frühlingshaft, ohne Eukalyptus, mit saftigem Grün/Altrosa/Cremeweiß/dunkelroten Knospen. Atelier entscheidet Blumen. Termin Mittwoch, Budget 65€ → 75€ vereinbart. Abholung Mi 10–11 Uhr bestätigt.',
    konfidenz: 0,
  },
  messages: [
    {
      id: 'mk1',
      from: 'kunde',
      kind: 'text',
      text: 'Hey Damaris, ich hoffe, ich störe dich nicht!',
      at: '14:02',
      status: 'read',
    },
    {
      id: 'mk2',
      from: 'atelier',
      kind: 'text',
      text: 'Hey Marie, kein Problem. Was kann ich für dich tun?',
      at: '14:03',
      status: 'read',
    },
    {
      id: 'mk3',
      from: 'kunde',
      kind: 'text',
      text: 'Ich suche nach einem schönen Kranz.',
      at: '14:04',
      status: 'read',
    },
    {
      id: 'mk4',
      from: 'kunde',
      kind: 'text',
      text: 'Warte kurz …',
      at: '14:05',
      status: 'read',
    },
    {
      id: 'mk5',
      from: 'kunde',
      kind: 'video',
      video: '/media/demo/WhatsApp-Referenzvideo_1.mp4',
      image: '/media/demo/WhatsApp-Referenzvideo_1-poster.jpg',
      duration: '0:05',
      at: '14:06',
      status: 'read',
    },
    {
      id: 'mk6',
      from: 'kunde',
      kind: 'video',
      video: '/media/demo/WhatsApp-Referenzvideo_2.mp4',
      image: '/media/demo/WhatsApp-Referenzvideo_2-poster.jpg',
      duration: '0:05',
      at: '14:07',
      status: 'read',
    },
    {
      id: 'mk7',
      from: 'kunde',
      kind: 'text',
      text: 'Mir gefällt der Rohling, aber der Kranz an sich irgendwie nicht.',
      at: '14:08',
      status: 'read',
    },
    {
      id: 'mk8',
      from: 'kunde',
      kind: 'voice',
      audio: MARIE_VOICE_NOTE.audio,
      duration: MARIE_VOICE_NOTE.duration,
      transcript: MARIE_VOICE_NOTE.transcript,
      at: '14:09',
      status: 'read',
    },
    {
      id: 'mk9',
      from: 'atelier',
      kind: 'text',
      text: 'Ich denke, das bekomme ich hin. Hast du bestimmte Blumen im Auge oder soll ich für dich entscheiden?',
      at: '14:11',
      status: 'read',
    },
    {
      id: 'mk10',
      from: 'kunde',
      kind: 'text',
      text: 'Anna hatte bei dir bestellt und war total begeistert. Ich denke, du triffst meinen Geschmack schon. Entscheide du gerne!',
      at: '14:12',
      status: 'read',
    },
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
    {
      id: 'mk14b',
      from: 'atelier',
      kind: 'text',
      text: 'Super. Für das Angebot brauche ich noch kurz deine Anschrift.',
      at: '14:18',
      status: 'read',
    },
    {
      id: 'mk14c',
      from: 'kunde',
      kind: 'text',
      text: 'Maximilianstraße 134, 45473 Mülheim an der Ruhr',
      at: '14:19',
      status: 'read',
    },
    {
      id: 'mk15',
      from: 'atelier',
      kind: 'text',
      text: 'Danke! Komm Mittwoch gerne zwischen 10:00 und 11:00 Uhr vorbei.',
      at: '14:19',
      status: 'read',
    },
    {
      id: 'mk16',
      from: 'kunde',
      kind: 'text',
      text: 'Super. Danke dir! Bis Mittwoch!',
      at: '14:20',
      status: 'read',
    },
    {
      id: 'mk17',
      from: 'atelier',
      kind: 'text',
      text: 'Perfekt, bis Mittwoch!',
      at: '14:21',
      status: 'read',
    },
  ],
}

export const kundenzettelInfoConversation: Conversation = {
  id: KUNDENZETTEL_INFO_CHAT_ID,
  systemRole: 'info',
  kunde: 'Kundenzettel',
  telefon: '',
  online: false,
  unread: 0,
  lastPreview: 'Informationen & Funktionen',
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

/**
 * Rein lokaler, fiktiver Prüffall für die Auftragserkennung. Er enthält
 * absichtliche Widersprüche, offene Fragen und nachträgliche Korrekturen.
 * Er wird niemals im geschützten Betreiberbetrieb geladen oder gespeichert.
 */
export const semanticStressConversation: Conversation = {
  id: 'local-semantic-stress',
  kunde: 'Stresstest · fiktiver Chat',
  telefon: '',
  online: false,
  unread: 0,
  lastPreview: '65 € sind in Ordnung. Abholung Donnerstag.',
  lastAt: '10:14',
  status: 'anfrage',
  structured: {
    produkt: '',
    notizen: '',
    konfidenz: 0,
    kanal: 'Lokaler Stresstest',
  },
  messages: [
    { id: 'stress-01', from: 'kunde', kind: 'text', text: 'Hallo, ich dachte zuerst an einen Kranz in Rosa, etwa 45 cm, bis Freitag. Mein Budget liegt bei 60 €.', at: '10:01', status: 'read' },
    { id: 'stress-02', from: 'atelier', kind: 'text', text: 'Ein Kranz bis Freitag läge wegen der Materialien bei 75 €. Alternativ wären ein Gesteck oder ein Blumenhoop möglich.', at: '10:02', status: 'read' },
    { id: 'stress-03', from: 'kunde', kind: 'text', text: '75 € sind mir zu teuer. Ich weiß auch noch nicht: Kranz oder Strauß?', at: '10:03', status: 'read' },
    { id: 'stress-04', from: 'atelier', kind: 'text', text: 'Meinst du für die Abholung Donnerstag oder Freitag?', at: '10:04', status: 'read' },
    { id: 'stress-05', from: 'kunde', kind: 'text', text: 'Freitag passt doch nicht. Ich habe mich entschieden: lieber ein kleines Tischgesteck, creme statt Rosa, etwa 35 cm. Donnerstag wäre gut.', at: '10:05', status: 'read' },
    { id: 'stress-06', from: 'kunde', kind: 'text', text: 'Lieferung wäre umständlich, ich hole es lieber selbst ab.', at: '10:06', status: 'read' },
    { id: 'stress-07', from: 'atelier', kind: 'text', text: 'Für das Tischgesteck mit den gewünschten Blumen kann ich 55 € anbieten.', at: '10:07', status: 'read' },
    { id: 'stress-08', from: 'kunde', kind: 'text', text: '55 € passt, machen wir so.', at: '10:08', status: 'read' },
    { id: 'stress-09', from: 'atelier', kind: 'text', text: 'Wegen der roten Rosen müsste ich den Preis auf 65 € anpassen.', at: '10:09', status: 'read' },
    { id: 'stress-10', from: 'kunde', kind: 'text', text: 'Kein Problem, 65 € sind in Ordnung. Aber bitte keine Pampas.', at: '10:10', status: 'read' },
    { id: 'stress-11', from: 'kunde', kind: 'voice', transcript: 'Bitte cremefarben und luftig, mit ein paar dunkelroten Akzenten. Den Kranz vom letzten Jahr mochte ich zwar, aber diesmal wirklich das Tischgesteck.', text: 'Sprachnachricht', at: '10:11', status: 'read' },
    { id: 'stress-12', from: 'atelier', kind: 'text', text: 'Alles klar: Tischgesteck, 35 cm, Donnerstag zur Abholung.', at: '10:12', status: 'read' },
    { id: 'stress-13', from: 'kunde', kind: 'text', text: 'Genau. Abholung Donnerstag, bitte fest einplanen.', at: '10:13', status: 'read' },
    { id: 'stress-14', from: 'kunde', kind: 'text', text: '65 € sind in Ordnung. Abholung Donnerstag.', at: '10:14', status: 'read' },
  ],
}

export const initialConversations: Conversation[] = [
  kundenzettelInfoConversation,
  demoMarieConversation,
]

export const initialTodos: TodoItem[] = [
  {
    id: 't0',
    title: 'Marie Köbbler (Demo) – Kranz fertigstellen · Abholung Mittwoch 10:00',
    relatedTo: 'Marie Köbbler (Demo)',
    due: 'Mi · 09:30',
    done: false,
    kind: 'todo',
  },
]
