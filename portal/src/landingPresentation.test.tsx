import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { register } from 'node:module'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { statusLabel, type OrderStatus } from './data'
import { demoMarieConversation } from './demoData'
import { deriveOrderFromChat, emptyStructuredOrder } from './orderFromChat'
import { landingCopy, landingLinks } from './landingCopy'
import {
  CHAT_ORDER_RATIO,
  computeFrame,
  endFrame,
  FLIGHT_REVEAL_DELAY,
  HERO_FIELD_KEYS,
  STORY_FLIGHTS,
  T,
} from './landing/story/storyFrame'
import {
  LANDING_CUSTOMER_NAME,
  LANDING_MESSAGE_IDS,
  LANDING_MESSAGES,
  LANDING_PRODUCT_NAME,
  landingConversation,
} from './landing/story/landingFixture'
import { deriveLandingOrder, STATUS_ORDER } from './landing/story/orderDerivation'
import { MARIE_SOURCE_MAP, sourceMessageIds, sourceMessages } from './landing/story/sourceMap'
import { STORY_BANDS, StoryState, stateAt } from './landing/story/storyStates'
import {
  advanceClock,
  createStoryController,
  MAX_FRAME_MS,
  REPLAY_DELAY_MS,
  START_DELAY_MS,
  STORY_MS,
  STORY_MS_RANGE,
  resolveFlowPhase,
  stageInView,
  storyProgressAt,
} from './landing/story/storyProgress'
import { PROOF_ENTER_MS, PROOF_MARKS, PROOF_STEPS, proofTotalMs } from './landing/story/proofSequence'
import { INCOMING_INDICATOR_MS, buildTypingTimeline, incomingIndicatorMs, typedTextAt } from './landing/story/typingSequence'
import { TOKEN_MAX_MS, TOKEN_MIN_MS, tokenDurationMs } from './landing/story/flipTokens'

// Die Stage importiert App.css; Node kennt kein CSS, daher ein leerer Stub für .css-Module.
register(
  'data:text/javascript,' +
    encodeURIComponent(
      "export async function load(url, context, next) { if (url.endsWith('.css')) return { format: 'module', source: 'export default {}', shortCircuit: true }; return next(url, context) }",
    ),
)
const { LandingPresentationMode, COMPOSER_PLACEHOLDER } = await import('./landing/LandingPresentationMode')
const { StoryTransport } = await import('./landing/StoryTransport')
const { TrustSection } = await import('./landing/TrustSection')

const demo = demoMarieConversation
const msg = (id: string) => {
  const found = landingConversation.messages.find((m) => m.id === id)
  assert.ok(found?.text, `Landing fixture message ${id} must exist`)
  return found
}
function escaped(text: string) {
  return renderToStaticMarkup(createElement('span', null, text)).slice(6, -7)
}
const sec = (seconds: number) => (seconds * 1000) / STORY_MS
const at = (seconds: number, options = {}) => computeFrame(sec(seconds), options)

// ── Landing-Fixture (C-08, PT-P1): eigenes Fixture, wörtlich gleich der Demo, ohne Telefon/Adresse ──────────
assert.deepEqual([...LANDING_MESSAGE_IDS], ['mk11', 'mk12', 'mk13', 'mk14'])
assert.deepEqual(landingConversation.messages.map((m) => m.id), ['mk11', 'mk12', 'mk13', 'mk14'])
assert.equal(landingConversation.telefon, '', 'Telefon bleibt leer')
assert.equal(landingConversation.kunde, LANDING_CUSTOMER_NAME)
assert.equal(LANDING_CUSTOMER_NAME, demo.kunde, '„(Demo)“ bleibt sichtbar')
assert.match(landingConversation.kunde, /\(Demo\)/)
assert.equal(LANDING_PRODUCT_NAME, demo.structured.produkt, 'Produktkopf konstant wie in der Demo')
for (const message of LANDING_MESSAGES) {
  const original = demo.messages.find((m) => m.id === message.id)
  assert.ok(original, `${message.id} existiert in der Demo`)
  assert.equal(message.text, original.text, `${message.id}: Wortlaut wörtlich`)
  assert.equal(message.from, original.from)
  assert.equal(message.kind, original.kind)
  assert.equal(message.at, original.at)
  assert.equal(message.status, original.status)
}
assert.equal(msg('mk11').from, 'atelier')
assert.equal(msg('mk12').from, 'kunde')
assert.equal(msg('mk13').from, 'atelier')
assert.equal(msg('mk14').from, 'kunde')
assert.match(msg('mk11').text!, /wie viel der Kranz kosten darf/)
{
  const serialized = JSON.stringify(landingConversation)
  assert.ok(!/5544332|Maximilianstr|45473|mk14c|mk14b|mk15|mk16|mk17/.test(serialized), 'Fixture ohne Telefon, Anschrift, mk14c')
  assert.ok(!/mk[1-9]"|mk10/.test(serialized), 'Fixture enthält nur mk11 bis mk14')
}

// ── Zustandsbänder: lückenlos von 0 bis 1 ─────────────────────────────────────────────
assert.equal(STORY_BANDS[0].from, 0)
assert.equal(STORY_BANDS[STORY_BANDS.length - 1].to, 1)
STORY_BANDS.forEach((band, index) => {
  if (index > 0) assert.equal(band.from, STORY_BANDS[index - 1].to, `Band ${band.state} muss lückenlos anschließen`)
})
assert.equal(stateAt(0), StoryState.INTRO)
assert.equal(stateAt(sec(1.0)), StoryState.CUSTOMER_REQUEST)
assert.equal(stateAt(sec(2)), StoryState.INITIAL_EXTRACTION)
assert.equal(stateAt(sec(4)), StoryState.MERCHANT_RESPONSE)
assert.equal(stateAt(sec(5)), StoryState.PRICE_REVISION)
assert.equal(stateAt(sec(6)), StoryState.CUSTOMER_CONFIRMATION)
assert.equal(stateAt(sec(7)), StoryState.PRICE_AGREED)
assert.equal(stateAt(1), StoryState.ORDER_COMPLETE)
assert.equal(stateAt(-3), StoryState.INTRO)
assert.equal(stateAt(7), StoryState.ORDER_COMPLETE)

// ── Zeitbasierter Fortschritt: Soll 8 s (7–9 s), ohne Scroll, ohne Loop ─────────────────
assert.equal(STORY_MS, 8000, 'Soll-Dauer 8,0 s (Brief T-05)')
assert.ok(STORY_MS >= STORY_MS_RANGE.min && STORY_MS <= STORY_MS_RANGE.max, 'Zeitlinie dauert 7–9 s')
assert.deepEqual({ ...STORY_MS_RANGE }, { min: 7000, max: 9000 })
assert.ok(START_DELAY_MS <= 600, 'Startverzögerung höchstens 600 ms')
assert.ok(REPLAY_DELAY_MS <= 300, 'Replay-Verzögerung höchstens 300 ms')
assert.ok(REPLAY_DELAY_MS < START_DELAY_MS)
assert.ok(START_DELAY_MS + STORY_MS <= 8600, 'Abnahme AC-02: im Blick bis Endzustand höchstens 8,6 s')
assert.equal(storyProgressAt(0), 0)
assert.equal(storyProgressAt(STORY_MS), 1)
assert.equal(storyProgressAt(STORY_MS * 5), 1, 'Endet bei 1, kein Loop')
assert.equal(storyProgressAt(-100), 0)
assert.ok(Math.abs(storyProgressAt(STORY_MS / 2) - 0.5) < 1e-9, 'Linear in der Zeit')
assert.equal(storyProgressAt(5000, 1000), 5000 / STORY_MS_RANGE.min, 'Dauer wird auf mindestens 7 s begrenzt')
assert.equal(storyProgressAt(4000, 20000), 4000 / STORY_MS_RANGE.max, 'Dauer wird auf höchstens 9 s begrenzt')
assert.equal(advanceClock(100, 5000), 100 + MAX_FRAME_MS, 'Tab-Wechsel überspringt die Zeitlinie nicht')
assert.equal(advanceClock(100, -5), 100)
{
  // Simulierter Lauf mit 60 fps ohne jede Scroll- oder Nutzereingabe erreicht den Endzustand.
  let elapsed = 0
  let steps = 0
  let last = -1
  while (storyProgressAt(elapsed) < 1 && steps < 5000) {
    elapsed = advanceClock(elapsed, 1000 / 60)
    const p = storyProgressAt(elapsed)
    assert.ok(p >= last, 'Fortschritt läuft nur vorwärts')
    last = p
    steps += 1
  }
  assert.ok(Math.abs(elapsed - STORY_MS) < 40, `Endzustand nach ca. ${STORY_MS} ms (war ${elapsed.toFixed(0)})`)
  const end = computeFrame(storyProgressAt(elapsed))
  assert.ok(end.visibleIds.includes('mk14') && end.status === 'bestaetigt')
  assert.equal(end.orderSnapshot.preisVereinbart, '75 €')
}

// ── Ableitung auf dem sichtbaren Präfix [mk11..mkN] (C-04, 06b §1 A) ─────────────────────────
// Unabhängige Referenz: Produktlogik direkt auf der Demo-Konversation, leerer Ausgangsstand, Status „anfrage“.
function referenceDerivation(count: number) {
  const prefix = LANDING_MESSAGE_IDS.slice(0, count)
  const derived = deriveOrderFromChat({
    ...demo,
    telefon: '',
    status: 'anfrage',
    structured: emptyStructuredOrder(),
    messages: demo.messages.filter((m) => (prefix as readonly string[]).includes(m.id)),
  })
  return {
    termin: derived.structured.termin ?? '',
    budget: derived.structured.budget ?? '',
    preisVereinbart: derived.structured.preisVereinbart ?? '',
    status: derived.status,
  }
}
const EXPECTED_DERIVATION = [
  { termin: '', budget: '', preisVereinbart: '', status: 'anfrage' },
  { termin: 'Mittwoch', budget: 'Wunsch bis 65 €', preisVereinbart: '', status: 'angebot' },
  { termin: 'Mittwoch', budget: 'Wunsch bis 65 €', preisVereinbart: '', status: 'angebot' },
  { termin: 'Mittwoch', budget: 'Wunsch bis 65 €', preisVereinbart: '75 €', status: 'bestaetigt' },
] as const
for (let count = 1; count <= 4; count += 1) {
  const derived = deriveLandingOrder(count)
  assert.deepEqual({ ...derived }, { ...referenceDerivation(count) }, `Präfix mk11..mk${10 + count}: Landing = Produktableitung`)
  assert.deepEqual({ ...derived }, { ...EXPECTED_DERIVATION[count - 1] }, `Präfix mk11..mk${10 + count}: erwartete Strings`)
}
assert.ok(!/\u00a0|\u202f/.test(deriveLandingOrder(4).budget + deriveLandingOrder(4).preisVereinbart), 'Kein NBSP in den Werten (C-01)')
assert.notEqual(deriveLandingOrder(4).preisVereinbart, demo.structured.preisVereinbart, 'Fixture-Literal ist nie Quelle')
assert.notEqual(deriveLandingOrder(2).termin, demo.structured.termin, 'Nie „Mittwoch · Fertigstellung“')

// ── Beat-Folge (Brief §5): Typing-in → Mark → Extract → Outbound typing → 75€ markiert → Zustimmung → Pointe ──
{
  const b0 = at(0.2)
  assert.deepEqual([...b0.visibleIds], ['mk11'], 'B0: nur mk11')
  assert.equal(b0.status, 'anfrage')
  assert.equal(b0.typingIndicator, false)
  assert.equal(b0.state, StoryState.INTRO)

  assert.equal(at(0.6).typingIndicator, true, 'B1: Tipp-Indikator vor mk12')
  assert.ok(!at(0.6).visibleIds.includes('mk12'))
  assert.ok(at(1.0).visibleIds.includes('mk12') && !at(1.0).typingIndicator, 'B1: mk12 ohne Typewriting')

  assert.ok(at(1.3).marks.some((m) => m.messageId === 'mk12'), 'B2: Mittwoch/65€ in mk12 markiert')
  assert.equal(at(1.3).orderSnapshot.termin, undefined, 'B2: Wert erst nach dem Token-Flug')
  assert.equal(at(1.9).orderSnapshot.termin, 'Mittwoch')
  assert.equal(at(1.9).orderSnapshot.budget, undefined)
  assert.equal(at(1.9).status, 'anfrage', 'Angebot nicht vor dem Füllen von Budget')
  assert.equal(at(2.6).orderSnapshot.budget, 'Wunsch bis 65 €')
  assert.equal(at(2.6).status, 'angebot')
  const b3 = at(2.9)
  assert.equal(b3.liveFields.length, 0, 'B3: Ruhe')
  assert.equal(b3.typingIndicator, false)

  const b4 = at(3.8)
  assert.ok(b4.composerText.length > 0 && msg('mk13').text!.startsWith(b4.composerText), 'B4: Antwort wird im Composer getippt')
  assert.ok(!b4.visibleIds.includes('mk13'))
  assert.equal(b4.typingIndicator, false, 'Ausgehend gibt es keinen Typing-Indikator')
  assert.ok(at(4.4).visibleIds.includes('mk13') && at(4.4).composerText === '')
  assert.equal(at(4.4).orderSnapshot.preisVereinbart, undefined, 'B4: Preis (vereinbart) leer')

  const b5 = at(5.0)
  assert.ok(b5.marks.some((m) => m.messageId === 'mk13' && m.texts.includes('75€')), 'B5: 75€ markiert')
  assert.equal(b5.orderSnapshot.preisVereinbart, undefined, 'B5: Preis (vereinbart) bleibt leer (PT-V1)')
  assert.equal(b5.supersededFields.size, 0, 'B5: Budget nicht durchgestrichen')
  assert.equal(b5.status, 'angebot')
  assert.equal(b5.orderSnapshot.budget, 'Wunsch bis 65 €')

  assert.equal(at(5.8).typingIndicator, true, 'B6: Tipp-Indikator vor mk14')
  assert.ok(!at(5.8).visibleIds.includes('mk14'))
  const mk14Only = at(6.2)
  assert.ok(mk14Only.visibleIds.includes('mk14') && !mk14Only.typingIndicator)
  assert.equal(mk14Only.orderSnapshot.preisVereinbart, undefined, 'mk14 sichtbar, Wert folgt erst nach dem Flug')
  assert.equal(mk14Only.status, 'angebot', 'Bestätigt erst mit dem Füllen von Preis (vereinbart)')

  const b7 = at(7.0)
  assert.equal(b7.orderSnapshot.preisVereinbart, '75 €', 'B7: Pointe')
  assert.equal(b7.status, 'bestaetigt')
  assert.equal(b7.supersededFields.size, 0, 'B7: noch nicht durchgestrichen')

  const b8 = at(7.5)
  assert.ok(b8.supersededFields.has('budget') && b8.supersededFields.size === 1, 'B8: nur Budget wird durchgestrichen')
  assert.equal(b8.orderSnapshot.budget, 'Wunsch bis 65 €', 'Wert bleibt, nur die Darstellung ist durchgestrichen')
}

// ── Kein Frame wird der Ableitung vorweggenommen (PT-V1, PT-V2, PT-V3) ───────────────────────────────
{
  const realIds = new Set(LANDING_MESSAGE_IDS as readonly string[])
  let previousRank = 0
  let firstPrice = -1
  let firstStrike = -1
  let firstAngebot = -1
  for (let p = 0; p <= 1.0001; p += 0.001) {
    const frame = computeFrame(p)
    const shown = frame.orderSnapshot
    const derived = deriveLandingOrder(frame.visibleIds.length)
    for (const id of frame.visibleIds) assert.ok(realIds.has(id), `Frame zeigt unbekannte Nachricht ${id}`)
    assert.deepEqual([...frame.visibleIds], LANDING_MESSAGE_IDS.slice(0, frame.visibleIds.length), 'Sichtbar ist immer ein Präfix mk11..mkN')
    assert.ok(!frame.visibleIds.includes('mk14c') && !frame.visibleIds.includes('mk10'))
    assert.ok(!shown.adresse && !shown.stil && !shown.farben && !shown.blumenauswahl && !shown.preisBegruendung)
    assert.ok(frame.typingIndicator ? !frame.composerText : true)
    assert.equal(frame.orderSnapshot.produkt, LANDING_PRODUCT_NAME, 'Produktkopf konstant ab Beginn')
    assert.equal(frame.fieldKeys, HERO_FIELD_KEYS, 'Reservierte Zeilen von Beginn an, kein Wachsen')
    // Gezeigte Werte sind exakt die Ableitungsstrings und nie früher als die Quelle.
    if (shown.termin !== undefined) assert.equal(shown.termin, derived.termin)
    if (shown.budget !== undefined) assert.equal(shown.budget, derived.budget)
    if (shown.preisVereinbart !== undefined) {
      assert.equal(shown.preisVereinbart, derived.preisVereinbart)
      assert.ok(frame.visibleIds.includes('mk14'), `Preis (vereinbart) nie vor mk14 (p=${p.toFixed(3)})`)
      if (firstPrice < 0) firstPrice = p
    }
    // Status: nie höher als die Ableitung, Angebot nicht vor Budget, Bestätigt nicht vor Preis.
    const rank = STATUS_ORDER.indexOf(frame.status)
    assert.ok(rank <= STATUS_ORDER.indexOf(derived.status), `Status ${frame.status} höher als inferStatus`)
    if (frame.status !== 'anfrage') assert.ok(shown.budget, 'Angebot nicht vor dem Füllen von Budget (Wunsch)')
    if (frame.status === 'bestaetigt') assert.ok(shown.preisVereinbart, 'Bestätigt nicht vor Preis (vereinbart)')
    if (frame.status === 'angebot' && firstAngebot < 0) firstAngebot = p
    assert.ok(rank >= previousRank, 'Statusfolge nur vorwärts: Anfrage → Angebot → Bestätigt')
    assert.ok(rank <= 2, 'Nie über Bestätigt hinaus')
    previousRank = rank
    if (frame.supersededFields.size > 0) {
      assert.ok(shown.preisVereinbart, 'Streichung nie vor Preis (vereinbart)')
      if (firstStrike < 0) firstStrike = p
    }
    assert.ok(frame.orderSnapshot.konfidenz === 0, 'Keine erfundene Konfidenz')
  }
  assert.ok(firstPrice > 0 && firstStrike > firstPrice)
  assert.ok((firstStrike - firstPrice) * STORY_MS >= 240, 'Streichung ≥ 240 ms nach dem Füllen von Preis (vereinbart)')
  assert.ok(firstAngebot > 0)
}

// ── Endzustand, Reduced Motion, Skip ──────────────────────────────────────────────────────────────
{
  const end = endFrame()
  assert.deepEqual([...end.visibleIds], ['mk11', 'mk12', 'mk13', 'mk14'])
  assert.equal(end.typingIndicator, false)
  assert.equal(end.composerText, '')
  assert.equal(end.status, 'bestaetigt')
  assert.equal(end.orderSnapshot.termin, 'Mittwoch')
  assert.equal(end.orderSnapshot.budget, 'Wunsch bis 65 €')
  assert.equal(end.orderSnapshot.preisVereinbart, '75 €')
  assert.deepEqual([...end.supersededFields], ['budget'], 'Endzustand: Streichung vorhanden')
  assert.equal(end.announcement, 'confirmed')
  const reduced = computeFrame(0.5, { reducedMotion: true })
  assert.equal(reduced.composerText, '', 'Reduced Motion: kein Typewriting')
  assert.ok(reduced.visibleIds.includes('mk13'))
  assert.equal(computeFrame(sec(0.6), { reducedMotion: true }).typingIndicator, false)
  assert.equal(computeFrame(1, { reducedMotion: true }).status, 'bestaetigt')
  assert.equal(CHAT_ORDER_RATIO, 0.52, 'Spaltenverhältnis fest 52 | 48')
}
assert.equal(at(1.9).announcement, null, 'Keine Ansage vor dem Füllen von Budget')
assert.equal(at(2.6).announcement, 'extraction')
assert.equal(at(5.0).announcement, 'extraction', 'Ansage „vereinbart“ nicht vor mk14')
assert.equal(at(7.0).announcement, 'confirmed')

// ── Typing: nur ausgehend getippt, eingehend ≤ 500 ms Indikator ─────────────────────────────────────
assert.ok(INCOMING_INDICATOR_MS.max <= 500, 'Tipp-Indikator höchstens 500 ms (Brief §5)')
for (const id of ['mk12', 'mk14']) {
  const ms = incomingIndicatorMs(msg(id).text!)
  assert.ok(ms >= INCOMING_INDICATOR_MS.min && ms <= INCOMING_INDICATOR_MS.max, `Indikator ${id}: ${ms} ms`)
}
assert.ok((T.requestVisible - T.requestIndicator) * 1000 <= 500, 'Indikator vor mk12 ≤ 500 ms')
assert.ok((T.confirmVisible - T.confirmIndicator) * 1000 <= 500, 'Indikator vor mk14 ≤ 500 ms')
assert.ok((T.composeEnd - T.composeStart) * 1000 <= 1000, 'Composer-Typewriting ≤ 1,0 s')
const replyText = msg('mk13').text!
const timeline = buildTypingTimeline(replyText)
assert.equal(typedTextAt(replyText, timeline, 0), '')
assert.equal(typedTextAt(replyText, timeline, 1), replyText)
let previous = ''
for (let t = 0; t <= 1.0001; t += 0.05) {
  const typed = typedTextAt(replyText, timeline, t)
  assert.ok(replyText.startsWith(typed), 'Getippter Text ist immer ein Präfix der echten Nachricht')
  assert.ok(typed.length >= previous.length, 'Tippen läuft nur vorwärts')
  previous = typed
}

// ── Token-Flug 320–680 ms, ein Token zur Zeit, Texte wörtlich (C-05) ───────────────────────────────
assert.equal(tokenDurationMs(0), TOKEN_MIN_MS)
assert.equal(tokenDurationMs(100000), TOKEN_MAX_MS)
assert.deepEqual(STORY_FLIGHTS.map((f) => f.label), ['Mittwoch', '65€', '75€'])
for (const flight of STORY_FLIGHTS) {
  const text = msg(flight.messageId).text!
  assert.ok(text.includes(flight.mark), `Flug-Markierung „${flight.mark}“ steht wörtlich in ${flight.messageId}`)
  assert.equal(flight.label, flight.mark, 'Token-Text = wörtlicher Teilstring der Quellnachricht')
  assert.ok(!/\s€/.test(flight.label), 'Token nie „65 €“ / „75 €“')
}
STORY_FLIGHTS.forEach((flight, index) => {
  const next = STORY_FLIGHTS[index + 1]
  if (next) assert.ok(next.at - flight.at >= TOKEN_MAX_MS / STORY_MS, 'Flüge überlappen nicht (höchstens eine primäre Bewegung)')
  assert.ok(FLIGHT_REVEAL_DELAY * STORY_MS <= TOKEN_MIN_MS)
})

// ── Source-Map: nur Trust, nur budget und preisVereinbart ─────────────────────────────────────────
assert.deepEqual(Object.keys(MARIE_SOURCE_MAP), ['budget', 'preisVereinbart'])
assert.deepEqual([...MARIE_SOURCE_MAP.preisVereinbart], ['mk13', 'mk14'])
assert.deepEqual(sourceMessageIds('preisVereinbart', new Set(['mk13'])), ['mk13'])
assert.deepEqual(sourceMessageIds('produkt'), [])
assert.deepEqual(sourceMessageIds('termin'), [], 'Termin ist kein Quellfeld')
assert.deepEqual(sourceMessageIds('preisBegruendung'), [], 'Preisanpassung ist kein Quellfeld (C-09)')
assert.deepEqual(sourceMessageIds('blumenauswahl'), [], 'mk10 ist nicht im Landing-Fixture')
assert.deepEqual(sourceMessages('preisVereinbart').map((m) => m.id), ['mk13', 'mk14'])
assert.match(msg('mk13').text!, /75€/)

// ── SSR der Stage: echte Komponenten, Landing-Fixture ohne Telefon/Adresse ─────────────────────────
function stage(progress: number, extra: Record<string, unknown> = {}) {
  const frame = computeFrame(progress)
  return renderToStaticMarkup(
    createElement(LandingPresentationMode, {
      mode: 'landing-story',
      conversation: landingConversation,
      orderSnapshot: frame.orderSnapshot,
      visibleMessageIds: frame.visibleIds,
      fieldKeys: frame.fieldKeys,
      supersededFields: frame.supersededFields,
      status: frame.status,
      chatOrderRatio: CHAT_ORDER_RATIO,
      typingIndicator: frame.typingIndicator,
      composerText: frame.composerText,
      ...extra,
    }),
  )
}
const finalStage = stage(1)
for (const id of ['mk11', 'mk12', 'mk13', 'mk14']) {
  assert.ok(finalStage.includes(escaped(msg(id).text!)), `Stage zeigt ${id} aus der Demo`)
}
for (const id of ['mk9', 'mk10']) {
  assert.ok(!finalStage.includes(escaped(demo.messages.find((m) => m.id === id)!.text!)), `${id} ist nicht im Hero`)
}
assert.match(finalStage, /data-mode="landing-story"/)
assert.match(finalStage, /data-layout="split"/)
assert.match(stage(1, { layout: 'stack' }), /data-layout="stack"/)
assert.doesNotMatch(finalStage, /data-layout="sheet"|lp-sheet-open|is-interactive|data-has-source|lp-peek/, 'Kein Sheet, keine Quellenauswahl im Hero')
assert.match(finalStage, /Marie Köbbler \(Demo\)/)
assert.match(finalStage, /grid-template-columns:minmax\(0, ?0\.52fr\) minmax\(0, ?0\.48fr\)/, 'Chat | Auftrag fest 52 | 48')
// Felder: nur das Hero-Subset in Demo-Reihenfolge, Label von Beginn an sichtbar.
const fieldOrder = [...finalStage.matchAll(/data-order-field="([^"]+)"/g)].map((m) => m[1])
assert.deepEqual(fieldOrder, ['termin', 'budget', 'preisVereinbart'], 'Termin, Budget (Wunsch), Preis (vereinbart)')
for (const label of ['Termin', 'Budget (Wunsch)', 'Preis (vereinbart)']) {
  assert.ok(finalStage.includes(`<label>${escaped(label)}</label>`), `Label ${label}`)
  assert.ok(stage(0).includes(`<label>${escaped(label)}</label>`), `Label ${label} schon im Intro (reservierte Zeile)`)
}
assert.deepEqual([...stage(0).matchAll(/data-order-field="([^"]+)"/g)].map((m) => m[1]), fieldOrder, 'Intro reserviert dieselben Zeilen')
assert.doesNotMatch(finalStage, /Preisanpassung|Blumenauswahl|Farbwelt|>Stil<|Auftrags-Nr|>Größe</, 'Keine Felder außerhalb des Subsets')
assert.match(finalStage, /data-order-field="preisVereinbart"/)
assert.match(finalStage, />Mittwoch<\/textarea>/, 'Termin Mittwoch')
assert.match(finalStage, />Wunsch bis 65 €<\/textarea>/, 'Budget (Wunsch)')
assert.match(finalStage, />75 €<\/textarea>/, 'Preis (vereinbart) nach mk14')
assert.match(finalStage, /class="field[^"]*is-superseded[^"]*"[^>]*data-order-field="budget"/)
assert.doesNotMatch(finalStage, /class="field[^"]*is-superseded[^"]*"[^>]*data-order-field="(termin|preisVereinbart)"/)
assert.doesNotMatch(stage(sec(6.7)), /is-superseded/, 'Nicht durchgestrichen vor B8')
// Produktkopf konstant, keine zweite Zeile, kein Fallbacksatz, kein KI-Badge, kein Telefon.
assert.ok(finalStage.includes(escaped(LANDING_PRODUCT_NAME)))
assert.ok(stage(0).includes(escaped(LANDING_PRODUCT_NAME)), 'Produktkopf ab Beginn')
assert.doesNotMatch(finalStage, /Felder füllen sich|Noch kein Auftrag erkannt|WW-DEMO|Individuell ·|angelehnt an/)
assert.doesNotMatch(finalStage, /KI\s*\d+\s*%/, 'Keine erfundene Konfidenz-Zahl')
assert.doesNotMatch(finalStage, /data-order-field="notizen"/, 'Kein Notizenfeld in der Stage')
assert.ok(!finalStage.includes('5544332') && !finalStage.includes('+49 170') && !finalStage.includes('chat-head-phone'), 'Keine Telefonnummer öffentlich')
assert.ok(!finalStage.includes('Maximilianstr') && !finalStage.includes('45473') && !finalStage.includes('mk14c'), 'Keine Adresse öffentlich')
// Status-Leiste: alle fünf Labels, genau einer aktiv.
for (const label of Object.values(statusLabel)) assert.ok(finalStage.includes(`>${escaped(label)}</button>`), `Status-Label ${label}`)
assert.equal((finalStage.match(/<button[^>]*class="is-on"/g) ?? []).length, 1)
assert.match(finalStage, /<button[^>]*class="is-on"[^>]*>Bestätigt<\/button>/)
assert.match(stage(0), /<button[^>]*class="is-on"[^>]*>Anfrage<\/button>/)
assert.match(stage(sec(2.6)), /<button[^>]*class="is-on"[^>]*>Angebot<\/button>/)
// Composer: Platzhalter wie die Demo.
assert.equal(COMPOSER_PLACEHOLDER, 'Gib eine Nachricht ein')
assert.ok(stage(0).includes('>Gib eine Nachricht ein<'))
assert.doesNotMatch(finalStage, /Nachricht schreiben/)
// Auftragswerte brechen um statt abgeschnitten zu werden: wachsende Textfelder, kein einzeiliges <input>.
assert.match(finalStage, /class="field-grow"/)
assert.doesNotMatch(finalStage, /<input/i, 'Landing-Auftrag nutzt umbrechende Felder')
// Frames im Intro/Mitte.
assert.ok(!stage(0).includes('data-value="Mittwoch'), 'Intro zeigt noch keinen Termin')
assert.match(stage(sec(0.6)), /lp-typing-dots/)
assert.match(stage(sec(3.8)), /lp-caret/)
// A11y: Statusschalter sind versteckt; Felder sind im Hero immer inert (keine Quellenauswahl).
assert.match(finalStage, /class="status-track" aria-hidden="true" inert=""/)
assert.match(finalStage, /class="lp-fields-host" inert=""/)

// ── Eindeutige IDs: Hero und Trust zeigen dieselben Nachrichten (C: doppelte id="msg-…") ─────────────
const trustMarkup = renderToStaticMarkup(createElement(TrustSection))
{
  const ids = [...(finalStage + trustMarkup).matchAll(/\sid="([^"]+)"/g)].map((m) => m[1])
  const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index)
  assert.deepEqual(duplicates, [], 'Keine doppelten DOM-IDs zwischen Hero und Trust')
  assert.ok(ids.includes('msg-hero-mk12') && ids.includes('msg-trust-mk12'))
  assert.ok(trustMarkup.includes('data-msg-id="mk12"') && finalStage.includes('data-msg-id="mk12"'), 'Fixture-ID bleibt in data-msg-id')
}

// ── Trust: nur Quellen mk12..mk14, zwei Felder, kein Preisanpassung (C-09) ──────────────────────────
assert.deepEqual([...trustMarkup.matchAll(/data-order-field="([^"]+)"/g)].map((m) => m[1]), ['budget', 'preisVereinbart'])
assert.doesNotMatch(trustMarkup, /Preisanpassung|data-order-field="preisBegruendung"|Aufwendiger Rohling/)
for (const id of ['mk12', 'mk13', 'mk14']) assert.ok(trustMarkup.includes(escaped(msg(id).text!)), `Trust zeigt ${id}`)
assert.ok(!trustMarkup.includes(escaped(msg('mk11').text!)), 'Trust zeigt mk11 nicht')
assert.ok(trustMarkup.includes('Wunsch bis 65 €') && trustMarkup.includes('75 €'))
assert.match(trustMarkup, /class="field[^"]*is-superseded[^"]*"[^>]*data-order-field="budget"/)
assert.match(trustMarkup, /data-has-source/)
assert.doesNotMatch(trustMarkup, />Beispiel</, 'Bildunterschrift „Beispiel“ ist nicht sichtbar')
assert.doesNotMatch(trustMarkup, /5544332|Maximilianstr|45473/)

// ── Transport: zwei Zeichen, Beschriftung darunter, Trefferfläche ≥ 44 px ───────────────────────────
{
  assert.equal(resolveFlowPhase({ reduced: false, engaged: false, finished: true, paused: false, replaying: false }), 'STATIC')
  assert.equal(resolveFlowPhase({ reduced: false, engaged: true, finished: false, paused: false, replaying: false }), 'PLAYING')
  assert.equal(resolveFlowPhase({ reduced: false, engaged: true, finished: false, paused: true, replaying: false }), 'PAUSED')
  assert.equal(resolveFlowPhase({ reduced: false, engaged: true, finished: true, paused: false, replaying: false }), 'COMPLETED')
  assert.equal(resolveFlowPhase({ reduced: false, engaged: true, finished: false, paused: false, replaying: true }), 'REPLAYING')
  assert.equal(resolveFlowPhase({ reduced: true, engaged: false, finished: true, paused: false, replaying: false }), 'REDUCED_MOTION')
  const noop = () => {}
  const render = (phase: 'STATIC' | 'PLAYING' | 'PAUSED' | 'COMPLETED' | 'REPLAYING' | 'REDUCED_MOTION') =>
    renderToStaticMarkup(
      createElement(StoryTransport, { phase, onPlay: noop, onPause: noop, onResume: noop, onReplay: noop }),
    )
  const phases = ['STATIC', 'PLAYING', 'PAUSED', 'COMPLETED', 'REPLAYING', 'REDUCED_MOTION'] as const
  for (const phase of phases) {
    assert.match(render(phase), /class="lp-transport-caption">Ablauf abspielen</, `${phase}: Beschriftung bleibt`)
    assert.equal((render(phase).match(/<button/g) ?? []).length, 2, `${phase}: zwei Zeichen`)
  }
  assert.match(render('STATIC'), /data-slot="replay"[^>]*aria-label="Nochmal ansehen"/)
  assert.match(render('STATIC'), /data-slot="play"[^>]*aria-label="Ablauf abspielen"/)
  assert.match(render('STATIC'), /M5 12a7 7 0 1 0 2\.2-5\.1/)
  assert.match(render('STATIC'), /M8 5\.5v13l10-6\.5-10-6\.5Z/)
  assert.match(render('PLAYING'), /data-slot="play"[^>]*aria-label="Pause"/)
  assert.match(render('PLAYING'), /M8\.5 5\.5v13M15\.5 5\.5v13/)
  assert.match(render('PAUSED'), /data-slot="play"[^>]*aria-label="Fortsetzen"/)
  assert.match(render('PAUSED'), /M8 5\.5v13l10-6\.5-10-6\.5Z/)
  assert.match(render('REPLAYING'), /aria-label="Pause"/)
  assert.match(render('COMPLETED'), /data-slot="replay"[^>]*aria-label="Nochmal ansehen"/)
  assert.match(render('REDUCED_MOTION'), /disabled/)
  assert.equal((render('REDUCED_MOTION').match(/disabled/g) ?? []).length, 2)
  assert.doesNotMatch(render('PLAYING'), /Überspringen/)
}

// ── Copy und Links (unverändert bis zum Copy PASS, Phase 12) ───────────────────────────────────────
assert.equal(landingCopy.title, 'Aus WhatsApp\u2011Nachrichten werden klare Aufträge.')
assert.equal(landingCopy.subtitle, 'Ihre Kunden schreiben wie bisher.')
assert.equal(landingCopy.trustTitle, 'Was vereinbart wurde, bleibt nachvollziehbar.')
assert.equal(landingCopy.nextAria, 'Weiter zum nächsten Abschnitt')
assert.equal(landingCopy.playLabel, 'Ablauf abspielen')
assert.equal(landingCopy.replayLabel, 'Nochmal ansehen')
assert.ok(!Object.values(landingCopy).some((value) => /Maus|Fahren Sie|Sie entscheiden/.test(value)), 'Keine Hover-Anleitung mehr')
assert.ok(!('trustHint' in landingCopy))

// ── Trust: Auto-Quellenbeweis ~3 s ──────────────────────────────────────────────────────
assert.deepEqual(PROOF_STEPS.map((step) => step.id), ['budget', 'price', 'confirm'])
assert.equal(proofTotalMs(), 3000)
assert.ok(PROOF_ENTER_MS >= 500 && PROOF_ENTER_MS <= 700, 'Eintritt 500–700 ms')
for (const step of PROOF_STEPS) {
  assert.ok(msg(step.messageId).text!.includes(step.mark), `Beweis-Markierung „${step.mark}“ steht in ${step.messageId}`)
  assert.deepEqual(sourceMessageIds(step.field).includes(step.messageId), true, `${step.field} hat Quelle ${step.messageId}`)
  assert.ok(PROOF_MARKS[step.messageId].includes(step.mark))
}
assert.equal(PROOF_STEPS[0].mark, '65€')
assert.equal(PROOF_STEPS[1].mark, '75€')
assert.equal(landingCopy.primaryCta, 'Pilot anfragen')
assert.ok(!('audience' in landingCopy))
assert.equal(landingLinks.demo, 'https://demo.kundenzettel.de')
assert.match(landingLinks.pilot, /^mailto:info@kundenzettel\.de/)
assert.ok(!Object.values(landingCopy).some((value) => /^Kontakt$|für Floristikbetriebe/i.test(value)), 'Alte Headline/CTA entfernt')

// ── Kontakt-Dialog: Landing und Demo teilen denselben InterestLead ───────────────────────────────────
const { openInterestLeadOnClick } = await import('./InterestLead')
const fakeClick = (overrides: Record<string, unknown> = {}) => {
  let prevented = false
  const event = { defaultPrevented: false, button: 0, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, preventDefault: () => { prevented = true }, ...overrides }
  openInterestLeadOnClick(event as never)
  return prevented
}
assert.equal(fakeClick(), true, 'Linksklick öffnet den Dialog statt mailto')
assert.equal(fakeClick({ ctrlKey: true }), false, 'Ctrl-Klick bleibt mailto/neuer Tab')
assert.equal(fakeClick({ button: 1 }), false, 'Mittelklick bleibt mailto')

// ── Quell-Prüfungen ─────────────────────────────────────────────────────────────────────────────────
const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8')
{
  const page = read('./LandingPage.tsx')
  const trust = read('./landing/TrustSection.tsx')
  assert.match(page, /<InterestLead \/>/, 'Landing mountet denselben Dialog wie die Demo')
  assert.equal((page.match(/onClick=\{openInterestLeadOnClick\}/g) ?? []).length, 3, 'Header-Pilot, Hero-Pilot und Footer-Mail öffnen den Dialog')
  assert.match(trust, /href=\{landingLinks\.pilot\} onClick=\{openInterestLeadOnClick\}/, 'Trust-Pilot öffnet den Dialog')
  assert.match(read('./App.tsx'), /<InterestLead \/>/, 'Demo nutzt denselben Dialog')
  assert.doesNotMatch(page + trust, /Floristik/, 'Keine Floristik-Zeile auf der Landing')
}
const landingFiles = [
  './LandingPage.tsx',
  './landing/ProductStory.tsx',
  './landing/TrustSection.tsx',
  './landing/LandingPresentationMode.tsx',
  './landing/StaticBubble.tsx',
  './landing/StoryTransport.tsx',
  './landing/story/landingFixture.ts',
  './landing/story/orderDerivation.ts',
  './landing/story/storyFrame.ts',
  './landing/story/sourceMap.ts',
  './landing/story/storyProgress.ts',
  './landing/story/proofSequence.ts',
  './landing/story/textMarks.ts',
]
const pageSource = read('./LandingPage.tsx') + read('./landing/ProductStory.tsx') + read('./landing/TrustSection.tsx')
assert.doesNotMatch(pageSource, /gsap|LandingLight|LandingFragments|lp-float|data-lp-depth|lp-ambient/)
// PT-P1 / C-08: kein Import der Demo-Konversation, keine Telefon-/Adress-Literale im Landing-Code.
for (const file of landingFiles) {
  const source = read(file)
  assert.doesNotMatch(source, /demoMarieConversation|MARIE_VOICE_NOTE/, `${file} importiert die Demo-Konversation nicht`)
  assert.doesNotMatch(source, /5544332|Maximilianstr|45473|\+49 170/, `${file} ohne Telefon/Adresse`)
}
assert.ok(!existsSync(new URL('./landing/SourcePeek.tsx', import.meta.url)), 'SourcePeek entfällt (X-09)')
for (const file of ['./landing/ProductStory.tsx', './landing/LandingPresentationMode.tsx']) {
  assert.doesNotMatch(read(file), /useSourceSelection|SourcePeek|onSourceActive|sourceFields|sheetOpen|chatDim/, `${file}: keine Quellenauswahl im Hero`)
}
// Trust: Hover-Anleitung ist weg, der Beweis läuft automatisch beim Eintritt.
assert.doesNotMatch(read('./landing/TrustSection.tsx'), /trustHint\b|Fahren Sie mit der Maus/)
assert.match(read('./landing/TrustSection.tsx'), /IntersectionObserver/)
assert.match(read('./landing/TrustSection.tsx'), /PROOF_STEPS/)
// Hero: Transport vor der Bühne im DOM, immer gemountet; Scroll-Cue statisch und immer vorhanden.
{
  const page = read('./LandingPage.tsx')
  assert.ok(page.indexOf('<StoryTransport') > 0 && page.indexOf('<StoryTransport') < page.indexOf('<ProductStory'), 'Transport steht vor der Bühne im DOM')
  assert.doesNotMatch(page, /finished && \(|started && \(/, 'Bedienelemente werden nicht bedingt ent- und gemountet')
  assert.match(page, /data-flow=\{flow\}/)
  assert.match(page, /landingCopy\.nextAria/)
  assert.doesNotMatch(page, /exampleCaption/)
  assert.doesNotMatch(page, /onInteract|interrupt/, 'Kein globaler Pointerdown-Hold (X-11)')
  assert.match(page, /useStoryTimeline/)
}
assert.ok(!existsSync(new URL('./LandingLight.tsx', import.meta.url)))
assert.ok(!existsSync(new URL('./LandingFragments.tsx', import.meta.url)))
const pageCss = read('./LandingPage.css')
const stageCss = read('./landing/LandingPresentationMode.css')
const transportCss = read('./landing/StoryTransport.css')
const css = pageCss + stageCss
assert.doesNotMatch(css, /\.lp-float|\.lp-ambient|\.lp-light|rotate\(|scale\(0\.7\)/)
// Kein Scroll-Track mehr: Hero ist nicht sticky, und Scroll treibt die Story nicht an.
assert.doesNotMatch(pageCss, /220svh|position:\s*sticky|\.lp-hero-sticky/)
assert.match(pageCss, /\.lp-hero\s*\{[^}]*min-height:\s*100svh/)
const progressSource = read('./landing/story/storyProgress.ts')
assert.doesNotMatch(progressSource, /scrollProgress|combineProgress|autoplayFloor|releasedFloor|AUTOPLAY\b|RELEASE_MS/)
assert.match(progressSource, /autostart: false/)
assert.match(progressSource, /resolveFlowPhase/)
assert.doesNotMatch(progressSource, /getBoundingClientRect\(\)\.top|scrollY\s*[<>]\s*4\b/, 'Scrollposition steuert den Fortschritt nicht')
assert.doesNotMatch(progressSource, /pointerdown/i, 'Kein globaler Pointerdown-Hold')
assert.doesNotMatch(progressSource, /RESUME_AFTER_MS/, 'Kein automatisches Weiterlaufen nach Hold (X-11)')
// Safe-Area: `viewport-fit=cover` verlangt Insets an Header, Rändern und Footer.
assert.match(pageCss, /--lp-sat:\s*env\(safe-area-inset-top/)
assert.match(pageCss, /--lp-pad-l:\s*max\(var\(--lp-gutter\),\s*env\(safe-area-inset-left/)
assert.match(pageCss, /--lp-pad-r:\s*max\(var\(--lp-gutter\),\s*env\(safe-area-inset-right/)
assert.match(pageCss, /\.lp-footer-inner\s*\{[^}]*var\(--lp-sab\)/)
// Statischer Scroll-Cue: keine Animation am .lp-next (IX-V2, AC-15).
{
  const nextRules = [...pageCss.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/\.lp-next[^{,]*\{[^}]*\}/g)]
    .map((m) => m[0])
    .join('\n')
  assert.match(nextRules, /min-height:\s*44px/)
  assert.doesNotMatch(nextRules.replace(/animation:\s*none/g, ''), /animation|infinite/, 'Scroll-Cue ohne Animation')
}
// Transport: Touch-Ziele ≥ 44 px.
assert.match(transportCss, /\.lp-transport-btn\s*\{[^}]*min-width:\s*44px;[^}]*min-height:\s*44px/)
// Auftrags-Clipping: nichts wird per Ellipse oder nowrap abgeschnitten, Layout reagiert per Container Query.
assert.doesNotMatch(stageCss, /text-overflow:\s*ellipsis/)
assert.doesNotMatch(stageCss.replace(/\.lp-token\s*\{[^}]*\}/, ''), /white-space:\s*nowrap/)
// VA-V2: kein stilles Abschneiden. Die Auftragsspalte scrollt nicht, die Bühne wächst (Ghost-Sizing).
assert.doesNotMatch(stageCss, /\.lp-presentation \.order\s*\{[^}]*overflow-y:\s*auto/)
assert.match(pageCss, /\.lp-stage-ghost/)
assert.doesNotMatch(pageCss, /calc\(\s*100(?:svh|vh|dvh)\s*-\s*\d+px/, 'VA-V5: keine Viewport-Offset-Konstanten')
assert.match(read('./landing/ProductStory.tsx'), /lp-stage-ghost/)
assert.match(stageCss, /@container lp-stage/)
assert.match(pageCss, /container:\s*lp-stage\s*\/\s*inline-size/)
assert.match(pageCss, /\.lp-next\b/)
// Keine Operator-/Netzwerk-Abhängigkeiten in den öffentlichen Story-Modulen.
for (const file of ['./landing/ProductStory.tsx', './landing/LandingPresentationMode.tsx', './landing/TrustSection.tsx']) {
  assert.doesNotMatch(read(file), /\bfrom\s*['"]\.\.?\/(?:App|Composer|operatorApi|apiClient)(?:\.[^'"]+)?['"]/, file)
  assert.doesNotMatch(read(file), /\b(?:fetch|XMLHttpRequest|WebSocket)\s*\(|\b(?:localStorage|sessionStorage)\s*\./, file)
}

// ── Startregel (04 §2, Wire 06 §11 Nr. 5): Pointe muss im Bild sein ────────────────────────────────────
{
  const vh = 844
  // Mobil 390 × 844, Seitenanfang: Bühne beginnt bei 295, Preis-Zeile bei 925 und liegt außerhalb → kein Start.
  assert.equal(stageInView({ top: 295, bottom: 1054 }, { top: 925, bottom: 973 }, vh), false)
  // „Bühne bündig unter dem Header“ (Scroll 235): Preis-Zeile bei 690 ist vollständig sichtbar → Start.
  assert.equal(stageInView({ top: 60, bottom: 819 }, { top: 690, bottom: 738 }, vh), true)
  // Desktop 1440 × 900: gesamte Bühne sichtbar → Start, auch ohne Preis-Messung.
  assert.equal(stageInView({ top: 120, bottom: 717 }, { top: 398, bottom: 448 }, 900), true)
  assert.equal(stageInView({ top: 120, bottom: 717 }, null, 900), true)
  // Weniger als 35 % der Bühne sichtbar → kein Start, selbst wenn die Preis-Zeile im Bild liegt.
  assert.equal(stageInView({ top: 800, bottom: 1400 }, { top: 810, bottom: 850 }, vh), false)
  // Bühne vollständig außerhalb oder degeneriert.
  assert.equal(stageInView({ top: -900, bottom: -100 }, null, vh), false)
  assert.equal(stageInView({ top: 10, bottom: 10 }, null, vh), false)
}

// ── Controller: Wiederholen nach dem Scrollen zur Trust-Ebene (Gate-15-Befund) ──────────────────────────
{
  const listeners = new Map<string, Array<() => void>>()
  const addTo = (type: string, fn: () => void) => listeners.set(type, [...(listeners.get(type) ?? []), fn])
  const fire = (type: string) => (listeners.get(type) ?? []).forEach((fn) => fn())
  const fakeWindow = {
    innerHeight: 800,
    scrollY: 0,
    addEventListener: (type: string, fn: () => void) => addTo(type, fn),
    removeEventListener: (type: string, fn: () => void) =>
      listeners.set(type, (listeners.get(type) ?? []).filter((entry) => entry !== fn)),
  }
  const fakeDocument = { visibilityState: 'visible', addEventListener: addTo, removeEventListener: () => {} }
  let now = 0
  let nextId = 1
  const frames = new Map<number, (time: number) => void>()
  const globals = globalThis as Record<string, unknown>
  const saved = ['window', 'document', 'requestAnimationFrame', 'cancelAnimationFrame'].map((key) => [key, globals[key]] as const)
  globals.window = fakeWindow
  globals.document = fakeDocument
  globals.requestAnimationFrame = (fn: (time: number) => void) => {
    const id = nextId++
    frames.set(id, fn)
    return id
  }
  globals.cancelAnimationFrame = (id: number) => void frames.delete(id)
  const pump = (ms: number) => {
    for (let spent = 0; spent < ms; spent += 16) {
      now += 16
      const pending = [...frames.entries()]
      frames.clear()
      for (const [, fn] of pending) fn(now)
    }
  }

  const rect = { top: 100, bottom: 700 }
  const target = {
    getBoundingClientRect: () => rect,
    querySelector: () => null,
  } as unknown as HTMLElement
  const ui = { progress: 0, started: false, paused: false, waiting: false }
  const controller = createStoryController(target, false, {
    setProgress: (update) => void (ui.progress = update(ui.progress)),
    setScrolled: () => {},
    setStarted: (value) => void (ui.started = value),
    setPaused: (value) => void (ui.paused = value),
    setWaiting: (value) => void (ui.waiting = value),
  })

  // Die Story läuft im Bild, die Nutzerin scrollt zur Trust-Ebene: sofort Endzustand, keine Uhr mehr.
  pump(800)
  assert.ok(ui.progress > 0 && ui.progress < 1, 'Story läuft im Bild')
  rect.top = -900
  rect.bottom = -300
  fire('scroll')
  assert.equal(ui.progress, 1, 'Trust-Ebene: Endzustand')
  assert.equal(frames.size, 0, 'Nach dem Endzustand läuft kein Frame')

  // Zurück im Bild: „Wiederholen“ muss die Zeitlinie wirklich neu starten (vorher blieb `visible = false`).
  rect.top = 100
  rect.bottom = 700
  fire('scroll')
  controller.controls.replay()
  assert.equal(ui.progress, 0, 'Wiederholen setzt auf 0')
  assert.equal(ui.started, false)
  assert.equal(ui.waiting, false, 'Kein Offscreen-Hold nach dem Wiederholen im Bild')
  assert.equal(frames.size, 1, 'Wiederholen plant sofort einen Frame')
  pump(1000)
  assert.ok(ui.progress > 0 && ui.progress < 1, 'Zeitlinie läuft nach dem Wiederholen')
  pump(STORY_MS + 1000)
  assert.equal(ui.progress, 1, 'Zeitlinie erreicht den Endzustand erneut')

  // Wiederholen, während die Bühne außerhalb liegt: wartet („Fortsetzen“), beendet sich aber nicht sofort selbst.
  rect.top = -900
  rect.bottom = -300
  controller.controls.replay()
  assert.equal(ui.progress, 0, 'Wiederholen außerhalb des Bildes bleibt bei 0')
  assert.equal(ui.waiting, true, 'Offscreen-Hold wird angezeigt')
  assert.equal(frames.size, 0)
  rect.top = 100
  rect.bottom = 700
  fire('scroll')
  assert.equal(ui.waiting, false)
  pump(STORY_MS + 1000)
  assert.equal(ui.progress, 1, 'Nach Rückkehr ins Bild läuft die Wiederholung durch')

  controller.dispose()
  for (const [key, value] of saved) {
    if (value === undefined) delete globals[key]
    else globals[key] = value
  }
}

// Typen-Kontrolle: Statuswerte der Leiste sind die der Demo.
const statusKeys: OrderStatus[] = Object.keys(statusLabel) as OrderStatus[]
assert.deepEqual(statusKeys, [...STATUS_ORDER])

console.log('landing presentation tests passed')
