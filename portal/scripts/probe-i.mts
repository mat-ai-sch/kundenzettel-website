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
  console.log(`${ok ? 'OK ' : 'FAIL'}  ${name} — ${detail.slice(0, 220)}`)
}

const base = [msg('kunde', 'Jetzt nehme ich gern einen Strauß.')]

function turn(
  name: string,
  atelier: string,
  pred: (s: string, m: { act: string; reason: string; media: boolean }) => boolean,
) {
  const conv = emptyAnna([...base, msg('atelier', atelier)])
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

turn('liefer-viersen', 'Ich könnte auch nach Viersen liefern, möchtest du das?', (s, m) =>
  /abhol|hole|lieber|umständlich|nein|danke/i.test(s) && !m.media,
)

turn('telefon', 'Kann ich dich kurz anrufen?', (s) =>
  /anruf|telefon|whatsapp|schreib|lieber|kurz|nummer|finken/i.test(s) ||
    /whatsapp|hier schreiben/i.test(s),
)

turn('rechnung', 'Brauchst du eine Rechnung?', (s, m) =>
  /rechnung|beleg|gerne|bitte|unterlagen/i.test(s) &&
    !/bleibe ich dabei/i.test(s) &&
    m.reason === 'invoice',
)

turn('storno-ok', 'Falls du absagen musst, einfach Bescheid sagen.', (s) =>
  /klar|passt|bescheid|melde|ok|alles/i.test(s) && !/goldring|alternative/i.test(s),
)

turn('zwei-strausse', 'Soll ich gleich zwei Sträuße machen?', (s) =>
  /einen|eine|reicht|nein|nur|einzel/i.test(s) && !/gerne zwei|beide/i.test(s),
)

turn('stil-kraftiger', 'Soll ich doch eher kräftiger binden?', (s, m) =>
  /ruhig|creme|rosa|nicht zu|lieber|kräftig|zurückhalt/i.test(s) &&
    m.reason === 'style-keep-quiet',
)

turn('zeit-16', 'Passt 16 Uhr zur Abholung?', (s) =>
  /16|15|passt|uhr|nachmittag|ja/i.test(s) && !/goldring/i.test(s),
)

turn('adresse-check', 'Finkenstraße 56 in Viersen, richtig?', (s) =>
  /ja|richtig|genau|stimmt|finken|viersen/i.test(s),
)

// Korrektur: Kunde ändert Termin
{
  const conv = emptyAnna([
    ...base,
    msg('atelier', 'Samstag fertig — geht das?'),
    msg('kunde', 'Samstag passt gut.'),
    msg('atelier', 'Doch lieber Freitag, geht das noch?'),
  ])
  const spoken = planAnnaReplies(conv, { entropy: 'freitag' })
    .bubbles.map((b) => b.text ?? '')
    .join(' ')
  check(
    'termin-korrektur-freitag',
    /freitag|samstag|knapp|lieber|passt|eng/i.test(spoken) && !/alternative auf lager/i.test(spoken),
    spoken,
  )
}

// Atelier wiederholt Preis nach Zusage
{
  const conv = emptyAnna([
    ...base,
    msg('atelier', 'Der Strauß kostet 45 Euro.'),
    msg('kunde', 'Das passt gut für mich. Dann machen wir das so.'),
    msg('atelier', 'Also 45 Euro, abgemacht?'),
  ])
  const spoken = planAnnaReplies(conv, { entropy: 'preis-nochmal' })
    .bubbles.map((b) => b.text ?? '')
    .join(' ')
  check(
    'preis-nochmal',
    /45|abgemacht|passt|genau|klar|einverstanden/i.test(spoken) &&
      !/knapp|richtung 50/i.test(spoken),
    spoken,
  )
}

// Auftrag Adresse
{
  const order = deriveOrderFromChat(
    emptyAnna([
      ...base,
      msg('atelier', 'Wie lautet deine Adresse?'),
      msg('kunde', 'Finkenstraße 56, 41749 Viersen'),
    ]),
  )
  check(
    'order-adresse',
    /finken|viersen|56/i.test(order.structured.adresse ?? ''),
    `adresse=${order.structured.adresse}`,
  )
}

const failed = rows.filter((r) => !r.ok)
console.log(`\n${rows.length - failed.length}/${rows.length} ok`)
if (failed.length) {
  console.log('FAILED:')
  for (const f of failed) console.log(`  - ${f.name}: ${f.detail}`)
  process.exitCode = 1
}
