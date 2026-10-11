import type { Conversation, Message } from './data'
import { emptyStructuredOrder } from './orderFromChat'
import {
  planAnnaReplies,
  ANNA_CHAT_ID,
  ANNA_FACTS,
  ANNA_MEDIA,
  isAnnaBotChat,
  isConversationBoundary,
} from './annaBot'

const CLASSIC_OPENER =
  'Hallo Damaris\nHast du einen Moment? Ich bräuchte noch einmal etwas aus der Werkstatt.'

function assert(condition: unknown, message: string) {
  if (!condition) {
    console.error(`FAIL  ${message}`)
    process.exitCode = 1
    return
  }
  console.log(`ok    ${message}`)
}

function fold(value: string) {
  return value
    .toLowerCase()
    .replace(/ß/g, 'ss')
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
}

function emptyAnna(): Conversation {
  return {
    id: ANNA_CHAT_ID,
    kunde: 'Anna Hartmann (Test)',
    telefon: '+49 151 56732238',
    online: true,
    unread: 0,
    lastPreview: '',
    lastAt: '18:00',
    status: 'anfrage',
    structured: emptyStructuredOrder({ adresse: ANNA_FACTS.address }),
    messages: [],
  }
}

function withMessages(messages: Message[]): Conversation {
  return { ...emptyAnna(), messages }
}

function atelier(text: string, extras: Partial<Message> = {}): Message {
  return {
    id: `a-${Math.random().toString(36).slice(2, 7)}`,
    from: 'atelier',
    kind: extras.kind ?? 'text',
    text,
    at: '18:01',
    status: 'read',
    ...extras,
  }
}

function kunde(text: string, extras: Partial<Message> = {}): Message {
  return {
    id: `k-${Math.random().toString(36).slice(2, 7)}`,
    from: 'kunde',
    kind: extras.kind ?? 'text',
    text,
    at: '18:00',
    status: 'delivered',
    ...extras,
  }
}

function joined(conversation: Conversation): string {
  return planAnnaReplies(conversation)
    .bubbles.map((bubble) => [bubble.text, bubble.video, bubble.kind].filter(Boolean).join(' '))
    .join(' | ')
}

{
  const empty = emptyAnna()
  const plan = planAnnaReplies(empty, { entropy: 'live-smoke', now: new Date('2026-09-14T18:07:00') })
  assert(plan.bubbles.length >= 1 && plan.bubbles.length <= 2, 'leerer Chat: Anna schreibt zuerst')
  assert(
    plan.bubbles.every((b) => b.kind === 'text'),
    'Opener ohne Video — Dialog baut sich auf',
  )
  const openerText = plan.bubbles.map((b) => b.text ?? '').join(' ')
  assert(
    /hallo|hi |hey|guten |Damaris|zeit|moment|blumenhoop|hoop|goldring|bestell|stück|stuck|pampas|freundin|foto/i.test(
      openerText,
    ),
    'Opener begrüßt oder nennt den Anlass',
  )
  assert(
    plan.bubbles.every((b) => !/\p{Extended_Pictographic}/u.test(b.text ?? '')),
    'Opener ohne Emoji',
  )
}

{
  const variants = new Set<string>()
  let hitsReferenceShape = false
  let hitsNonHoop = false
  for (let i = 0; i < 30; i += 1) {
    const plan = planAnnaReplies(emptyAnna(), {
      entropy: `seed-${i}`,
      now: new Date('2026-09-14T18:07:00'),
    })
    assert(plan.bubbles.length >= 1 && plan.bubbles.length <= 2, `Opener ${i}: 1 oder 2 Blasen`)
    assert(
      plan.bubbles.every((b) => b.kind === 'text'),
      `Opener ${i}: nur Text`,
    )
    assert(
      plan.bubbles.every((b) => !/\p{Extended_Pictographic}/u.test(b.text ?? '')),
      `Opener ${i}: ohne Emoji`,
    )
    const joinedOpener = plan.bubbles.map((b) => b.text ?? '').join('\n')
    const foldedOpener = fold(joinedOpener)
    variants.add(joinedOpener)
    if (
      /hättest du|könntest du|noch einmal|wie bei meiner freundin|mit dem goldring/i.test(
        joinedOpener,
      )
    ) {
      hitsReferenceShape = true
    }
    if (
      /wandkranz|tuerkranz|türkranz|tischkranz|fensterkranz|adventskranz|gesteck|girlande|blickfang|augenweide|wunderfein|umarmung|traumt/i.test(
        foldedOpener,
      )
    ) {
      hitsNonHoop = true
    }
    assert(!/goldring-kranz|goldring-hoop|nicht aus dem/i.test(joinedOpener), `Opener ${i}: kein Kurios-Deutsch`)
    assert(!/\bluft für\b/i.test(joinedOpener), `Opener ${i}: nicht zu umgangssprachlich („Luft für“)`)
    assert(!/hast du kurz\?/i.test(joinedOpener), `Opener ${i}: nicht „hast du kurz?“ ohne Zeit`)
    assert(
      !/hast du kurz(?! zeit)/i.test(joinedOpener),
      `Opener ${i}: „hast du kurz“ braucht „Zeit“`,
    )
    // „so einen“ nur mit klarem Objekt — nie nackt
    if (/\bso einen\b|\bso ein\b|\bso was\b/.test(foldedOpener)) {
      assert(
        /blumenhoop|\bhoop\b|goldring|pampas|trocken|wandkranz|tuerkranz|tischkranz|fensterkranz|adventskranz|gesteck|girlande|traumtanzer|traumtaenzer|augenweide|wunderfein|gluckskind|glueckskind|blickfang|umarmung|flustern|fluestern|strau/.test(
          foldedOpener,
        ),
        `Opener ${i}: „so einen“ braucht Kontext, nicht nackt`,
      )
    }
    assert(
      /blumenhoop|\bhoop\b|goldring|pampas|trocken|freundin|wandkranz|tuerkranz|tischkranz|fensterkranz|adventskranz|gesteck|girlande|traumtanzer|traumtaenzer|augenweide|wunderfein|gluckskind|glueckskind|blickfang|umarmung|flustern|fluestern|strau/.test(
        foldedOpener,
      ),
      `Opener ${i}: nennt worum es geht`,
    )
    assert(
      !/\bkranz\b/.test(foldedOpener) ||
        /wandkranz|tuerkranz|tischkranz|fensterkranz|adventskranz|trockenblumenkranz/.test(
          foldedOpener,
        ),
      `Opener ${i}: Kranz nur als echte Kranz-Familie`,
    )
    assert(!/goldring-hoop/.test(foldedOpener), `Opener ${i}: keine Doppelbezeichnung Goldring-Hoop`)
    const isHoopOpener =
      /blumenhoop|goldring|pampas/.test(foldedOpener) &&
      !/wandkranz|tuerkranz|tischkranz|fensterkranz|adventskranz|gesteck|girlande/.test(foldedOpener)
    if (isHoopOpener) {
      assert(!/\bkranz\b/.test(foldedOpener), `Opener ${i}: Blumenhoop nicht als Kranz`)
    }
  }
  assert(variants.size >= 5, 'Opener variiert mit Entropy, nicht immer dasselbe Paar')
  assert(hitsReferenceShape, 'Opener trifft Referenzton (Bitte / Freundin / Goldring)')
  assert(hitsNonHoop, 'Opener streut auch Nicht-Hoop-Anfragen')
  assert(
    [...variants].some((text) => text !== CLASSIC_OPENER),
    'nicht nur Hallo Damaris + Werkstatt-Satz',
  )
  assert(
    [...variants].some((text) =>
      /wandkranz|türkranz|tuerkranz|tischkranz|fensterkranz|adventskranz|gesteck|girlande/i.test(text),
    ) || variants.size >= 8,
    'Opener streut Familien (oder genug Varianten)',
  )
  assert(
    [...variants].some((text) =>
      /traumtänzer|augenweide|wunderfein|glückskind|zarte umarmung|leises flüstern|blickfang/i.test(
        text,
      ),
    ),
    'Opener nutzt auch Kollektionsnamen',
  )
}

{
  // Nach „Hallo Anna“: Anliegen streuen wie Opener, nicht immer derselbe Blumenhoop
  const greetVariants = new Set<string>()
  let nonHoop = 0
  for (let i = 0; i < 36; i += 1) {
    const plan = planAnnaReplies(
      withMessages([atelier('Hallo Anna')]),
      { entropy: `greet-var-${i}`, now: new Date('2026-09-15T13:45:00') },
    )
    const spoken = annaSpokenText(plan)
    greetVariants.add(spoken)
    assert(!/noch die andere von ihr,\s*auf dem tisch/i.test(spoken), `Greeting ${i}: kein Komma-Fragment`)
    assert(
      !/^(von ihr noch|noch das vom|die hat noch eins)/i.test(spoken.trim()),
      `Greeting ${i}: keine Satzfragmente`,
    )
    if (
      /wandkranz|tuerkranz|türkranz|tischkranz|fenster|advent|gesteck|girlande|blickfang|augenweide|wunderfein|umarmung|traumt|strau/i.test(
        fold(spoken),
      )
    ) {
      nonHoop += 1
    }
  }
  assert(greetVariants.size >= 8, 'Greeting-Start: Anfragen variieren')
  assert(nonHoop >= 3, 'Greeting-Start: streut Produktfamilien')
}

{
  // Zweiter Clip: volle Sätze, kein „Einen Moment, noch die andere…“
  const plan = planAnnaReplies(
    withMessages([
      kunde('Könntest du noch einmal so einen Blumenhoop machen wie bei meiner Freundin?'),
      atelier('Hey Anna, klar doch. Was brauchst du?'),
      kunde('Das leite ich dir weiter', {
        kind: 'video',
        video: ANNA_MEDIA.hand.video,
        image: ANNA_MEDIA.hand.poster,
        duration: '0:05',
        text: undefined,
        forwarded: true,
      }),
      atelier('Schön, ich sehs.'),
    ]),
    { entropy: 'second-clip-full' },
  )
  const spoken = annaSpokenText(plan)
  assert(
    plan.bubbles.some((b) => b.kind === 'video' && b.video === ANNA_MEDIA.table.video),
    'Zweiter Clip: Tisch-Video',
  )
  assert(!/noch die andere von ihr,\s*auf dem tisch/i.test(spoken), 'Zweiter Clip: kein Komma-Fragment')
  assert(
    /schicke|leite|aufnahme|video|tisch/i.test(spoken),
    'Zweiter Clip: klarer voller Satz',
  )
}

{
  // Kollektion Augenweide: Produktfoto, nie freie Strohblume/Openverse
  let hit: ReturnType<typeof planAnnaReplies> | null = null
  for (let i = 0; i < 80; i += 1) {
    const p = planAnnaReplies(withMessages([atelier('Hallo Anna')]), {
      entropy: `augen-${i}`,
      now: new Date('2026-09-15T14:00:00'),
    })
    const spoken = annaSpokenText(p)
    if (/augenweide/i.test(spoken)) {
      hit = p
      break
    }
  }
  assert(hit, 'Augenweide-Kollektion: Opener irgendwann getroffen')
  if (hit) {
    const spoken = annaSpokenText(hit)
    assert(/kollektion/i.test(spoken), 'Augenweide: nennt Kollektion')
    assert(!/freies referenzbild/i.test(spoken), 'Augenweide: kein „freies Referenzbild“')
    assert(
      hit.bubbles.some((b) => b.image === '/products/augenweide.jpg'),
      'Augenweide: Kollektionsfoto',
    )
    assert(
      hit.bubbles.every((b) => !b.referenceSearch),
      'Augenweide: keine freie Bildsuche',
    )
  }
}

{
  const plan = planAnnaReplies(
    withMessages([
      kunde('Könntest du noch einmal so eine Augenweide machen?'),
      atelier('Hi'),
    ]),
    { entropy: 'augen-hi' },
  )
  const spoken = annaSpokenText(plan)
  assert(!/freies referenzbild/i.test(spoken), 'Augenweide-Hi: kein freies Referenzbild')
  assert(
    plan.bubbles.some((b) => b.image === '/products/augenweide.jpg'),
    'Augenweide-Hi: Kollektionsfoto nachgereicht',
  )
  assert(plan.bubbles.every((b) => !b.referenceSearch), 'Augenweide-Hi: keine Openverse-Suche')
}

{
  const openerDone = withMessages([
    kunde('Hallo Damaris'),
    kunde('Hast du einen Moment? Ich bräuchte noch einmal etwas aus der Werkstatt.'),
  ])
  assert(planAnnaReplies(openerDone).bubbles.length === 0, 'ohne Atelier-Nachricht keine weitere Antwort')
}

{
  const plan = planAnnaReplies(
    withMessages([
      kunde('Hallo Damaris'),
      kunde('Hast du einen Moment? Ich bräuchte noch einmal etwas aus der Werkstatt.'),
      atelier('Hey Anna, klar doch. Was brauchst du?'),
    ]),
  )
  const videos = plan.bubbles.filter((b) => b.kind === 'video')
  assert(videos.length === 1, 'erste Atelier-Antwort: ein Clip des Blickfangs')
  assert(videos[0]?.video === ANNA_MEDIA.hand.video, 'erster Clip: Handy-Nahaufnahme')
  assert(videos[0]?.forwarded === true, 'erster Clip: weitergeleitet an die Verkäuferin')
  assert(
    !/ich film|film dir|warte,? ich film/i.test(plan.bubbles.map((b) => b.text ?? '').join(' ')),
    'erste Antwort: kein Filmen-jetzt',
  )
  assert(
    plan.bubbles.every((b) => b.kind !== 'document' && b.kind !== 'image'),
    'kein PDF, kein Katalogfoto',
  )
  assert(
    !plan.bubbles.some((b) => (b.video ?? b.image ?? '').includes('glueckskind')),
    'kein zweites Produkt',
  )
}

{
  const plan = planAnnaReplies(
    withMessages([
      kunde('hey Damaris'),
      atelier('Hey Anna'),
      kunde('den hier mit dem Goldring. leit dir das von ihr weiter', {
        kind: 'video',
        video: ANNA_MEDIA.hand.video,
        image: ANNA_MEDIA.hand.poster,
        duration: '0:05',
        text: undefined,
        forwarded: true,
      }),
      atelier('Schön, ich sehs. Goldring ja?'),
    ]),
  )
  const videos = plan.bubbles.filter((b) => b.kind === 'video')
  assert(videos.length === 1, 'zweite Runde: zweite Kameraperspektive desselben Stücks')
  assert(videos[0]?.video === ANNA_MEDIA.table.video, 'zweiter Clip: Blickfang auf dem Tisch')
  assert(videos[0]?.forwarded === true, 'zweiter Clip: weitergeleitet')
  assert(/pampas|goldring|tisch|freundin/.test(fold(plan.bubbles.map((b) => b.text ?? '').join(' '))), 'beschreibt dasselbe Stück')
}

{
  const text = fold(
    joined(
      withMessages([
        kunde('hey'),
        atelier('Für das Angebot brauche ich noch kurz deine Anschrift.'),
      ]),
    ),
  )
  assert(text.includes('finken') && text.includes('viersen'), 'Adressfrage → Finkenstraße Viersen')
}

{
  const text = fold(
    joined(withMessages([kunde('hey'), atelier('Was darf der kosten / Budget?')])),
  )
  assert(text.includes('45'), 'Budgetfrage → 45 €')
}

{
  const text = fold(
    joined(withMessages([kunde('hey'), atelier('Bis wann brauchst du das Stück?')])),
  )
  assert(text.includes('samstag'), 'Terminfrage → Samstag')
}

{
  const text = fold(
    joined(
      withMessages([
        kunde('hey'),
        atelier('Der angepasste Blickfang würde 52€ kosten. Angebot so in Ordnung?'),
      ]),
    ),
  )
  assert(/einverstanden|vertrau|handarbeit|machen wir das so/.test(text), 'Preis 52 € im Stretch-Rahmen')
}

{
  const text = fold(
    joined(
      withMessages([
        kunde('hey'),
        atelier('Leider müssten wir auf 85€ anpassen, der Rohling ist aufwendiger.'),
      ]),
    ),
  )
  assert(/knapp|richtung|handarbeit/.test(text), 'Preis 85 € wird nicht einfach akzeptiert')
}

{
  const plan = planAnnaReplies(
    withMessages([
      kunde('hey'),
      atelier('', {
        kind: 'voice',
        audio: '/media/demo/WhatsApp_Sprachnachricht.mp3',
        text: undefined,
      }),
    ]),
  )
  assert(
    plan.bubbles.every((b) => b.kind !== 'voice'),
    'Anna sendet keine generierte Sprachnachricht',
  )
}

{
  const blocked: Conversation = {
    ...withMessages([atelier('Hey Anna')]),
    blocked: true,
  }
  assert(planAnnaReplies(blocked).bubbles.length === 0, 'blockiert → keine Antwort')
}

{
  const other: Conversation = { ...withMessages([atelier('Hey')]), id: 'demo-marie', kunde: 'Marie Köbbler (Demo)' }
  assert(planAnnaReplies(other).bubbles.length === 0, 'nur im Anna-Chat')
}

assert(isAnnaBotChat(emptyAnna()), 'Anna-Chat erkannt')
assert(ANNA_FACTS.wants === 'Blickfang', 'ein Produkt: Blickfang')
assert(ANNA_MEDIA.hand.video.includes('blickfang'), 'Clip 1 ist Blickfang')
assert(ANNA_MEDIA.table.video.includes('blickfang'), 'Clip 2 ist dasselbe Produkt')

{
  const plan = planAnnaReplies(
    withMessages([
      kunde('Hallo Damaris'),
      kunde('Hast du einen Moment? Ich bräuchte noch einmal etwas aus der Werkstatt.'),
      atelier(
        'Hallo Anna, schön von dir zu hören. Leider habe ich gerade keine Zeit und muss mich um meine Kinder kümmern',
      ),
    ]),
  )
  assert(plan.bubbles.every((b) => b.kind === 'text'), 'Grenze: kein Video')
  assert(plan.bubbles.length >= 1 && plan.bubbles.length <= 2, 'Grenze: kurze Absage')
  assert(
    /spaeter|meld|alles gut|kein thema|erstmal|passt|klar|ok/.test(
      fold(plan.bubbles.map((b) => b.text ?? '').join(' ')),
    ),
    'Grenze: akzeptiert den Abbruch',
  )
  assert(
    plan.bubbles.every((b) => !/\p{Extended_Pictographic}/u.test(b.text ?? '')),
    'Grenze ohne Emoji',
  )
}

{
  const plan = planAnnaReplies(
    withMessages([kunde('Hallo'), atelier('Stopp, bitte abbrechen.')]),
  )
  assert(plan.bubbles.every((b) => b.kind !== 'video'), 'Abbruchwort: kein Clip')
}

{
  const plan = planAnnaReplies(
    withMessages([
      kunde('Hallo Damaris'),
      kunde('Hast du einen Moment? Ich bräuchte noch einmal etwas aus der Werkstatt.'),
      atelier('Hallo Anna, ich habe leider gerade keine Zeit. Magst du dich später melden?'),
      kunde('Alles gut, dann später.'),
      atelier('So, die Kinder schlafen. Was kann ich tun?'),
    ]),
  )
  const text = fold(plan.bubbles.map((b) => b.text ?? '').join(' '))
  assert(plan.bubbles.some((b) => b.kind === 'video'), 'nach Pause: Anfrage fortsetzen mit Video')
  assert(plan.bubbles.some((b) => b.forwarded && b.kind === 'video'), 'nach Pause: Clip weitergeleitet')
  assert(/goldring|pampas|trocken|freundin|blumenhoop|hoop|sideboard|ring/.test(text), 'nach Pause: sie sagt, was sie braucht')
  assert(!/was du genau meinst|aufs sprung|ich glaub ja/.test(text), 'kein sinnloses Nachfragen')
  assert(
    plan.bubbles.every((b) => !/\p{Extended_Pictographic}/u.test(b.text ?? '')),
    'Fortsetzung ohne Emoji',
  )
}

{
  const deferrals = new Set<string>()
  const stopped = withMessages([kunde('Hallo'), atelier('Stopp, bitte abbrechen.')])
  for (let i = 0; i < 12; i += 1) {
    const plan = planAnnaReplies(stopped, { entropy: `defer-${i}` })
    assert(plan.bubbles.every((b) => b.kind !== 'video'), `Absage ${i}: kein Clip`)
    deferrals.add(plan.bubbles.map((b) => b.text ?? '').join('\n'))
  }
  assert(deferrals.size >= 2, 'Absage-Formulierung variiert')
}

{
  const text = fold(
    joined(withMessages([kunde('hey'), atelier('Welche Größe darf der Kranz haben?')])),
  )
  assert(text.includes('35'), 'Größenfrage → 35 cm')
}

{
  const text = fold(
    joined(
      withMessages([kunde('hey'), atelier('Soll das ein Geschenk werden, oder für dich?')]),
    ),
  )
  assert(/geschenk|schenk|mitbring|verschenk/.test(text), 'Geschenkfrage wird beantwortet')
}

{
  const text = fold(
    joined(
      withMessages([
        kunde('hey'),
        atelier('Für die Wand oder eher auf den Tisch?'),
      ]),
    ),
  )
  assert(/sideboard|wand|tisch/.test(text), 'Platzierung: Sideboard/Wand')
}

{
  const plan = planAnnaReplies(
    withMessages([kunde('Hallo Damaris'), atelier('Interessant.')]),
  )
  assert(plan.bubbles.every((b) => b.kind !== 'video'), 'unpassende Zeile: kein Video')
  assert(
    /blickfang|kranz|goldring/.test(fold(plan.bubbles.map((b) => b.text ?? '').join(' '))),
    'Fallback bleibt beim Stück',
  )
}

{
  const plan = planAnnaReplies(
    withMessages([
      kunde('hey'),
      atelier('Was brauchst du?'),
      kunde('den hier mit dem Goldring. leit dir das von ihr weiter', {
        kind: 'video',
        video: ANNA_MEDIA.hand.video,
        image: ANNA_MEDIA.hand.poster,
        duration: '0:05',
        text: undefined,
        forwarded: true,
      }),
      atelier('Schön, ich sehs. Goldring ja?'),
      kunde('die hat noch eins auf dem Tisch geschickt', {
        kind: 'video',
        video: ANNA_MEDIA.table.video,
        image: ANNA_MEDIA.table.poster,
        duration: '0:05',
        text: undefined,
        forwarded: true,
      }),
      atelier('Wirklich schön, der Goldring und die Trockenblumen. Genau so.'),
    ]),
  )
  assert(plan.bubbles.every((b) => b.kind !== 'video'), 'kein drittes Video nach beiden Clips')
  assert(plan.bubbles.some((b) => (b.text ?? '').length > 0), 'reagiert auf das Kompliment')
}

assert(
  isConversationBoundary(
    'Leider habe ich gerade keine Zeit und muss mich um meine Kinder kümmern',
  ),
  'Kinder/keine Zeit ist eine Grenze',
)
assert(!isConversationBoundary('Hey Anna, klar doch. Was brauchst du?'), 'Einladung ist keine Grenze')

function handVideo(): Message {
  return kunde('', {
    kind: 'video',
    video: ANNA_MEDIA.hand.video,
    image: ANNA_MEDIA.hand.poster,
    duration: '0:05',
    text: undefined,
    forwarded: true,
  })
}

function tableVideo(): Message {
  return kunde('', {
    kind: 'video',
    video: ANNA_MEDIA.table.video,
    image: ANNA_MEDIA.table.poster,
    duration: '0:05',
    text: undefined,
    forwarded: true,
  })
}

function afterHandVideo(atelierText: string): Conversation {
  return withMessages([
    kunde('Hallo Damaris'),
    kunde('Hast du einen Moment? Ich bräuchte noch einmal etwas aus der Werkstatt.'),
    atelier('Hey Anna, klar doch. Was brauchst du?'),
    kunde('dieser Goldring hier mit Pampas und Trockenblumen'),
    handVideo(),
    atelier(atelierText),
  ])
}

function afterBothVideos(atelierText: string): Conversation {
  return withMessages([
    kunde('Hallo Damaris'),
    kunde('Hast du einen Moment? Ich bräuchte noch einmal etwas aus der Werkstatt.'),
    atelier('Hey Anna, klar doch. Was brauchst du?'),
    kunde('dieser Goldring hier mit Pampas und Trockenblumen'),
    handVideo(),
    atelier('Schön, ich sehs. Goldring ja?'),
    kunde('die hat noch eins auf dem Tisch geschickt'),
    tableVideo(),
    atelier(atelierText),
  ])
}

const BLICKFANG_URLS = new Set([
  ANNA_MEDIA.hand.video,
  ANNA_MEDIA.hand.poster,
  ANNA_MEDIA.table.video,
  ANNA_MEDIA.table.poster,
])

function assertBlickfangMediaOnly(
  plan: ReturnType<typeof planAnnaReplies>,
  label: string,
) {
  for (const bubble of plan.bubbles) {
    for (const url of [bubble.image, bubble.video]) {
      if (!url) continue
      assert(BLICKFANG_URLS.has(url), `${label}: nur Hand/Tisch-Blickfang (${url})`)
    }
  }
}

function assertPhotoNotVideo(
  plan: ReturnType<typeof planAnnaReplies>,
  label: string,
  expectedPoster?: string,
) {
  const images = plan.bubbles.filter((b) => b.kind === 'image')
  const videos = plan.bubbles.filter((b) => b.kind === 'video')
  assert(videos.length === 0, `${label}: kein neues Video`)
  assert(images.length === 1, `${label}: genau ein Foto`)
  assert(images[0]?.image?.endsWith('.jpg'), `${label}: jpg-Standbild`)
  assert(!images[0]?.video, `${label}: Bildblase ohne mp4`)
  if (expectedPoster) {
    assert(images[0]?.image === expectedPoster, `${label}: erwartetes Standbild`)
  }
  assertBlickfangMediaOnly(plan, label)
  assert(images[0]?.forwarded === true, `${label}: Foto weitergeleitet`)
  const text = fold(plan.bubbles.map((b) => b.text ?? '').join(' '))
  assert(
    !/ich bleibe bei dem blickfang/.test(text) || /foto|standbild|clip|video/.test(text),
    `${label}: keine leere Absage`,
  )
  assert(
    !/schreib, wenn du von mir etwas brauchst/.test(text),
    `${label}: kein Abwimmeln`,
  )
  assert(
    /foto|standbild|clip|video|blumenhoop|hoop|goldring|blickfang|hand|tisch/.test(text),
    `${label}: Text bezieht sich auf Stück oder Medium`,
  )
  assert(
    plan.bubbles.every((b) => !/\p{Extended_Pictographic}/u.test(b.text ?? '')),
    `${label}: ohne Emoji`,
  )
}

{
  const plan = planAnnaReplies(
    afterHandVideo('ich kann das Video nicht abspielen. Hast du ein Foto?'),
  )
  assertPhotoNotVideo(plan, 'Playback-Klage', ANNA_MEDIA.hand.poster)
}

{
  const plan = planAnnaReplies(
    afterBothVideos('das ist wieder ein Video. Ich brauche ein Foto von dir'),
  )
  assertPhotoNotVideo(plan, 'wieder ein Video', ANNA_MEDIA.table.poster)
}

{
  const plan = planAnnaReplies(
    afterBothVideos('das ist wieder ein Video. Ich brauche in Foto von dir'),
  )
  assertPhotoNotVideo(plan, 'Tippfehler in Foto', ANNA_MEDIA.table.poster)
}

{
  const plan = planAnnaReplies(afterHandVideo('Hast du ein Foto von dir?'))
  assertPhotoNotVideo(plan, 'Foto von dir', ANNA_MEDIA.hand.poster)
}

{
  const plan = planAnnaReplies(
    withMessages([
      kunde('Hallo Damaris'),
      kunde('Hast du einen Moment? Ich bräuchte noch einmal etwas aus der Werkstatt.'),
      atelier('Hey Anna, klar doch. Was brauchst du?'),
      kunde('Den Blickfang meine ich, mit dem Goldring. Ich schicke dir ein kurzes Video.'),
      handVideo(),
      atelier('ich kann das Video nicht abspielen. Hast du ein Foto?'),
      kunde('geht bei dir nicht? das Foto von ihr in der Hand', {
        kind: 'image',
        image: ANNA_MEDIA.hand.poster,
        text: undefined,
        forwarded: true,
      }),
      atelier('Kannst du noch die andere Sicht als Foto schicken?'),
    ]),
  )
  assertPhotoNotVideo(plan, 'zweites Foto andere Sicht', ANNA_MEDIA.table.poster)
}

{
  const plan = planAnnaReplies(
    withMessages([
      kunde('Hallo'),
      atelier('Stopp, bitte abbrechen. ich kann das Video nicht abspielen. Hast du ein Foto?'),
    ]),
  )
  assert(plan.bubbles.every((b) => b.kind === 'text'), 'Grenze plus Fotofrage: trotzdem kein Medium')
  assert(plan.bubbles.every((b) => b.kind !== 'image' && b.kind !== 'video'), 'Grenze: weder Foto noch Video')
}

{
  const urls = [ANNA_MEDIA.hand.video, ANNA_MEDIA.hand.poster, ANNA_MEDIA.table.video, ANNA_MEDIA.table.poster]
  assert(
    urls.every((url) => /anna-blickfang-(hand|table)\.(mp4|jpg)$/.test(url)),
    'nur zwei Blickfang-Stämme, jpg und mp4',
  )
  assert(!urls.some((url) => /glueckskind|pdf|katalog/i.test(url)), 'keine anderen Medienstämme')
}

const BANNED_PHRASES = [
  'Worum es geht',
  'Kurz gesagt',
  'Zusammengefasst',
  'Schreib, wenn du',
  'Falls du möchtest',
  'Hier ist',
  'Anbei',
  'Ich verstehe, dass',
  'Wie kann ich helfen',
  'Der Kranz aus der Werkstatt, der Blickfang',
  'Der Kranz aus der Werkstatt',
  'das Stück Blickfang',
  'Ich bleibe bei dem Blickfang',
  'nicht aus dem Kopf',
  'nicht aus dem Sinn',
  'als Hauch',
  'Clip hakt',
  'Goldring-Kranz',
  'Goldring-Hoop',
  'Charakter soll',
  'Sitz hier und denk',
  'was am Kranz',
  'leit dir das',
] as const

const FILMING_NOW =
  /film dir|ich film|warte,? ich film|ich hab.?s gefilmt|ich schick dir die aufnahme/i

const LITERARY_TELLS =
  /nicht aus dem (kopf|sinn)|als hauch|clip hakt|goldring-kranz|goldring-hoop|charakter soll|sitz hier und denk|was am kranz|leit dir das|pampaslastig|erdrucken|beieinander|\bluft für\b/i

function annaSpokenText(plan: ReturnType<typeof planAnnaReplies>): string {
  return plan.bubbles.map((bubble) => bubble.text ?? '').join('\n')
}

function assertNoBannedPhrases(
  plan: ReturnType<typeof planAnnaReplies>,
  label: string,
) {
  const text = annaSpokenText(plan)
  const lower = text.toLowerCase()
  for (const phrase of BANNED_PHRASES) {
    assert(!lower.includes(phrase.toLowerCase()), `${label}: kein „${phrase}“`)
  }
  assert(!/\p{Extended_Pictographic}/u.test(text), `${label}: ohne Emoji`)
  assert(!FILMING_NOW.test(text), `${label}: kein Filmen-jetzt`)
  assert(!LITERARY_TELLS.test(text), `${label}: kein stilisiertes KI-Deutsch`)
  assert(!/\u2014/.test(text), `${label}: kein Gedankenstrich (—)`)
  assert(!/kranz aus der werkstatt/i.test(text), `${label}: kein Werkstatt-Apposition`)
  assert(!/goldring-hoop/i.test(text), `${label}: keine Doppelbezeichnung Goldring-Hoop`)
  // Blumenhoop-Chats: nicht „Kranz“ sagen. Off-Kollektion-Chats dürfen echte Kranz-Arten nennen.
  if (/blumenhoop|goldring|pampas/.test(lower) && !/wandkranz|tuerkranz|tischkranz|fenster|advent|gesteck|girlande/.test(lower)) {
    assert(!/\bkranz\b/i.test(text), `${label}: Anna meint Blumenhoop, nicht Kranz`)
  }
}

function assertMediaForwarded(
  plan: ReturnType<typeof planAnnaReplies>,
  label: string,
) {
  const media = plan.bubbles.filter((b) => b.kind === 'video' || b.kind === 'image')
  for (const bubble of media) {
    assert(bubble.forwarded === true, `${label}: ${bubble.kind} ist Weitergeleitet`)
  }
}

{
  const evening = new Date('2026-09-14T18:07:00')
  const morning = new Date('2026-09-14T09:12:00')
  const midday = new Date('2026-09-14T13:40:00')

  for (let i = 0; i < 24; i += 1) {
    const now = i % 3 === 0 ? morning : i % 3 === 1 ? midday : evening
    const plan = planAnnaReplies(emptyAnna(), {
      entropy: `tone-opener-${i}`,
      now,
    })
    assertNoBannedPhrases(plan, `Opener-Ton ${i}`)
  }

  for (let i = 0; i < 16; i += 1) {
    const first = planAnnaReplies(
      withMessages([
        kunde('Hallo Damaris'),
        kunde('Hast du einen Moment? Ich bräuchte noch einmal etwas aus der Werkstatt.'),
        atelier('Hey Anna, klar doch. Was brauchst du?'),
      ]),
      { entropy: `tone-video-${i}` },
    )
    assert(first.bubbles.some((b) => b.kind === 'video'), `Video-Szenario ${i}: Clip`)
    assert(first.bubbles.every((b) => b.kind !== 'image'), `Video-Szenario ${i}: noch kein Foto`)
    assertMediaForwarded(first, `Video-Ton ${i}`)
    assertNoBannedPhrases(first, `Video-Ton ${i}`)
    assert(
      /goldring|pampas|trocken|freundin|ring|hier/.test(fold(annaSpokenText(first))),
      `Video-Ton ${i}: nennt das Stück im Clip nicht als Katalogtitel`,
    )
    assert(
      !/blickfang/.test(fold(annaSpokenText(first))),
      `Video-Ton ${i}: kein Blickfang-SKU in der Zeige-Antwort`,
    )

    const playback = planAnnaReplies(
      afterHandVideo('ich kann das Video nicht abspielen. Hast du ein Foto?'),
      { entropy: `tone-playback-${i}` },
    )
    assertPhotoNotVideo(playback, `Playback-Ton ${i}`, ANNA_MEDIA.hand.poster)
    assertNoBannedPhrases(playback, `Playback-Ton ${i}`)

    const asked = planAnnaReplies(afterHandVideo('Hast du ein Foto von dir?'), {
      entropy: `tone-askphoto-${i}`,
    })
    assertPhotoNotVideo(asked, `Fotofrage-Ton ${i}`, ANNA_MEDIA.hand.poster)
    assertNoBannedPhrases(asked, `Fotofrage-Ton ${i}`)

    const bound = planAnnaReplies(
      withMessages([kunde('Hallo'), atelier('Stopp, bitte abbrechen.')]),
      { entropy: `tone-bound-${i}` },
    )
    assert(bound.bubbles.every((b) => b.kind === 'text'), `Grenze-Ton ${i}: nur Text`)
    assertNoBannedPhrases(bound, `Grenze-Ton ${i}`)

    const fallback = planAnnaReplies(
      withMessages([kunde('Hallo Damaris'), atelier('Interessant.')]),
      { entropy: `tone-fb-${i}` },
    )
    assertNoBannedPhrases(fallback, `Fallback-Ton ${i}`)
  }

  const resume = planAnnaReplies(
    withMessages([
      kunde('Hallo Damaris'),
      kunde('Hast du einen Moment? Ich bräuchte noch einmal etwas aus der Werkstatt.'),
      atelier('Hallo Anna, ich habe leider gerade keine Zeit. Magst du dich später melden?'),
      kunde('Alles gut, dann später.'),
      atelier('So, die Kinder schlafen. Was kann ich tun?'),
    ]),
    { entropy: 'tone-resume' },
  )
  assert(resume.bubbles.some((b) => b.kind === 'video'), 'Resume-Ton: Clip')
  assertMediaForwarded(resume, 'Resume-Ton')
  assertNoBannedPhrases(resume, 'Resume-Ton')
}

{
  for (let i = 0; i < 18; i += 1) {
    const plan = planAnnaReplies(
      withMessages([
        kunde('Hi.'),
        kunde('Ich denk seit Tagen an den Blumenhoop. Geht das noch mal?'),
        atelier('Welchen meinst du genau?'),
      ]),
      { entropy: `welchen-${i}` },
    )
    assert(plan.bubbles.some((b) => b.kind === 'video'), `welchen ${i}: leitet Clip weiter`)
    assertMediaForwarded(plan, `welchen ${i}`)
    assertNoBannedPhrases(plan, `welchen ${i}`)
    const spoken = fold(annaSpokenText(plan))
    assert(
      /goldring|pampas|trocken|freundin|hier|ring/.test(spoken),
      `welchen ${i}: deiktisch oder Materialien`,
    )
    assert(!/blickfang/.test(spoken), `welchen ${i}: kein Blickfang-Label`)
    assert(!/kranz aus der werkstatt/.test(spoken), `welchen ${i}: keine Werkstatt-Apposition`)
    assert(
      !/freundin,\s*pampas/i.test(annaSpokenText(plan)),
      `welchen ${i}: kein Komma-Fragment „Freundin, Pampas“`,
    )
    assert(
      !/blumenhoop wie bei meiner freundin,\s*pampas/i.test(spoken),
      `welchen ${i}: vollständiger Satz mit „mit Pampas“`,
    )
  }
}

{
  const plan = planAnnaReplies(
    withMessages([
      kunde('Hallo Damaris'),
      kunde('Hättest du noch einmal Zeit für so einen Blumenhoop, wenn das bei dir geht?'),
      atelier('Hallo Anna zur Zeit mache ich nur Sträuße'),
    ]),
    { entropy: 'pivot-strauss' },
  )
  const spoken = annaSpokenText(plan)
  assert(plan.bubbles.every((b) => b.kind !== 'video'), 'Pivot Strauß: kein Blumenhoop-Video')
  assert(/strau[sß]/i.test(spoken), 'Pivot Strauß: geht auf Sträuße ein')
  assert(!/goldring hier|leite ich dir das von meiner freundin/i.test(spoken), 'Pivot Strauß: kein Hoop-Intro')
  assert(
    plan.bubbles.some((b) => b.kind === 'image' && Boolean(b.referenceSearch)),
    'Pivot Strauß: freies Referenzbild',
  )
  assert(plan.bubbles.every((b) => !/freundin,\s*pampas/i.test(b.text ?? '')), 'Pivot: keine Satzfragmente')
}

{
  const plan = planAnnaReplies(
    withMessages([
      kunde('Hallo Damaris'),
      kunde('Könntest du noch einmal so einen Blumenhoop machen wie bei meiner Freundin?'),
      atelier('Zur Zeit mache ich nur Wandkränze — geht das für dich?'),
    ]),
    { entropy: 'pivot-wand' },
  )
  const spoken = annaSpokenText(plan)
  assert(plan.bubbles.every((b) => b.kind !== 'video'), 'Pivot Wandkranz: kein Hoop-Video')
  assert(/wandkranz/i.test(spoken), 'Pivot Wandkranz: benennt Alternative')
}

{
  const plan = planAnnaReplies(
    withMessages([
      kunde('Hallo Damaris'),
      kunde('Ich würde gern noch einmal so einen Blumenhoop machen lassen wie bei meiner Freundin.'),
      atelier(
        'Hallo Anna, schön von dir zu hören. Derzeit arbeite ich nur mit Frischware und verkaufe Blumensträuße oder Einzelwerkstücke.',
      ),
    ]),
    { entropy: 'pivot-frischware' },
  )
  const spoken = annaSpokenText(plan)
  assert(plan.bubbles.every((b) => b.kind !== 'video'), 'Pivot Frischware: kein Hoop-Video')
  assert(
    /frisch|strau[sß]|trockenst/i.test(spoken),
    'Pivot Frischware: geht auf Frischware/Strauß ein',
  )
  assert(!/\bgoldring\b/i.test(spoken), 'Pivot Frischware: kein Goldring-Fallback')
  assert(
    !plan.bubbles.some((b) => /^(Der|Die|Das) mit dem Goldring\.?$/i.test((b.text ?? '').trim())),
    'Pivot Frischware: kein „Der mit dem Goldring.“',
  )
  assert(
    plan.bubbles.some((b) => b.kind === 'image' && Boolean(b.referenceSearch)),
    'Pivot Frischware: Referenzbild',
  )
}

{
  const afterRef = withMessages([
    kunde('Hallo Damaris'),
    kunde('Ich würde gern noch einmal so einen Blumenhoop machen lassen wie bei meiner Freundin.'),
    atelier(
      'Hallo Anna, schön von dir zu hören. Derzeit arbeite ich nur mit Frischware und verkaufe Blumensträuße oder Einzelwerkstücke.',
    ),
    kunde('Ah okay, derzeit nur Frischware. Dann wäre ein Blumenstrauß für mich auch schön.'),
    kunde('Referenz Strauß', {
      kind: 'image',
      image: '/media/demo/anna-blickfang-hand.jpg',
      forwarded: true,
      attribution: 'test · by · Openverse',
      text: 'Referenz Strauß',
    }),
  ])

  const stock = planAnnaReplies(
    {
      ...afterRef,
      messages: [
        ...afterRef.messages,
        atelier(
          'Aus deiner Farbwahl habe ich derzeit kaum etwas da. Gibt es etwas anderes, was für dich in Frage kommt oder möchtest du abwarten bis ich am Donnerstag neue Ware habe?',
        ),
      ],
    },
    { entropy: 'stock-wait' },
  )
  const stockText = annaSpokenText(stock)
  assert(
    /andere|creme|rosa|gr[uü]n|etwas anderes|was hast du|gerne/i.test(stockText),
    'Lagerengpass: nimmt Kauferwartung an (Alternative jetzt)',
  )
  assert(!/soll ich warten/i.test(stockText), 'Lagerengpass: kein „Soll ich warten?“')
  assert(!/was ist dir wichtig/i.test(stockText), 'Lagerengpass: fragt Atelier nicht nach Wünschen')
  assert(!/\u2014/.test(stockText), 'Lagerengpass: kein Gedankenstrich')

  const role = planAnnaReplies(
    {
      ...afterRef,
      messages: [
        ...afterRef.messages,
        atelier(
          'Aus deiner Farbwahl habe ich derzeit kaum etwas da. Gibt es etwas anderes, was für dich in Frage kommt oder möchtest du abwarten bis ich am Donnerstag neue Ware habe?',
        ),
        kunde('Dann warte ich gern bis Donnerstag. Das passt besser als jetzt etwas Passendes zu erzwingen.'),
        atelier('Nein du bist die Kundin. Was ist dir wichtig?'),
      ],
    },
    { entropy: 'role-pref' },
  )
  const roleText = annaSpokenText(role)
  assert(
    /mir |wichtig|creme|rosa|grün|farbe/i.test(roleText),
    'Rollenkorrektur: Anna nennt eigene Wünsche',
  )
  assert(!/was ist dir wichtig/i.test(roleText), 'Rollenkorrektur: keine Rückfrage an Atelier')
  assert(!/richtung strau/i.test(roleText), 'Rollenkorrektur: kein „Richtung Strauß“')
  assert(!/\u2014/.test(roleText), 'Rollenkorrektur: kein Gedankenstrich')
}

{
  const plan = planAnnaReplies(
    withMessages([
      kunde('Hättest du noch einmal Zeit für so einen Blumenhoop wie bei meiner Freundin?'),
      atelier(
        'Leider habe ich zur Zeit keine Goldringe im Lager. Kann ich mir etwas Anderem aushelfen?',
      ),
      kunde('Verstehe. Was könntest du mir sonst gerade machen?'),
      atelier('Hast du privat noch einen Goldring den ich verwerten kann?'),
    ]),
    { entropy: 'privat-goldring' },
  )
  const spoken = annaSpokenText(plan)
  assert(/bringe|mitbring|zu hause|zuhause|habe noch/i.test(spoken), 'Privat-Goldring: sagt Mitbringen zu')
  assert(!/ohne goldring wird|hoop schwierig|schade wegen dem goldring/i.test(spoken), 'Privat-Goldring: keine Belehrung')
}

{
  const plan = planAnnaReplies(
    withMessages([
      kunde('Hallo Damaris, hättest du noch einmal Kapazität für so einen Blumenhoop wie bei meiner Freundin?'),
      atelier(
        'Hallo Anna, leider habe ich derzeit keine Goldringe auf Lager. Kann ich anderweitig etwas anbieten?',
      ),
    ]),
    { entropy: 'goldring-alt-offer' },
  )
  const spoken = annaSpokenText(plan)
  assert(
    /gerne|klar|strau[sß]|andere|creme|rosa|anbieten|zeig/i.test(spoken),
    'Goldring+Alternative: Kauferin nimmt Angebot an',
  )
  assert(!/soll ich warten/i.test(spoken), 'Goldring+Alternative: kein Warten-Frage an Atelier')
  assert(!/nachbestell/i.test(spoken), 'Goldring+Alternative: kein Nachbestellen-Rückspiel')
}

{
  const plan = planAnnaReplies(
    withMessages([
      kunde('Hallo Damaris'),
      kunde('Ich bräuchte einen Tischkranz, Mitte frei für eine Kerze.'),
      atelier('Hallo Anna, danke für deine Nachricht. Kränze habe ich erst ab Oktober auf Lager.'),
    ]),
    { entropy: 'oktober-kranz' },
  )
  const spoken = annaSpokenText(plan)
  assert(/oktober/i.test(spoken), 'Oktober-Sperre: nennt Oktober')
  assert(
    /warte|halte|alternative|sonst|jetzt/i.test(spoken),
    'Oktober-Sperre: wartet oder fragt nach Alternative',
  )
  assert(!/schauen wir nach einem kranz/i.test(spoken), 'Oktober-Sperre: kein Weiter-Bestellen')
  assert(
    plan.bubbles.every((b) => b.kind !== 'image' && !b.referenceSearch),
    'Oktober-Sperre: keine Kranz-Referenz',
  )
  assert(!/soll ich warten/i.test(spoken), 'Oktober-Sperre: kein „Soll ich warten?“')
}

{
  const plan = planAnnaReplies(
    withMessages([
      kunde('Hallo Damaris'),
      kunde('Ich bräuchte einen Tischkranz, Mitte frei für eine Kerze.'),
      atelier(
        'Hallo Anna, schön von dir zu hören. Wir starten mit den Kränzen erst ab Oktober. Derzeit habe ich einige schöne Dekoartikel oder ich kann dir aus Frischblumen etwas machen. Einen Strauß, ein Gesteck, eine Girlande oder auch Hoops.',
      ),
    ]),
    { entropy: 'oktober-liste' },
  )
  const spoken = annaSpokenText(plan)
  assert(/oktober/i.test(spoken), 'Oktober+Liste: nennt Oktober')
  assert(/gesteck|tischgesteck|strau[sß]|girlande|hoop|blumenhoop/i.test(spoken), 'Oktober+Liste: wählt Alternative')
  assert(!/was k[oö]nntest du mir jetzt sonst/i.test(spoken), 'Oktober+Liste: keine Rückfrage sonst')
  assert(!/^referenz\b/i.test(spoken.trim()), 'Oktober+Liste: kein Platzhalter „Referenz“')
  assert(!/was hast du gerade da/i.test(spoken), 'Oktober+Liste: keine Rückfrage da')
  assert(!/soll ich warten/i.test(spoken), 'Oktober+Liste: kein Soll-ich-warten')
  assert(
    plan.bubbles.every((b) => {
      const kind = b.referenceSearch?.kind
      return !kind || (kind !== 'kranz' && kind !== 'tischkranz')
    }),
    'Oktober+Liste: keine Kranz-Referenz',
  )
  assert(
    plan.bubbles.every((b) => !b.text || !/^referenz\b/i.test(b.text)),
    'Oktober+Liste: keine „Referenz X“-Caption',
  )
}

{
  const plan = planAnnaReplies(
    withMessages([
      kunde('Guten Morgen'),
      kunde('Könntest du noch einmal so einen Blumenhoop machen, wenn du magst?'),
      atelier('Hi'),
    ]),
    { entropy: 'greeting-only' },
  )
  const spoken = annaSpokenText(plan)
  assert(!/^hi!?\.?$/i.test(spoken.trim()), 'Begrüßung: nicht nur Hi')
  assert(!/k(ö|oe)nntest du den blumenhoop noch einmal machen/i.test(spoken), 'Begrüßung: keine Wiederholungsfrage')
  assert(
    /leite|orientierung|freundin/i.test(spoken) ||
      plan.bubbles.some((b) => b.kind === 'video' || Boolean(b.referenceSearch) || b.kind === 'image'),
    'Begrüßung: Medien nachreichen',
  )
  assert(!/bin da|erzähl gern|ich h(ö|oe)re/i.test(spoken), 'Begrüßung: keine Präsenz-Floskel')
  assert(!/genau der|genau so einen/i.test(spoken), 'Begrüßung: kein Bestätigungs-Dump')
}

{
  const plan = planAnnaReplies(
    withMessages([
      kunde('Hallo Damaris, hast du kurz Zeit?'),
      kunde('Hättest du Lust auf eine Girlande fürs Sideboard?'),
      atelier('Hallo'),
    ]),
    { entropy: 'girlande-hallo' },
  )
  const spoken = annaSpokenText(plan)
  assert(!/^hallo!?\.?$/i.test(spoken.trim()), 'Girlande-Hallo: nicht nur Hallo')
  assert(!/h(ä|ae)ttest du lust auf eine girlande/i.test(spoken), 'Girlande-Hallo: keine Wiederholungsfrage')
  assert(
    /referenzbild|orientierung/i.test(spoken) ||
      plan.bubbles.some((b) => Boolean(b.referenceSearch) || b.kind === 'image'),
    'Girlande-Hallo: Referenz nachreichen',
  )
}

{
  const plan = planAnnaReplies(
    withMessages([
      kunde('Hättest du noch einmal Zeit für so einen Blumenhoop wie bei meiner Freundin?'),
      atelier(
        'Leider habe ich derzeit nur Dekoartikel im Lager. Ich werde erst Donnerstag Goldringe einkaufen',
      ),
    ]),
    { entropy: 'goldring-donnerstag' },
  )
  const spoken = annaSpokenText(plan)
  assert(/donnerstag/i.test(spoken), 'Goldring-Do: nennt Donnerstag')
  assert(/goldring|warte|blumenhoop/i.test(spoken), 'Goldring-Do: wartet auf Ringe/Hoop')
  assert(!/etwas anderes|creme und etwas gr(ü|ue)n|locker gebunden/i.test(spoken), 'Goldring-Do: kein Sofort-Pivot')
}

{
  const plan = planAnnaReplies(
    withMessages([
      kunde('Hallo Damaris, hast du kurz Zeit?'),
      kunde('Hättest du noch einmal Zeit für so einen Blumenhoop wie bei meiner Freundin?'),
      atelier('Guten Morgen, Anna. Warte bitte einen kurzen Moment.'),
    ]),
    { entropy: 'hold-moment' },
  )
  const spoken = annaSpokenText(plan)
  assert(/warte|klar|alles gut|kein problem/i.test(spoken), 'Hold: bestätigt kurzes Warten')
  assert(!/meinst du ein foto/i.test(spoken), 'Hold: kein „Meinst du ein Foto“')
  assert(!/foto oder gr(ö|oe)sse/i.test(spoken), 'Hold: kein Foto-oder-Größe')
  assert(!/melde dich|bin da/i.test(spoken), 'Hold: keine Melde-dich-Floskel')
  assert(
    plan.bubbles.every((b) => b.kind === 'text' && !b.video && !b.image && !b.referenceSearch),
    'Hold: keine Medien',
  )
}

{
  const plan = planAnnaReplies(
    withMessages([
      kunde('Hallo Damaris, hast du kurz Zeit?'),
      atelier('Hi'),
    ]),
    { entropy: 'zeit-hi' },
  )
  const spoken = annaSpokenText(plan)
  assert(/h(ä|ae)ttest|br(ä|ae)uchte|k(ö|oe)nntest|noch einmal/i.test(spoken), 'Zeit+Hi: klare Bitte')
  assert(
    /blumenhoop|goldring|freundin|pampas|wandkranz|tuerkranz|türkranz|tischkranz|fenster|advent|gesteck|girlande|blickfang|augenweide|wunderfein|umarmung|traumt|strau/i.test(
      spoken,
    ),
    'Zeit+Hi: Anliegen erläutert',
  )
  assert(!/^zur orientierung schicke ich dir das/i.test(spoken.trim()), 'Zeit+Hi: nicht nur Caption')
}

{
  const plan = planAnnaReplies(
    withMessages([
      kunde('Hallo Damaris'),
      atelier('Hallo'),
    ]),
    { entropy: 'interrupt-opener' },
  )
  const spoken = annaSpokenText(plan)
  assert(
    /h(ä|ae)ttest|br(ä|ae)uchte|k(ö|oe)nntest|zeit f(ü|ue)r|noch einmal/i.test(spoken),
    'Opener-Abbruch: klare Bitte / Erläuterung',
  )
  assert(
    /blumenhoop|goldring|freundin|pampas|fenster|tuer|tür|gesteck|girlande|strau/i.test(spoken) ||
      plan.bubbles.some((b) => b.kind === 'video' || Boolean(b.referenceSearch) || b.kind === 'image'),
    'Opener-Abbruch: Anliegen nachholen',
  )
  assert(!/^hallo!?\.?$/i.test(spoken.trim()), 'Opener-Abbruch: nicht nur Hallo')
  assert(!/^guten morgen!?\.?$/i.test(spoken.trim()), 'Opener-Abbruch: nicht nur Gegengruß')
  assert(!/genau so einen|leite dir ein freies referenzbild/i.test(spoken), 'Opener-Abbruch: kein Bestätigungs-Dump')
  assert(
    !/^(so ein|dieser goldring hier|der hier mit)/i.test(spoken.trim()),
    'Opener-Abbruch: keine reine Deixis ohne Bitte',
  )
}

{
  const plan = planAnnaReplies(
    withMessages([
      kunde('Hallo Damaris'),
      atelier('Guten Morgen'),
      kunde('Guten Morgen!'),
      atelier('Was kann ich für dich tun?'),
    ]),
    { entropy: 'was-kann-ich' },
  )
  const spoken = annaSpokenText(plan)
  assert(!/meinst du den mit dem goldring/i.test(spoken), 'Was kann ich: keine Goldring-Rückfrage')
  assert(
    /blumenhoop|goldring|freundin|pampas|trocken|fenster|tuer|tür|gesteck|girlande|strau/i.test(
      spoken,
    ) || plan.bubbles.some((b) => b.kind === 'video' || Boolean(b.referenceSearch) || b.kind === 'image'),
    'Was kann ich: Anliegen oder Medien',
  )
}

if (process.exitCode) {
  console.error('\nannaBot tests failed')
  process.exit(1)
}
console.log('\nannaBot tests passed')
