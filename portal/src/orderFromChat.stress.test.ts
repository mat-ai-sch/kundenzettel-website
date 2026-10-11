import { type Conversation, type Message, type StructuredOrder } from './data'
import { semanticStressConversation } from './demoData'
import { deriveOrderFromChat, emptyStructuredOrder } from './orderFromChat'

type Assertion = {
  field: keyof StructuredOrder
  description: string
  includes?: string
  absent?: string
}

type Scenario = {
  title: string
  messages: Array<[Message['from'], string, Partial<Message>?]>
  expectations: Assertion[]
}

function fold(value: string) {
  return value
    .toLowerCase()
    .replace(/ß/g, 'ss')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
}

function conversation(messages: Message[]): Conversation {
  return {
    id: 'stress',
    kunde: 'Stresstest',
    telefon: '',
    online: false,
    unread: 0,
    lastPreview: '',
    lastAt: '10:00',
    status: 'anfrage',
    structured: emptyStructuredOrder(),
    messages,
  }
}

function message(
  id: number,
  from: Message['from'],
  text: string,
  extras: Partial<Message> = {},
): Message {
  return {
    id: `stress-${id}`,
    from,
    kind: 'text',
    text,
    at: `10:${String(id).padStart(2, '0')}`,
    status: 'read',
    ...extras,
  }
}

const scenarios: Scenario[] = [
  {
    title: 'Preis wird ausdrücklich abgelehnt',
    messages: [
      ['kunde', 'Ich brauche einen Türkranz bis Freitag, maximal 60 €.'],
      ['atelier', 'Der Türkranz kostet wegen der Materialien 75 €.'],
      ['kunde', 'Okay, aber 75 € sind mir zu teuer. Maximal 60 € bleiben meine Grenze.'],
    ],
    expectations: [
      { field: 'produkt', description: 'Türkranz bleibt Produkt', includes: 'Türkranz' },
      { field: 'budget', description: 'Budget bleibt 60 €', includes: '60' },
      { field: 'preisVereinbart', description: 'abgelehnter Preis wird nicht vereinbart', absent: '75' },
    ],
  },
  {
    title: 'Unentschiedene Auswahlfrage des Ateliers',
    messages: [
      ['atelier', 'Meinst du einen Blumenhoop oder einen Wandkranz?'],
      ['kunde', 'Ich schaue noch und melde mich später.'],
    ],
    expectations: [
      { field: 'produkt', description: 'Optionen werden nicht zum Auftrag', absent: 'Blumenhoop' },
      { field: 'produkt', description: 'zweite Option wird nicht zum Auftrag', absent: 'Wandkranz' },
    ],
  },
  {
    title: 'Korrektur von Farbe, Termin und Größe',
    messages: [
      ['kunde', 'Ein Kranz in Rosa, etwa 45 cm, bitte bis Freitag.'],
      ['kunde', 'Doch lieber Creme statt Rosa und nicht Freitag, sondern Donnerstag. Eher 35 cm.'],
    ],
    expectations: [
      { field: 'farben', description: 'neue Farbe Creme', includes: 'Creme' },
      { field: 'farben', description: 'alte Farbe Rosa entfernt', absent: 'Rosa' },
      { field: 'termin', description: 'Termin korrigiert', includes: 'Donnerstag' },
      { field: 'termin', description: 'alter Termin entfernt', absent: 'Freitag' },
      { field: 'groesse', description: 'neue Größe übernimmt', includes: '35' },
    ],
  },
  {
    title: 'Lieferung wird verworfen, Abholung gewählt',
    messages: [
      ['kunde', 'Lieferung wäre zu umständlich, ich hole den Strauß lieber selbst ab.'],
    ],
    expectations: [
      { field: 'produkt', description: 'Strauß erkannt', includes: 'Strauß' },
      { field: 'lieferung', description: 'Abholung statt Lieferung', includes: 'Abholung' },
    ],
  },
  {
    title: 'Altes Werk wird erwähnt, neuer Wunsch folgt',
    messages: [
      ['kunde', 'Der Kranz vom letzten Jahr war toll. Jetzt hätte ich gern eine Girlande für meinen Geburtstag.'],
    ],
    expectations: [
      { field: 'produkt', description: 'neuer Wunsch Girlande', includes: 'Girlande' },
      { field: 'produkt', description: 'alter Kranz bleibt Referenz', absent: 'Kranz' },
      { field: 'anlass', description: 'Geburtstag erkannt', includes: 'Geburtstag' },
    ],
  },
  {
    title: 'Mehrdeutige Produktfrage ohne Entscheidung',
    messages: [
      ['kunde', 'Ich weiß noch nicht: Kranz oder Strauß? Was wäre für ein kleines Mitbringsel besser?'],
    ],
    expectations: [
      { field: 'produkt', description: 'Mehrfachauswahl bleibt offen', absent: 'Strauß' },
      { field: 'anlass', description: 'Anlass bleibt trotz offener Wahl erhalten', includes: 'Mitbringen' },
    ],
  },
  {
    title: 'Angebot wird erst nach klarer Zusage verbindlich',
    messages: [
      ['kunde', 'Ich suche ein Tischgesteck für Samstag.'],
      ['atelier', 'Das Gesteck kann ich für 45 € machen.'],
      ['kunde', '45 € passen, machen wir so.'],
    ],
    expectations: [
      { field: 'produkt', description: 'Tischgesteck erkannt', includes: 'Tischgesteck' },
      { field: 'preisVereinbart', description: 'klar angenommener Preis', includes: '45' },
      { field: 'termin', description: 'Samstag erkannt', includes: 'Samstag' },
    ],
  },
  {
    title: 'Sprachnachricht mit Referenz und Ablehnung',
    messages: [
      ['kunde', 'Das Video zeigt die Richtung.', { kind: 'voice', transcript: 'Ich möchte einen Blumenhoop, aber ohne Pampas und nicht zu groß. Eher luftig.' }],
    ],
    expectations: [
      { field: 'produkt', description: 'Produkt aus Transkript', includes: 'Blumenhoop' },
      { field: 'abgelehnt', description: 'Pampas abgelehnt', includes: 'Pampas' },
      { field: 'stil', description: 'Stil aus Transkript', includes: 'Luftig' },
      { field: 'medien', description: 'Sprachnachricht dokumentiert', includes: 'Sprachnachricht' },
    ],
  },
  {
    title: 'Preis wird später neu verhandelt',
    messages: [
      ['kunde', 'Einen Strauß für Sonntag, mein Budget sind 50 €.'],
      ['atelier', 'Ich kann ihn für 55 € machen.'],
      ['kunde', '55 € passt.'],
      ['atelier', 'Wegen der roten Rosen wären es doch 65 €.'],
      ['kunde', '65 € sind in Ordnung.'],
    ],
    expectations: [
      { field: 'preisVereinbart', description: 'letzte bestätigte Preisrunde', includes: '65' },
      { field: 'preisVereinbart', description: 'alter Preis ersetzt', absent: '55' },
      { field: 'budget', description: 'ursprüngliches Budget erhalten', includes: '50' },
    ],
  },
  {
    title: 'Produktwechsel nach Rückfrage',
    messages: [
      ['kunde', 'Zunächst dachte ich an einen Kranz.'],
      ['atelier', 'Ein Kranz wird vor Freitag schwierig.'],
      ['kunde', 'Dann lieber ein kleines Gesteck, das nehme ich gern.'],
    ],
    expectations: [
      { field: 'produkt', description: 'späteres gewähltes Produkt', includes: 'Tischgesteck' },
      { field: 'ursprungswunsch', description: 'erster Wunsch dokumentiert', includes: 'Kranz' },
    ],
  },
  {
    title: 'Verneintes Produkt ist keine Bestellung',
    messages: [
      ['kunde', 'Ich möchte keinen Kranz bestellen, ich wollte nur wissen, ob ihr so etwas macht.'],
    ],
    expectations: [
      { field: 'produkt', description: 'verneinter Kranz bleibt ohne Auftrag', absent: 'Kranz' },
    ],
  },
  {
    title: 'Alter Auftrag ohne neue Anfrage',
    messages: [
      ['kunde', 'Der Blumenhoop vom letzten Jahr war wunderschön, diesmal brauche ich gar nichts.'],
    ],
    expectations: [
      { field: 'produkt', description: 'alte Referenz startet keinen Auftrag', absent: 'Blumenhoop' },
    ],
  },
  {
    title: 'Offene Terminwahl ohne Entscheidung',
    messages: [
      ['kunde', 'Samstag oder Sonntag wäre möglich, ich muss erst noch schauen.'],
    ],
    expectations: [
      { field: 'termin', description: 'offene Wochenendwahl bleibt offen', absent: 'Sonntag' },
    ],
  },
  {
    title: 'Lieferung und Abholung werden nur erfragt',
    messages: [
      ['kunde', 'Kann man den Strauß auch liefern oder abholen? Ich entscheide später.'],
    ],
    expectations: [
      { field: 'lieferung', description: 'unentschiedene Versandfrage bleibt offen', absent: 'Lieferung' },
    ],
  },
  {
    title: 'Preisfrage ist noch kein Budget',
    messages: [
      ['kunde', 'Was würde ein Kranz ungefähr kosten, vielleicht 45 €?'],
    ],
    expectations: [
      { field: 'budget', description: 'unverbindliche Preisfrage setzt kein Budget', absent: '45' },
    ],
  },
  {
    title: 'Mehrfach verneinte Produkte',
    messages: [
      ['kunde', 'Kein Strauß. Einen Kranz möchte ich auch nicht. Ich informiere mich nur.'],
    ],
    expectations: [
      { field: 'produkt', description: 'mehrfach verneinte Produkte bleiben leer', absent: 'Strauß' },
      { field: 'produkt', description: 'zweite Verneinung bleibt leer', absent: 'Kranz' },
    ],
  },
]

let correct = 0
let total = 0
let exactConversations = 0

for (const scenario of scenarios) {
  const messages = scenario.messages.map(([from, text, extras], index) =>
    message(index + 1, from, text, extras),
  )
  const realtime = messages.map((_, index) =>
    deriveOrderFromChat(conversation(messages.slice(0, index + 1))).structured,
  )
  const result = realtime.at(-1)!
  const failures: string[] = []
  for (const expectation of scenario.expectations) {
    total += 1
    const value = String(result[expectation.field] ?? '')
    const passes = expectation.includes
      ? fold(value).includes(fold(expectation.includes))
      : expectation.absent
        ? !fold(value).includes(fold(expectation.absent))
        : false
    if (passes) correct += 1
    else failures.push(`${expectation.description}: „${value || '—'}“`)
  }
  if (failures.length === 0) exactConversations += 1
  const trail = realtime.map((entry) => entry.produkt || '—').join(' → ')
  console.log(`${failures.length ? 'FAIL' : 'PASS'}  ${scenario.title}`)
  console.log(`      Echtzeit-Produkt: ${trail}`)
  for (const failure of failures) console.log(`      ${failure}`)
}

const compound = deriveOrderFromChat(semanticStressConversation).structured
total += 1
if (fold(String(compound.produkt)).includes('tischgesteck') && fold(String(compound.ursprungswunsch)).includes('kranz')) {
  correct += 1
  exactConversations += 1
  console.log('PASS  Zusammengesetzter Korrekturverlauf bewahrt den Ursprungswunsch')
} else {
  console.log(`FAIL  Zusammengesetzter Korrekturverlauf: Produkt „${compound.produkt}“, Ursprung „${compound.ursprungswunsch}“`)
}
const fieldScore = Math.round((correct / total) * 100)
const conversationScore = Math.round((exactConversations / (scenarios.length + 1)) * 100)
console.log(`\nStressscore: ${correct}/${total} Felder = ${fieldScore}%`)
console.log(`Exakte Gespräche: ${exactConversations}/${scenarios.length + 1} = ${conversationScore}%`)

if (fieldScore < 100) process.exitCode = 1
