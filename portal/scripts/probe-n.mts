/**
 * Probe-n: Fertigstellung verzögert, Ersatzblume, Status-Updates,
 * Kartenzahlung, „noch was vergessen?“, Preis inkl. MwSt.
 */
import { classifyAtelierSpeechAct } from '../src/annaDialogRules.ts'
import { buildAnnaBelief } from '../src/annaBelief.ts'
import { deliberateAnna } from '../src/annaAgent.ts'
import { planAnnaReplies, ANNA_CHAT_ID, ANNA_FACTS } from '../src/annaBot.ts'
import { emptyStructuredOrder } from '../src/orderFromChat.ts'
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

{
  const prior = [
    ...base,
    msg('atelier', 'Samstag fertig, passt?'),
    msg('kunde', 'Samstag passt gut.'),
  ]
  turn(
    'verzoegerung-sonntag',
    'Leider erst Sonntag fertig, Samstag schaffe ich es nicht. Geht das?',
    (s, m) =>
      m.reason === 'termin-sunday' &&
      /sonntag/i.test(s) &&
      !/samstag nachmittag wäre mir lieber/i.test(s),
    prior,
  )
}

turn(
  'ersatzblume',
  'Statt Rosa hätte ich nur Pfingstrosen in Creme — wäre das ok?',
  (s) =>
    /creme|pfingst|ok|klar|passt|gerne|rosa|ohne/i.test(s) &&
    !/goldring|was hättest du denn gerade sonst/i.test(s),
)

turn('status-update', 'Ich melde mich kurz, wenn der Strauß fertig gebunden ist, ok?', (s, m) =>
  m.reason === 'notify-ok' && /fertig|melde|schreib|bescheid|update/i.test(s),
)

turn('karte-zahlen', 'Kartenzahlung geht auch, falls du kein Bargeld dabei hast — ok?', (s, m) =>
  m.reason === 'payment-card' &&
    /karte|bar|beides|ok|passt/i.test(s) &&
    !/ohne karte oder schleife/i.test(s),
)

turn('vergessen', 'Hast du noch etwas vergessen, das ich wissen sollte?', (s, m) =>
  m.reason === 'nothing-else' &&
    /nein|nichts|passt|alles|mehr/i.test(s) &&
    !/goldring|was hättest du denn gerade sonst/i.test(s),
)

turn('mwst', 'Die 45 Euro sind inkl. MwSt., klar?', (s, m) =>
  m.reason === 'price-confirm' &&
    /45|abgemacht|passen|einig|inkl|mwst/i.test(s) &&
    !/besser, als ich dachte/i.test(s),
)

turn('nachricht-spaeter', 'Ich bin gleich im Termin — schreibe in einer Stunde weiter, ok?', (s, m) =>
  m.reason === 'wait-later' &&
    /warte|klar|passt|melde|erreichbar/i.test(s) &&
    !/samstag sollte es fertig/i.test(s),
)

turn(
  'ersatz-gruen',
  'Eukalyptus ist alle — geht auch anderes Grün?',
  (s, m) =>
    m.reason === 'green-sub' &&
    /gr(ü|ue)n|ohne euk|anderes/i.test(s) &&
    !/eukalyptus eher wenig/i.test(s),
)

turn('abhol-code', 'Die Tür hat einen Code, ich schicke ihn Samstag früh — ok?', (s, m) =>
  m.reason === 'door-code-ok' && /code|samstag|klar|passt/i.test(s),
)

const failed = rows.filter((r) => !r.ok)
console.log(`\n${rows.length - failed.length}/${rows.length} ok`)
if (failed.length) {
  console.log('FAILED:')
  for (const f of failed) console.log(`  - ${f.name}: ${f.detail}`)
  process.exitCode = 1
}
