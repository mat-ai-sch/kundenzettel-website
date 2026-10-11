/**
 * Probe-k: Geschenkverpackung, Budget-Widerspruch, Typos, Öffnungszeiten-Detail,
 * „noch was?“ ohne Extra, Stimme/Sprachnachricht, Lieferort außerhalb.
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

turn('geschenkpapier', 'Soll ich den Strauß noch schön einpacken als Geschenk?', (s, m) =>
  m.reason === 'gift-wrap' &&
    /einpack|geschenk|papier|mitbringsel/i.test(s) &&
    !/bleibe beim strauß$/i.test(s),
)

turn('noch-was', 'Brauchst du sonst noch etwas dazu?', (s, m) =>
  (m.reason === 'addon-decline' || /nein|reicht|ohne|danke|nicht/i.test(s)) &&
    !/gerne noch|ja bitte noch/i.test(s),
)

turn(
  'budget-widerspruch',
  'Ich müsste auf 72 Euro gehen, der Aufwand ist größer. Passt das?',
  (s) =>
    /72|knapp|budget|50|richtung|viel|sprengt|teuer/i.test(s) &&
    !/besser, als ich dachte|dann bitte so$/i.test(s),
)

turn(
  'typo-samstag',
  'Samztag zur Abholung, passt das?',
  (s) =>
    /samstag|nachmittag|15|16|passt|uhr/i.test(s) && !/goldring/i.test(s),
)

turn('oeffnung-wochentag', 'Unter der Woche bin ich Di–Fr 10–18 Uhr da. Passt dir das?', (s, m) =>
  m.reason === 'hours-weekend' &&
    /samstag|wochenende|15|16/i.test(s) &&
    !/beim strauß bleibe/i.test(s),
)

turn('sprachnachricht', 'Ich schick dir gleich eine Sprachnachricht, ok?', (s, m) =>
  m.reason === 'voice-ok' &&
    /sprach|gerne|klar|ok|hör|text/i.test(s),
)

turn('liefer-moenchengladbach', 'Lieferung nach Mönchengladbach ginge auch — möchtest du das?', (s) =>
  /abhol|hole|lieber|umständlich|nein|nicht|viersen/i.test(s) && !/gerne liefern|ja bitte liefer/i.test(s),
)

{
  const prior = [
    ...base,
    msg('atelier', 'Der Strauß kostet 45 Euro.'),
    msg('kunde', 'Das passt gut für mich.'),
  ]
  turn(
    'rabatt-fragen',
    'Für Stammkundinnen mache ich 40 Euro — möchtest du den Rabatt?',
    (s) =>
      /40|gerne|ja|passt|danke|rabatt|super/i.test(s) &&
      !/knapp|richtung 50|sprengt/i.test(s),
    prior,
  )
}

turn('kerze-dazu', 'Soll eine Kerze in die Mitte, oder lieber ohne?', (s, m) =>
  m.reason === 'candle-decline' &&
    /ohne|kein|nicht|kerze/i.test(s) &&
    !/gerne eine kerze|ja mit kerze/i.test(s),
)

const failed = rows.filter((r) => !r.ok)
console.log(`\n${rows.length - failed.length}/${rows.length} ok`)
if (failed.length) {
  console.log('FAILED:')
  for (const f of failed) console.log(`  - ${f.name}: ${f.detail}`)
  process.exitCode = 1
}
