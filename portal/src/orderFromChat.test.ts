import { MARIE_VOICE_NOTE, type Conversation, type Message } from './data'
import { demoMarieConversation } from './demoData'
import {
  applyOrderSemantics,
  deriveOrderFromChat,
  emptyStructuredOrder,
} from './orderFromChat'

function assert(condition: unknown, message: string) {
  if (!condition) {
    console.error(`FAIL  ${message}`)
    process.exitCode = 1
    return
  }
  console.log(`ok    ${message}`)
}

function contains(haystack: string | undefined, needle: string) {
  return fold(haystack ?? '').includes(fold(needle))
}

function fold(value: string) {
  return value
    .toLowerCase()
    .replace(/ß/g, 'ss')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
}

function msg(
  id: string,
  from: Message['from'],
  text: string,
  extras: Partial<Message> = {},
): Message {
  return {
    id,
    from,
    kind: 'text',
    text,
    at: '10:00',
    status: 'read',
    ...extras,
  }
}

function chat(messages: Message[], extra: Partial<Conversation> = {}): Conversation {
  return {
    id: 'test',
    kunde: 'Anna Hartmann (Test)',
    telefon: '+49 151 56732238',
    online: false,
    unread: 0,
    lastPreview: '',
    lastAt: '10:00',
    status: 'anfrage',
    structured: emptyStructuredOrder({
      adresse: 'Finkenstraße 56, 41749 Viersen',
    }),
    messages,
    ...extra,
  }
}

const marie = deriveOrderFromChat(demoMarieConversation)
assert(
  contains(marie.structured.produkt, 'Kranz'),
  'Marie: Produkt enthält Kranz',
)
assert(
  contains(marie.structured.rohling, 'Rohling aus Referenzvideo') &&
    !contains(marie.structured.rohling, 'gefällt'),
  'Marie: Referenzrohling wird sachlich dargestellt',
)
assert(contains(marie.structured.stil, 'Frühlingshaft'), 'Marie: Stil frühlingshaft')
assert(contains(marie.structured.farben, 'Saftiges Grün'), 'Marie: Saftiges Grün')
assert(contains(marie.structured.farben, 'Altrosa'), 'Marie: Altrosa')
assert(contains(marie.structured.farben, 'Cremeweiß'), 'Marie: Cremeweiß')
assert(
  contains(marie.structured.farben, 'Knospen'),
  'Marie: dunkelrote Knospen',
)
assert(
  !contains(marie.structured.farben, ' · Grün ·') &&
    !/^Grün/.test(marie.structured.farben ?? ''),
  'Marie: kein generisches Grün neben Saftiges Grün',
)
assert(contains(marie.structured.abgelehnt, 'Eukalyptus'), 'Marie: Eukalyptus abgelehnt')
assert(
  contains(MARIE_VOICE_NOTE.transcript, 'Eukalyptus') &&
    contains(MARIE_VOICE_NOTE.transcript, 'Katastrophe') &&
    contains(MARIE_VOICE_NOTE.transcript, 'Florawerk') &&
    contains(MARIE_VOICE_NOTE.transcript, 'Julia'),
  'Marie: Sprachnachricht hat wortgetreues Transkript',
)
assert(contains(marie.structured.termin, 'Mittwoch'), 'Marie: Termin Mittwoch')
assert(contains(marie.structured.abholung, '10'), 'Marie: Abholung 10 Uhr')
assert(contains(marie.structured.lieferung, 'Abholung'), 'Marie: Abholung Atelier')
assert(contains(marie.structured.adresse, 'Maximilian'), 'Marie: Adresse aus Chat')
assert(contains(marie.structured.budget, '65'), 'Marie: Budget 65')
assert(contains(marie.structured.preisVereinbart, '75'), 'Marie: Preis 75')
assert(
  contains(marie.structured.blumenauswahl, 'Atelier'),
  'Marie: Atelier entscheidet',
)
assert(marie.structured.konfidenz >= 0.8, 'Marie: hohe Konfidenz')
assert(
  marie.status === 'bestaetigt' || marie.status === 'arbeit',
  `Marie: Status bestätigt oder Arbeit (ist ${marie.status})`,
)

let live = chat([])
assert(!deriveOrderFromChat(live).structured.produkt, 'Neuer Chat: leer ohne Nachrichten')

live = chat([msg('1', 'kunde', 'Ich suche einen Kranz bis Freitag, Budget 40€')])
let derived = deriveOrderFromChat(live)
assert(contains(derived.structured.produkt, 'Kranz'), 'Erste Eingabe: Kranz')
assert(contains(derived.structured.termin, 'Freitag'), 'Erste Eingabe: Freitag')
assert(contains(derived.structured.budget, '40'), 'Erste Eingabe: Budget 40')
assert(derived.status === 'angebot' || derived.status === 'anfrage', 'Erste Eingabe: offen/Angebot')

live = {
  ...live,
  structured: derived.structured,
  status: derived.status,
  messages: [
    ...live.messages,
    msg('2', 'atelier', 'Gerne. Ein Kranz in der Größe kostet 55€, Abholung Samstag zwischen 9 und 10 Uhr.'),
  ],
}
derived = deriveOrderFromChat(live)
assert(!derived.structured.preisVereinbart, 'Atelier-Angebot ist noch kein vereinbarter Preis')
assert(contains(derived.structured.abholung, '9'), 'Atelier setzt Abholzeit')
assert(
  contains(derived.structured.termin, 'Samstag') ||
    contains(derived.structured.termin, 'Freitag'),
  'Termin bleibt aus dem Chat lesbar',
)

live = {
  ...live,
  structured: derived.structured,
  status: derived.status,
  messages: [
    ...live.messages,
    msg('3', 'kunde', 'Nicht Freitag, sondern Donnerstag. Lieber weiß statt rosa. Das ist es mir wert.'),
  ],
}
derived = deriveOrderFromChat(live)
assert(contains(derived.structured.termin, 'Donnerstag'), 'Korrektur: Donnerstag statt Freitag')
assert(!contains(derived.structured.termin, 'Freitag'), 'Korrektur entfernt Freitag')
assert(contains(derived.structured.farben, 'Weiß'), 'Korrektur: Weiß')
assert(!contains(derived.structured.farben, 'Rosa'), 'Korrektur entfernt Rosa')
assert(contains(derived.structured.preisVereinbart, '55'), 'Kunde bestätigt 55€')
assert(derived.status === 'bestaetigt', 'Nach Zusage Status bestätigt')

live = chat([
  msg(
    'rohling-1',
    'kunde',
    'Mir gefällt der Rohling. Bitte frühlingshaft mit saftigem Grün.',
  ),
])
derived = deriveOrderFromChat(live)
assert(
  contains(derived.structured.rohling, 'beibehalten') &&
    !contains(derived.structured.rohling, 'gefällt'),
  'Neuer Chat: positive Rohling-Präferenz wird sachlich dargestellt',
)
assert(contains(derived.structured.stil, 'Frühlingshaft'), 'Neuer Chat: Stil aus erster Nachricht')
assert(contains(derived.structured.farben, 'Saftiges Grün'), 'Neuer Chat: Farbe aus erster Nachricht')

live = chat([
  msg('a', 'kunde', 'Ich hätte gerne einen Strauß, maximal 30€'),
  msg('b', 'kunde', 'Doch lieber ein Gesteck bis Mittwoch'),
])
derived = deriveOrderFromChat(live)
assert(contains(derived.structured.produkt, 'Gesteck'), 'Späteres Produkt gewinnt')
assert(contains(derived.structured.termin, 'Mittwoch'), 'Späterer Termin gewinnt')
assert(contains(derived.structured.budget, '30'), 'Budget bleibt aus früherer Angabe')

const anna = deriveOrderFromChat(
  chat(
    [
      msg('a1', 'kunde', 'hey, ich bräucht so einen blickfang'),
      msg('a2', 'kunde', 'goldring, weniger pampas', {
        kind: 'video',
        video: '/media/demo/anna-blickfang-hand.mp4',
        image: '/media/demo/anna-blickfang-hand.jpg',
        duration: '0:05',
      }),
      msg('a3', 'kunde', 'nochmal von oben, dasselbe stück', {
        kind: 'video',
        video: '/media/demo/anna-blickfang-table.mp4',
        image: '/media/demo/anna-blickfang-table.jpg',
        duration: '0:05',
      }),
      msg('a4', 'kunde', 'samstag nachmittag abholen, so zwischen 15 und 16 uhr'),
      msg('a5', 'kunde', 'budget so um die 45€, lieber abholung'),
    ],
    { id: 'demo-anna' },
  ),
)
assert(contains(anna.structured.produkt, 'Blickfang'), 'Anna: Produkt Blickfang')
assert(contains(anna.structured.termin, 'Samstag'), 'Anna: Termin Samstag')
assert(contains(anna.structured.abholung, '15'), 'Anna: Abholung 15 Uhr')
assert(contains(anna.structured.lieferung, 'Abholung'), 'Anna: Abholung statt Lieferung')
assert(contains(anna.structured.budget, '45'), 'Anna: Budget 45')
assert(contains(anna.structured.abgelehnt, 'Pampas'), 'Anna: zu viel Pampas abgelehnt')
assert(contains(anna.structured.medien, 'Video'), 'Anna: Videos im Chat')
assert(!contains(anna.structured.medien, 'Sideboard'), 'Anna: keine Maß-PDF')
assert(anna.status === 'angebot' || anna.status === 'anfrage', `Anna: offen/Angebot (ist ${anna.status})`)

{
  const door = deriveOrderFromChat(
    chat([
      msg('d1', 'kunde', 'Hallo, hättest du Luft für einen Türkranz eher luftig'),
      msg('d2', 'atelier', 'Klar. Eher Trockenblumen oder frisch?'),
      msg('d3', 'kunde', 'Trockenblumen. so um 40 Euro'),
    ]),
  )
  assert(contains(door.structured.produkt, 'Türkranz'), 'Off-Kollektion: Türkranz erkannt (Kunde+Atelier)')
  assert(contains(door.structured.budget, '40'), 'Türkranz: Budget')
}

{
  const hoop = deriveOrderFromChat(
    chat([msg('h1', 'atelier', 'Meinst du einen Blumenhoop oder einen Wandkranz?')]),
  )
  assert(
    !hoop.structured.produkt,
    'Atelier-Frage: Option wird nicht fälschlich als Auftrag übernommen',
  )
}

{
  const initial = chat([
    msg('old-1', 'kunde', 'Für den alten Auftrag brauche ich einen Kranz in Rosa.'),
    msg('old-2', 'atelier', 'Der Preis dafür liegt bei 65€.'),
    msg('new-1', 'kunde', 'Hallo, diesmal suche ich einen kleinen Strauß in Creme bis Freitag.'),
  ])
  const newDraft = deriveOrderFromChat({
    ...initial,
    structured: emptyStructuredOrder(),
    messages: initial.messages.slice(2),
  })
  assert(contains(newDraft.structured.produkt, 'Strauß'), 'Neuer Abschnitt: aktuelles Produkt bleibt Strauß')
  assert(!contains(newDraft.structured.farben, 'Rosa'), 'Neuer Abschnitt: alte Farbwelt wird nicht übernommen')
  assert(contains(newDraft.structured.farben, 'Creme'), 'Neuer Abschnitt: neue Farbwelt wird erkannt')
  assert(!newDraft.structured.preisVereinbart, 'Neuer Abschnitt: alter Preis wird nicht übernommen')
}

const applied = applyOrderSemantics({
  ...demoMarieConversation,
  structured: emptyStructuredOrder({ kanal: 'WhatsApp' }),
  status: 'anfrage',
})
assert(applied.changedKeys.includes('produkt'), 'applyOrderSemantics markiert Produkt als geändert')
assert(contains(applied.conversation.structured.produkt, 'Kranz'), 'apply füllt bestehenden Chat')

{
  // Kranz abgelehnt → Strauß angenommen: Auftrag spiegelt Pivot + Ablehnung
  const pivot = deriveOrderFromChat(
    chat([
      msg('p1', 'kunde', 'So ungefähr stelle ich mir den Kranz vor.'),
      msg(
        'p2',
        'atelier',
        'Nein das ist nicht möglich. Ich habe alternativ noch Frischware. Soll ich dir einen Strauß fertigen?',
      ),
      msg(
        'p3',
        'kunde',
        'Alles klar. Den Kranz merke ich mir bis später. Jetzt nehme ich gern einen Strauß.',
      ),
    ]),
  )
  assert(contains(pivot.structured.produkt, 'Strauß'), 'Pivot-Auftrag: aktuelles Produkt Strauß')
  assert(contains(pivot.structured.ursprungswunsch, 'Kranz'), 'Pivot-Auftrag: Ursprungswunsch Kranz')
  assert(contains(pivot.structured.abgelehnt, 'Kranz'), 'Pivot-Auftrag: Ablehnung Kranz')
  assert(contains(pivot.structured.abgelehnt, 'nicht möglich') || contains(pivot.structured.abgelehnt, 'Frischware'), 'Pivot-Auftrag: Ablehnungsgrund')
  assert(!contains(pivot.structured.produkt, 'Blumenhoop'), 'Pivot-Auftrag: kein Blumenhoop als aktuell')
}

{
  // Nach Blumenhoop-Einstieg zählt der zuletzt abgelehnte Kranz als Ursprung
  const pivot = deriveOrderFromChat(
    chat([
      msg('h1', 'kunde', 'Hättest du noch einmal Zeit für so einen Blumenhoop wie bei meiner Freundin?'),
      msg('h2', 'atelier', 'Leider habe ich derzeit nur Dekoartikel im Lager.'),
      msg('h3', 'kunde', 'So ungefähr stelle ich mir den Kranz vor.'),
      msg(
        'h4',
        'atelier',
        'Nein das ist nicht möglich. Ich habe alternativ noch Frischware. Soll ich dir einen Strauß fertigen?',
      ),
      msg(
        'h5',
        'kunde',
        'Alles klar. Den Kranz merke ich mir bis später. Jetzt nehme ich gern einen Strauß.',
      ),
    ]),
  )
  assert(contains(pivot.structured.produkt, 'Strauß'), 'Pivot-nach-Hoop: Produkt Strauß')
  assert(contains(pivot.structured.ursprungswunsch, 'Kranz'), 'Pivot-nach-Hoop: Ursprung Kranz')
  assert(contains(pivot.structured.abgelehnt, 'Kranz'), 'Pivot-nach-Hoop: Ablehnung Kranz')
  assert(!contains(pivot.structured.produkt, 'Blumenhoop'), 'Pivot-nach-Hoop: kein Blumenhoop aktuell')
}

{
  // Anlass über gesamten Dialog: Geschenk bleibt, auch nach Farbfrage
  const order = deriveOrderFromChat(
    chat([
      msg('a1', 'kunde', 'Könntest du noch einmal so einen Blumenhoop machen?'),
      msg('a2', 'atelier', 'Derzeit habe ich nur Frischware im Lager'),
      msg(
        'a3',
        'kunde',
        'Verstehe. Wenn gerade keine Trockenblumen gehen, nehme ich gern einen Strauß. Wegen dem Blumenhoop komme ich ein anderes Mal auf dich zu.',
      ),
      msg('a4', 'atelier', 'zu welchem Anlass soll der Strauß sein?'),
      msg('a5', 'kunde', 'Als Mitbringsel zum Verschenken, nichts Großes.'),
      msg('a6', 'atelier', 'Welche Farben darf er haben?'),
      msg('a7', 'kunde', 'Eher ruhig in Creme und etwas Rosa.'),
    ]),
  )
  assert(contains(order.structured.produkt, 'Strauß'), 'Anlass-Auftrag: Produkt Strauß')
  assert(
    contains(order.structured.anlass, 'Geschenk') ||
      contains(order.structured.anlass, 'Mitbring'),
    'Anlass-Auftrag: Anlass Geschenk/Mitbringen',
  )
  assert(
    !contains(order.structured.anlass, 'Home Interior') ||
      contains(order.structured.anlass, 'Geschenk') ||
      contains(order.structured.anlass, 'Mitbring'),
    'Anlass-Auftrag: Geschenk schlägt Default-Dekoration',
  )
}

{
  const variant = deriveOrderFromChat(
    chat([
      msg('v1', 'kunde', 'Ich hätte gern einen Tischkranz.'),
      msg('v2', 'atelier', 'Creme, Rosa oder eher kräftiger?'),
      msg('v3', 'kunde', 'Am liebsten Creme und etwas Rosa.'),
    ]),
  )
  assert(
    contains(variant.structured.variante, 'Creme') ||
      contains(variant.structured.farben, 'Creme'),
    'Variante-Auftrag: Creme in variante oder farben',
  )
  assert(
    contains(variant.structured.variante, 'Creme/Rosa') ||
      contains(variant.structured.variante, 'Creme'),
    'Variante-Auftrag: variante gesetzt',
  )
}

{
  const size = deriveOrderFromChat(
    chat([
      msg('s1', 'kunde', 'Ich hätte gern einen Strauß.'),
      msg('s2', 'atelier', 'Welche Größe darf der Strauß haben?'),
      msg('s3', 'kunde', 'Nicht zu groß, eher handlich zum Mitbringen.'),
    ]),
  )
  assert(contains(size.structured.produkt, 'Strauß'), 'Größe-Auftrag: Produkt Strauß')
  assert(
    contains(size.structured.groesse, 'handlich') ||
      !contains(size.structured.groesse, 'Groß'),
    'Größe-Auftrag: nicht fälschlich Groß',
  )
  assert(!contains(size.structured.groesse, '35'), 'Größe-Auftrag: kein Hoop-Maß')
}

const stable = applyOrderSemantics(applied.conversation)
assert(stable.conversation === applied.conversation, 'zweites apply ist no-op (Referenzgleichheit)')

if (process.exitCode) {
  console.error('\norderFromChat tests failed')
  process.exit(1)
}
console.log('\norderFromChat tests passed')
