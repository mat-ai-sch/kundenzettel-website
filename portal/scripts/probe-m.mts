/**
 * Probe-m: Regen/Wetter, Umbuchung, „Kollegin übernimmt“, PayPal-only,
 * Referenz ablehnen, „schreib morgen“, Mengenkorrektur im Auftrag.
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

turn('regen', 'Bei Regen kann ich den Strauß nicht draußen übergeben — ok für dich drinnen?', (s, m) =>
  m.reason === 'indoor-ok' && /drin|atelier|regen/i.test(s),
)

turn('kollegin', 'Meine Kollegin Lisa übernimmt Samstag die Ausgabe, ok?', (s, m) =>
  m.reason === 'staff-ok' &&
    /kollegin|ok|klar|passt|ausgibt|abhol/i.test(s) &&
    !/ich bin anna/i.test(s),
)

turn('paypal-only', 'Geht bei mir nur PayPal, kein Bargeld — okay?', (s, m) =>
  m.reason === 'payment-paypal' &&
    /paypal/i.test(s) &&
    !/bar bei der abholung wäre mir am liebsten/i.test(s),
)

turn('ref-ablehnen', 'Das Referenzbild passt nicht so — soll ich ein anderes suchen?', (s, m) =>
  m.reason === 'ref-replace' && /andere|gerne|bild|foto|orientierung/i.test(s),
)

turn('schreib-morgen', 'Ich schaue mir das in Ruhe an und schreibe dir morgen, ok?', (s, m) =>
  m.reason === 'wait-tomorrow' &&
    /morgen|warte|ruhe|klar|passt/i.test(s) &&
    !/goldring|was hättest du denn gerade sonst/i.test(s),
)

{
  const prior = [
    ...base,
    msg('atelier', 'Samstag 15 Uhr, passt?'),
    msg('kunde', 'Samstag passt.'),
  ]
  turn(
    'umbuchung-sonntag',
    'Kannst du auf Sonntag umbuchen? Samstag ist voll.',
    (s, m) =>
      m.reason === 'termin-sunday' &&
      /sonntag/i.test(s) &&
      !/alternative auf lager/i.test(s),
    prior,
  )
}

turn('duft-intensiv', 'Soll der Strauß eher stark duften oder dezent?', (s, m) =>
  m.reason === 'scent-quiet' &&
    /dezent|wenig|nicht zu|zurückhalt/i.test(s) &&
    !/stark duften gerne/i.test(s),
)

turn('band-farbe', 'Schleifenband in Rosa oder Creme?', (s, m) =>
  (m.act === 'preference_ask' || m.reason === 'variant-choice' || /creme|rosa/i.test(s)) &&
    /creme|rosa|band|schleife|ohne/i.test(s),
)

{
  const order = deriveOrderFromChat(
    emptyAnna([
      msg('kunde', 'Jetzt nehme ich gern einen Strauß.'),
      msg('atelier', 'Einen oder zwei Sträuße?'),
      msg('kunde', 'Nur einen bitte.'),
    ]),
  )
  const m = String(
    (order.structured as { menge?: string; anzahl?: string }).menge ??
      (order.structured as { anzahl?: string }).anzahl ??
      '',
  )
  check(
    'order-menge-eins',
    !/2|zwei/i.test(m),
    `menge=${m || '(leer/ok)'}`,
  )
}

const failed = rows.filter((r) => !r.ok)
console.log(`\n${rows.length - failed.length}/${rows.length} ok`)
if (failed.length) {
  console.log('FAILED:')
  for (const f of failed) console.log(`  - ${f.name}: ${f.detail}`)
  process.exitCode = 1
}
