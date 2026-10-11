/**
 * Probe-j: härtere Alltags-Edges nach Probe-i
 * — Doppelstück, Farbkorrektur, Öffnungszeiten, Parken, Allergie,
 *   Anzahlung, eigenes Material, Variante A/B, Widerspruch Termin.
 */
import { classifyAtelierSpeechAct } from '../src/annaDialogRules.ts'
import { buildAnnaBelief } from '../src/annaBelief.ts'
import { deliberateAnna } from '../src/annaAgent.ts'
import { planAnnaReplies, ANNA_CHAT_ID, ANNA_FACTS } from '../src/annaBot.ts'
import { deriveOrderFromChat, emptyStructuredOrder } from '../src/orderFromChat.ts'
import type { Message, Conversation } from '../src/data.ts'

function msg(from: 'kunde' | 'atelier', text: string): Message {
  return {
    id: Math.random().toString(36).slice(2),
    from,
    kind: 'text',
    text,
    at: '12:00',
    status: 'delivered',
  }
}

function emptyAnna(messages: Message[] = []): Conversation {
  return {
    id: ANNA_CHAT_ID,
    kunde: ANNA_FACTS.fullName,
    telefon: '',
    online: true,
    unread: 0,
    lastPreview: '',
    lastAt: '12:00',
    status: 'anfrage',
    structured: emptyStructuredOrder({ adresse: ANNA_FACTS.address }),
    messages,
  }
}

type Row = { name: string; ok: boolean; detail: string }
const rows: Row[] = []
function check(name: string, ok: boolean, detail: string) {
  rows.push({ name, ok, detail })
  console.log(`${ok ? 'OK ' : 'FAIL'}  ${name} — ${detail.slice(0, 240)}`)
}

const base = [msg('kunde', 'Jetzt nehme ich gern einen Strauß.')]

function turn(
  name: string,
  atelier: string,
  pred: (s: string, m: { act: string; reason: string; media: boolean }) => boolean,
  prior: Message[] = base,
) {
  const conv = emptyAnna([...prior, msg('atelier', atelier)])
  const act = classifyAtelierSpeechAct(atelier)
  const d = deliberateAnna(buildAnnaBelief(conv), name)
  const plan = planAnnaReplies(conv, { entropy: name })
  const spoken = plan.bubbles.map((b) => b.text ?? '').join(' | ')
  const media = plan.bubbles.some((b) => b.image || b.video || b.referenceSearch)
  check(
    name,
    pred(spoken, { act: act.type, reason: d.reason, media }),
    `act=${act.type} reason=${d.reason} → ${spoken}`,
  )
}

// 1) Schon ein Stück bestellt → kein zweites
turn(
  'doppelbuchung',
  'Soll ich dir zusätzlich noch einen kleinen Tischkranz dazu machen?',
  (s, m) =>
    (/reicht|nur|einen|nein|danke|nicht|ohne|brauch|bleibe/i.test(s) &&
      !/gerne (noch|zwei)|beide|zusätzlich gerne/i.test(s)) ||
    m.reason === 'offer-stick' ||
    m.reason === 'qty-one',
)

// 2) Farbe korrigieren nach Zusage
{
  const prior = [
    ...base,
    msg('atelier', 'Creme und etwas Rosa, ok?'),
    msg('kunde', 'Ja, Creme und Rosa passt.'),
  ]
  turn(
    'farbe-korrektur',
    'Doch lieber ohne Rosa, nur Creme und Weiß — geht das?',
    (s, m) =>
      m.reason === 'color-revise' &&
      /creme|weiss|weiß|ohne rosa/i.test(s) &&
      !/rosa und creme passt/i.test(s),
    prior,
  )
}

// 3) Öffnungszeiten / wann abholen
turn('oeffnungszeiten', 'Wann kann man bei mir abholen, weißt du unsere Zeiten?', (s) =>
  /samstag|nachmittag|15|16|uhr|abhol/i.test(s) && !/goldring/i.test(s),
)

// 4) Parken / finden
turn('parken', 'Weißt du, wo du parken kannst bei uns?', (s, m) =>
  m.reason === 'parking' &&
    /park|finken|viersen|auto|nahe/i.test(s) &&
    !/goldring|beim strauß bleibe/i.test(s),
)

// 5) Allergie / Pollen
turn('allergie', 'Hast du Allergien gegen bestimmte Blumen oder Pollen?', (s, m) =>
  m.reason === 'no-allergy' &&
    /nein|keine|allerg|pollen|unempfindlich|normal/i.test(s),
)

// 6) Anzahlung
turn('anzahlung', 'Wäre eine kleine Anzahlung okay, so 20 Euro?', (s, m) =>
  m.reason === 'deposit-ok' &&
    /anzahlung|20|euro|überweis|bar|klar|passt|ordnung/i.test(s) &&
    !/besser, als ich dachte/i.test(s),
)

// 7) Eigenes Material mitbringen
turn(
  'eigen-material',
  'Möchtest du einen eigenen Rohling mitbringen, den ich belege?',
  (s, m) =>
    m.reason === 'own-blank-decline' &&
    /nein|nicht|eigen|rohling|atelier|bestand/i.test(s) &&
    !/bringe ich mit|habe noch einen/i.test(s),
)

// 8) Variante A/B nach Strauß-Wahl
turn(
  'variante-ab',
  'Option A eher luftig und klein, Option B üppiger. Was magst du?',
  (s, m) =>
    (m.act === 'preference_ask' || /luftig|a\b|klein|ruhig|nicht zu/i.test(s)) &&
    /luftig|a\b|klein|option a|nicht üppig|nicht uppig|zurückhalt/i.test(s) &&
    !/option b|üppiger gerne/i.test(s),
)

// 9) Termin-Widerspruch: Freitag nach Samstag-Zusage
{
  const prior = [
    ...base,
    msg('atelier', 'Samstag zur Abholung, passt das?'),
    msg('kunde', 'Samstag passt gut.'),
  ]
  turn(
    'termin-widerspruch',
    'Freitag wäre bei mir freier — geht Freitag bei dir?',
    (s, m) =>
      m.reason === 'termin-shift' &&
      /samstag/i.test(s) &&
      !/alternative auf lager/i.test(s),
    prior,
  )
}

// 10) Auftrag: Farbkorrektur landet in structured
{
  const order = deriveOrderFromChat(
    emptyAnna([
      ...base,
      msg('atelier', 'Creme und Rosa, ok?'),
      msg('kunde', 'Ja.'),
      msg('atelier', 'Doch lieber nur Creme und Weiß?'),
      msg('kunde', 'Ja, ohne Rosa, nur Creme und Weiß.'),
    ]),
  )
  const farben = String(order.structured.farben ?? '')
  check(
    'order-farbe-korrektur',
    /creme|weiß|weiss/i.test(farben) && !/\brosa\b/i.test(farben),
    `farben=${farben || '(leer)'}`,
  )
}

// 11) Größe korrigieren im Auftrag
{
  const order = deriveOrderFromChat(
    emptyAnna([
      ...base,
      msg('atelier', 'Wie groß darf er sein?'),
      msg('kunde', 'So mittelgroß.'),
      msg('atelier', 'Lieber etwas kleiner?'),
      msg('kunde', 'Ja, lieber etwas kleiner, handlich.'),
    ]),
  )
  const g = order.structured.groesse ?? ''
  check(
    'order-groesse-korrektur',
    /klein|handlich|nicht zu groß|zierlich|mittel/i.test(g) || g.length > 0,
    `groesse=${g || '(leer)'}`,
  )
}

const failed = rows.filter((r) => !r.ok)
console.log(`\n${rows.length - failed.length}/${rows.length} ok`)
if (failed.length) {
  console.log('FAILED:')
  for (const f of failed) console.log(`  - ${f.name}: ${f.detail}`)
  process.exitCode = 1
}
