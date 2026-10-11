/**
 * Probe-l: Bestätigungsschleifen, Foto-Nein, Größenwechsel, Trinkgeld,
 * Warteliste, „bist du noch da?“, Namensverwechslung, Doppel-Dank.
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

// 1) Noch ein Foto? → Anna kann ablehnen oder akzeptieren, aber kein Goldring
turn('extra-foto-nein', 'Soll ich dir noch ein Foto schicken?', (s, m) =>
  !/goldring|alternative auf lager/i.test(s) &&
    (/foto|gerne|ja|reicht|danke|eins reicht|noch eins/i.test(s) ||
      m.reason === 'extra-photo'),
)

{
  const prior = [
    ...base,
    msg('atelier', 'Mittelgroß, ok?'),
    msg('kunde', 'Ja, mittelgroß passt.'),
  ]
  turn(
    'groesse-kleiner',
    'Soll ich ihn doch etwas kleiner machen?',
    (s, m) =>
      m.reason === 'size-smaller' &&
      /klein|handlich/i.test(s) &&
      !/lieber größer/i.test(s),
    prior,
  )
}

turn('trinkgeld', 'Darf ich ein kleines Trinkgeld mitnehmen, oder lieber nicht?', (s, m) =>
  m.reason === 'tip-decline' && /trinkgeld|nicht nötig|ohne|nein|reicht/i.test(s),
)

turn('warteliste', 'Soll ich dich für den nächsten Goldring auf die Warteliste setzen?', (s, m) =>
  m.reason === 'waitlist-later' &&
    /warte|liste|vormerk|strauß|jetzt/i.test(s) &&
    !/bringe ich mit/i.test(s),
)

turn('noch-da', 'Anna, bist du noch da?', (s, m) =>
  m.reason === 'presence-ack' &&
    /da|hier|schreib|lese|bin/i.test(s) &&
    !/beim strauß bleibe/i.test(s),
)

turn('falscher-name', 'Hallo Marie, der Strauß ist fertig — passt Samstag?', (s, m) =>
  m.reason === 'name-correct' &&
    /anna/i.test(s) &&
    !/ja marie/i.test(s),
)

turn('doppel-dank', 'Vielen Dank, super, danke dir!', (s, m) =>
  (m.reason === 'soft-ack' || /gerne|bitte|klar|passt|freu|danke/i.test(s)) &&
    !/goldring|was hättest du denn gerade sonst/i.test(s),
)

{
  const prior = [
    ...base,
    msg('atelier', 'Samstag 15–16 Uhr, Creme und Rosa, 45 Euro.'),
    msg('kunde', 'Ja, genau so. Dann machen wir das.'),
  ]
  turn(
    'alles-klar-so',
    'Alles klar so? Oder soll ich noch etwas ändern?',
    (s, m) =>
      m.reason === 'confirm-all' &&
      /klar|passt|genau|ändern|nichts|gut/i.test(s) &&
      !/goldring|alternative auf lager/i.test(s),
    prior,
  )
}

turn('fenster-eng', 'Geht bei dir auch 14 Uhr statt 15–16?', (s, m) =>
  m.reason === 'time-window-keep' &&
    /15|16|lieber|knapp|eng/i.test(s) &&
    !/wochenende passt es besser/i.test(s),
)

// 10) Auftrag: kleiner nach Korrektur
{
  const order = deriveOrderFromChat(
    emptyAnna([
      ...base,
      msg('atelier', 'Wie groß?'),
      msg('kunde', 'Mittelgroß.'),
      msg('atelier', 'Doch lieber kleiner?'),
      msg('kunde', 'Ja, lieber etwas kleiner und handlich.'),
    ]),
  )
  const g = String(order.structured.groesse ?? '')
  check(
    'order-kleiner',
    /klein|handlich/i.test(g),
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
