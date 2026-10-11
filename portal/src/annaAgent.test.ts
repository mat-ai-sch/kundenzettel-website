import { emptyStructuredOrder } from './orderFromChat'
import { ANNA_CHAT_ID, ANNA_FACTS, planAnnaReplies } from './annaBot'
import { buildAnnaBelief } from './annaBelief'
import { deliberateAnna } from './annaAgent'
import { classifyAtelierSpeechAct } from './annaDialogRules'
import type { Conversation, Message } from './data'

function assert(condition: unknown, message: string) {
  if (!condition) {
    console.error(`FAIL  ${message}`)
    process.exitCode = 1
    return
  }
  console.log(`ok    ${message}`)
}

function emptyAnna(): Conversation {
  return {
    id: ANNA_CHAT_ID,
    kunde: ANNA_FACTS.fullName,
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

function msg(
  from: 'kunde' | 'atelier',
  text: string,
  extras: Partial<Message> = {},
): Message {
  return {
    id: Math.random().toString(36).slice(2, 8),
    from,
    kind: 'text',
    text,
    at: '18:00',
    status: 'read',
    ...extras,
  }
}

{
  const conv: Conversation = {
    ...emptyAnna(),
    messages: [
      msg('kunde', 'Hallo Damaris'),
      msg('kunde', 'Ich bräuchte einen Tischkranz, Mitte frei für eine Kerze.'),
      msg(
        'atelier',
        'Hallo Anna, danke für deine Nachricht. Kränze habe ich erst ab Oktober auf Lager.',
      ),
    ],
  }
  const belief = buildAnnaBelief(conv)
  assert(belief.wishedKind === 'tischkranz', 'Belief: Wunsch Tischkranz')
  assert(belief.canPursueWish === false, 'Belief: Tischkranz nicht verfolgbar')
  assert(
    belief.blocks.some((b) => b.family === 'kranz' && b.untilLabel === 'Oktober'),
    'Belief: Kranz bis Oktober gesperrt',
  )
  const decision = deliberateAnna(belief, 't1')
  assert(decision.allowLegacy === false, 'Deliberation: kein Legacy/Medien')
  assert(/oktober/i.test(decision.lines.join(' ')), 'Deliberation: Oktober')
  assert(!/soll ich warten/i.test(decision.lines.join(' ')), 'Deliberation: kein Soll-ich-warten')

  const plan = planAnnaReplies(conv, { entropy: 'ex-okt' })
  assert(plan.bubbles.every((b) => !b.referenceSearch && b.kind !== 'image'), 'Plan: keine Referenz')
}

{
  const DAMARIS =
    'Hallo Anna, schön von dir zu hören. Wir starten mit den Kränzen erst ab Oktober. Derzeit habe ich einige schöne Dekoartikel oder ich kann dir aus Frischblumen etwas machen. Einen Strauß, ein Gesteck, eine Girlande oder auch Hoops.'
  const conv: Conversation = {
    ...emptyAnna(),
    messages: [
      msg('kunde', 'Hallo Damaris'),
      msg('kunde', 'Ich bräuchte einen Tischkranz, Mitte frei für eine Kerze.'),
      msg('atelier', DAMARIS),
    ],
  }
  const belief = buildAnnaBelief(conv)
  assert(belief.lastAct.type === 'unavailable_until', 'Liste-Belief: unavailable_until')
  assert(belief.lastAct.kind === 'kranz', 'Liste-Belief: gesperrt = kranz')
  assert(belief.offeredKinds.includes('gesteck'), 'Liste-Belief: Gesteck kumuliert')
  assert(belief.offeredKinds.includes('strauss'), 'Liste-Belief: Strauß kumuliert')
  assert(belief.alternativeOffered === true, 'Liste-Belief: alternativeOffered')

  const decision = deliberateAnna(belief, 'list1')
  const spoken = decision.lines.join(' ')
  assert(/oktober/i.test(spoken), 'Liste-Delib: Oktober')
  assert(/gesteck|tischgesteck/i.test(spoken), 'Liste-Delib: wählt Gesteck')
  assert(/verstehe|alles klar|freue|nehme/i.test(spoken), 'Liste-Delib: ausformuliert')
  assert(!/was k[oö]nntest du mir jetzt sonst/i.test(spoken), 'Liste-Delib: keine Rückfrage')
  assert(!/^referenz\b/i.test(spoken), 'Liste-Delib: kein Platzhalter')
  assert(decision.referenceKind === 'gesteck' || decision.referenceKind === undefined, 'Liste-Delib: Referenz nur Gesteck oder keine')
  assert(decision.referenceKind !== 'kranz' && decision.referenceKind !== 'tischkranz', 'Liste-Delib: keine Kranz-Referenz')

  const plan = planAnnaReplies(conv, { entropy: 'ex-list' })
  const planText = plan.bubbles.map((b) => b.text ?? '').join(' ')
  assert(/gesteck|tischgesteck/i.test(planText), 'Liste-Plan: nennt Gesteck')
  assert(!/was k[oö]nntest du mir jetzt sonst/i.test(planText), 'Liste-Plan: keine Rückfrage')
  assert(
    plan.bubbles.every((b) => !b.text || !/^referenz\b/i.test(b.text)),
    'Liste-Plan: keine „Referenz X“-Caption',
  )
  assert(
    plan.bubbles.every((b) => {
      const kind = b.referenceSearch?.kind
      return !kind || (kind !== 'kranz' && kind !== 'tischkranz' && kind !== 'wandkranz')
    }),
    'Liste-Plan: keine Kranz-Referenzmedien',
  )
}

{
  // Multi-Turn: Sperre bleibt, auch wenn Atelier später nur „Was brauchst du?“ fragt
  const conv: Conversation = {
    ...emptyAnna(),
    messages: [
      msg('kunde', 'Ich bräuchte einen Tischkranz.'),
      msg('atelier', 'Kränze habe ich erst ab Oktober auf Lager.'),
      msg('kunde', 'Verstehe.'),
      msg('atelier', 'Was brauchst du?'),
    ],
  }
  const belief = buildAnnaBelief(conv)
  assert(belief.canPursueWish === false, 'Multi-Turn: Sperre bleibt aktiv')
  const plan = planAnnaReplies(conv, { entropy: 'ex-persist' })
  const spoken = plan.bubbles.map((b) => b.text ?? '').join(' ')
  assert(/oktober|alternative|sonst|warte/i.test(spoken), 'Multi-Turn: respektiert Sperre')
  assert(!plan.bubbles.some((b) => b.referenceSearch), 'Multi-Turn: keine Kranz-Referenz')
}

{
  // Multi-Turn mit Angebotsliste: auch nach Invite noch wählen, nicht nachfragen
  const DAMARIS =
    'Hallo Anna, schön von dir zu hören. Wir starten mit den Kränzen erst ab Oktober. Derzeit habe ich einige schöne Dekoartikel oder ich kann dir aus Frischblumen etwas machen. Einen Strauß, ein Gesteck, eine Girlande oder auch Hoops.'
  const conv: Conversation = {
    ...emptyAnna(),
    messages: [
      msg('kunde', 'Ich bräuchte einen Tischkranz, Mitte frei für eine Kerze.'),
      msg('atelier', DAMARIS),
      msg('kunde', 'Okay.'),
      msg('atelier', 'Was brauchst du?'),
    ],
  }
  const belief = buildAnnaBelief(conv)
  assert(belief.offeredKinds.includes('gesteck'), 'Multi-Liste: Angebote bleiben im Belief')
  const decision = deliberateAnna(belief, 'persist-list')
  const spoken = decision.lines.join(' ')
  assert(/gesteck|strau[sß]|girlande|hoop/i.test(spoken), 'Multi-Liste: wählt aus bekannter Liste')
  assert(!/was k[oö]nntest du mir jetzt sonst/i.test(spoken), 'Multi-Liste: keine Rückfrage')
}

{
  const conv: Conversation = {
    ...emptyAnna(),
    messages: [
      msg('kunde', 'Blumenhoop wie bei meiner Freundin'),
      msg('atelier', 'Hey Anna, klar doch. Was brauchst du?'),
    ],
  }
  const belief = buildAnnaBelief(conv)
  assert(belief.canPursueWish === true, 'Invite: Hoop verfolgbar')
  const decision = deliberateAnna(belief, 't2')
  assert(decision.allowLegacy === true, 'Invite: Legacy für Clip')
}

{
  // Anliegen schon genannt + Atelier-Begrüßung: kein Gegengruß, keine Wiederholungsfrage
  const conv: Conversation = {
    ...emptyAnna(),
    messages: [
      msg('kunde', 'Guten Morgen'),
      msg('kunde', 'Könntest du noch einmal so einen Blumenhoop machen, wenn du magst?'),
      msg('atelier', 'Hi'),
    ],
  }
  const belief = buildAnnaBelief(conv)
  assert(belief.lastAct.type === 'greeting', 'Greeting-Belief: greeting')
  assert(belief.hasStatedWish === true, 'Greeting-Belief: Anliegen schon genannt')
  const decision = deliberateAnna(belief, 'greet1')
  assert(decision.allowLegacy === true, 'Greeting: Legacy reicht Medien nach')
  assert(!decision.referenceKind, 'Greeting: keine Agent-Referenz')

  const plan = planAnnaReplies(conv, { entropy: 'ex-greet' })
  const spoken = plan.bubbles.map((b) => b.text ?? '').join(' ')
  assert(!/\b(hi|hallo|guten morgen)!?\.?\s*$/i.test(spoken.trim()) || /leite|orientierung|freundin/i.test(spoken), 'Greeting-Plan: kein reiner Gegengruß')
  assert(!/^hi!?\.?$/i.test(spoken.trim()), 'Greeting-Plan: nicht nur Hi')
  assert(!/k(ö|oe)nntest du den blumenhoop noch einmal machen/i.test(spoken), 'Greeting-Plan: keine Wiederholungsfrage')
  assert(
    /leite|orientierung|freundin/i.test(spoken) ||
      plan.bubbles.some((b) => b.kind === 'video' || b.referenceSearch || b.kind === 'image'),
    'Greeting-Plan: Medien nachreichen',
  )
  assert(!/bin da|ich h(ö|oe)re|erzähl gern/i.test(spoken), 'Greeting-Plan: keine Präsenz-Floskel')
  assert(!/genau der|genau so einen/i.test(spoken), 'Greeting-Plan: kein Bestätigungs-Dump')
}

{
  // Girlande schon genannt, Atelier nur „Hallo“ → Referenz nachreichen, nicht erneut fragen
  const conv: Conversation = {
    ...emptyAnna(),
    messages: [
      msg('kunde', 'Hallo Damaris, hast du kurz Zeit?'),
      msg('kunde', 'Hättest du Lust auf eine Girlande fürs Sideboard?'),
      msg('atelier', 'Hallo'),
    ],
  }
  const belief = buildAnnaBelief(conv)
  assert(belief.hasStatedWish === true, 'Girlande-Hallo: Anliegen genannt')
  assert(belief.wishedKind === 'girlande', 'Girlande-Hallo: Wunsch Girlande')
  const plan = planAnnaReplies(conv, { entropy: 'girlande-hallo' })
  const spoken = plan.bubbles.map((b) => b.text ?? '').join(' ')
  assert(!/^hallo!?\.?$/i.test(spoken.trim()), 'Girlande-Hallo: nicht nur Hallo')
  assert(!/h(ä|ae)ttest du lust auf eine girlande/i.test(spoken), 'Girlande-Hallo: keine Wiederholungsfrage')
  assert(
    /referenzbild|orientierung/i.test(spoken) ||
      plan.bubbles.some((b) => Boolean(b.referenceSearch) || b.kind === 'image'),
    'Girlande-Hallo: Referenz nachreichen',
  )
  assert(!/genau so einen/i.test(spoken), 'Girlande-Hallo: kein Bestätigungs-Dump')
}

{
  // „hast du kurz Zeit?“ allein ist kein Anliegen → nach Hi volle Bitte + Medien
  const conv: Conversation = {
    ...emptyAnna(),
    messages: [
      msg('kunde', 'Hallo Damaris, hast du kurz Zeit?'),
      msg('atelier', 'Hi'),
    ],
  }
  const belief = buildAnnaBelief(conv)
  assert(belief.hasStatedWish === false, 'Zeit-Frage: noch kein Anliegen')
  const plan = planAnnaReplies(conv, { entropy: 'zeit-hi' })
  const spoken = plan.bubbles.map((b) => b.text ?? '').join(' ')
  assert(
    /h(ä|ae)ttest|br(ä|ae)uchte|k(ö|oe)nntest|noch einmal|zeit f(ü|ue)r/i.test(spoken),
    'Zeit-Frage+Hi: klare Bitte',
  )
  assert(/blumenhoop|goldring|freundin|pampas|trocken|wandkranz|tuerkranz|türkranz|tischkranz|fenster|advent|gesteck|girlande|blickfang|augenweide|wunderfein|umarmung|traumt|strau/i.test(spoken), 'Zeit-Frage+Hi: erläutert Anliegen')
  assert(!/^zur orientierung/i.test(spoken.trim()), 'Zeit-Frage+Hi: nicht nur Medien-Übergabe')
  assert(
    plan.bubbles.some((b) => b.kind === 'video' || b.referenceSearch || b.kind === 'image') ||
      /leite|orientierung|freundin|referenz/i.test(spoken),
    'Zeit-Frage+Hi: Medien oder Übergabe',
  )
}

{
  // Opener unterbrochen: Anliegen nachholen (kein steckenbleiben im Gegengruß)
  const conv: Conversation = {
    ...emptyAnna(),
    messages: [
      msg('kunde', 'Hallo Damaris'),
      msg('atelier', 'Guten Morgen'),
    ],
  }
  const belief = buildAnnaBelief(conv)
  assert(belief.hasStatedWish === false, 'Interrupted: Anliegen noch nicht genannt')
  assert(belief.canPursueWish === true, 'Interrupted: Wunsch bleibt verfolgbar')
  const decision = deliberateAnna(belief, 'greet-cont')
  assert(decision.allowLegacy === true, 'Interrupted: Legacy holt Anliegen nach')
  const plan = planAnnaReplies(conv, { entropy: 'ex-greet-cont' })
  const spoken = plan.bubbles.map((b) => b.text ?? '').join(' ')
  assert(
    /h(ä|ae)ttest|br(ä|ae)uchte|k(ö|oe)nntest|zeit f(ü|ue)r|noch einmal/i.test(spoken),
    'Interrupted: klare Bitte / Erläuterung',
  )
  assert(
    /blumenhoop|goldring|freundin|pampas|trocken|fenster|tuer|tür|gesteck|girlande|strau/i.test(
      spoken,
    ) || plan.bubbles.some((b) => b.kind === 'video' || b.referenceSearch || b.kind === 'image'),
    'Interrupted: nennt Anliegen oder sendet Medien',
  )
  assert(!/^guten morgen!?\.?$/i.test(spoken.trim()), 'Interrupted: nicht nur Gegengruß')
  assert(!/^hallo!?\.?$/i.test(spoken.trim()), 'Interrupted: nicht nur Hallo')
  assert(!/genau so einen|leite dir ein freies referenzbild/i.test(spoken), 'Interrupted: kein Bestätigungs-Dump')
  assert(
    !/^(so ein|dieser goldring hier|der hier mit)/i.test(spoken.trim()),
    'Interrupted: keine reine Deixis ohne Bitte',
  )
}

{
  // „Was kann ich für dich tun?“ → Anliegen, keine Goldring-Rückfrage
  const conv: Conversation = {
    ...emptyAnna(),
    messages: [
      msg('kunde', 'Hallo Damaris'),
      msg('atelier', 'Guten Morgen'),
      msg('kunde', 'Guten Morgen!'),
      msg('atelier', 'Was kann ich für dich tun?'),
    ],
  }
  assert(buildAnnaBelief(conv).lastAct.type === 'invite', 'Invite-Belief: invite')
  const plan = planAnnaReplies(conv, { entropy: 'ex-invite' })
  const spoken = plan.bubbles.map((b) => b.text ?? '').join(' ')
  assert(!/meinst du den mit dem goldring/i.test(spoken), 'Invite: keine Goldring-Rückfrage')
  assert(
    /blumenhoop|goldring|freundin|pampas|trocken|fenster|tuer|tür|gesteck|girlande|strau/i.test(
      spoken,
    ) || plan.bubbles.some((b) => b.kind === 'video' || b.referenceSearch || b.kind === 'image'),
    'Invite: nennt Anliegen oder Medien',
  )
}

{
  // Frischware + Hoop erst Oktober → Strauß wählen, nicht nach Alternative fragen
  const FRISCH =
    'ich habe leider nur Frischware im Lager. Hoops sind erst im Oktober wieder lieferbar'
  const conv: Conversation = {
    ...emptyAnna(),
    messages: [
      msg('kunde', 'Hättest du noch einmal Zeit für so einen Blumenhoop wie bei meiner Freundin?'),
      msg('atelier', FRISCH),
    ],
  }
  const belief = buildAnnaBelief(conv)
  assert(belief.canPursueWish === false, 'Frisch+Okt: Hoop nicht verfolgbar')
  const decision = deliberateAnna(belief, 'frisch-okt')
  const spoken = decision.lines.join(' ')
  assert(/oktober|strau/i.test(spoken), 'Frisch+Okt: Oktober oder Strauß')
  assert(/strau/i.test(spoken), 'Frisch+Okt: wählt Strauß')
  assert(!/hast du jetzt eine alternative/i.test(spoken), 'Frisch+Okt: keine Rückfrage Alternative')
  assert(!/oder hast du jetzt etwas anderes/i.test(spoken), 'Frisch+Okt: keine erneute Alternativfrage')
  assert(decision.referenceKind === 'strauss' || decision.referenceKind === undefined, 'Frisch+Okt: Referenz Strauß oder keine')
}

{
  // Konkretes Strauß-Angebot nach Sperre → annehmen, nicht erneut nach Alternative fragen
  const conv: Conversation = {
    ...emptyAnna(),
    messages: [
      msg('kunde', 'Hättest du noch einmal Zeit für so einen Blumenhoop wie bei meiner Freundin?'),
      msg(
        'atelier',
        'ich habe leider nur Frischware im Lager. Hoops sind erst im Oktober wieder lieferbar',
      ),
      msg('kunde', 'Alles klar, erst ab Oktober. Den Blumenhoop halte ich bis dahin fest. Hast du jetzt eine Alternative auf Lager?'),
      msg('atelier', 'Ich kann dir einen schönen Herbststrauß machen'),
    ],
  }
  const belief = buildAnnaBelief(conv)
  assert(belief.lastAct.type === 'offer_other', 'Herbststrauß: offer_other')
  assert(belief.lastAct.kind === 'strauss', 'Herbststrauß: kind Strauß')
  const decision = deliberateAnna(belief, 'herbst-offer')
  const spoken = decision.lines.join(' ')
  assert(/strau/i.test(spoken), 'Herbststrauß: nimmt Strauß an')
  assert(!/hast du jetzt eine alternative|etwas anderes da/i.test(spoken), 'Herbststrauß: keine erneute Alternativfrage')
  assert(!/warte ich auf den blumenhoop/i.test(spoken), 'Herbststrauß: kein erneutes Warten-Statement als einzige Reaktion')
  const plan = planAnnaReplies(conv, { entropy: 'herbst-plan' })
  const planSpoken = plan.bubbles.map((b) => b.text ?? '').join(' ')
  assert(/strau/i.test(planSpoken), 'Herbststrauß-Plan: nennt Strauß')
  assert(
    plan.bubbles.some((b) => b.referenceSearch?.kind === 'strauss') || /referenz/i.test(planSpoken),
    'Herbststrauß-Plan: freies Referenzbild',
  )
}

{
  // Goldringe erst in ein paar Tagen → warten, keine weiteren Hoop-Clips
  const conv: Conversation = {
    ...emptyAnna(),
    messages: [
      msg('kunde', 'Könntest du noch einmal so einen Blumenhoop machen wie bei meiner Freundin?'),
      msg('kunde', 'Am liebsten ruhig, mit Goldring und Trockenblumen.'),
      msg(
        'atelier',
        'leider ist das derzeit nicht möglich. Ich kaufe erst in ein paar Tagen Goldringe ein',
      ),
    ],
  }
  const belief = buildAnnaBelief(conv)
  assert(belief.lastAct.type === 'unavailable_until', 'Goldring-bald: unavailable_until')
  assert(/paar tagen|bald/i.test(belief.lastAct.untilLabel ?? ''), 'Goldring-bald: relative Frist')
  assert(belief.canPursueWish === false, 'Goldring-bald: Hoop nicht verfolgbar')
  const plan = planAnnaReplies(conv, { entropy: 'gold-bald' })
  const spoken = plan.bubbles.map((b) => b.text ?? '').join(' ')
  assert(/warte|goldring/i.test(spoken), 'Goldring-bald: wartet auf Ringe')
  assert(!plan.bubbles.some((b) => b.video || b.referenceSearch), 'Goldring-bald: keine Hoop-Medien')
  assert(!/noch die andere|auf dem tisch|leite ich/i.test(spoken), 'Goldring-bald: kein Clip-Nachschub')
}

{
  // Goldringe erst Donnerstag → warten, nicht „etwas anderes / Creme Grün“
  const conv: Conversation = {
    ...emptyAnna(),
    messages: [
      msg('kunde', 'Hättest du noch einmal Zeit für so einen Blumenhoop wie bei meiner Freundin?'),
      msg(
        'atelier',
        'Leider habe ich derzeit nur Dekoartikel im Lager. Ich werde erst Donnerstag Goldringe einkaufen',
      ),
    ],
  }
  const belief = buildAnnaBelief(conv)
  assert(belief.lastAct.type === 'unavailable_until', 'Goldring-Do: unavailable_until')
  assert(belief.lastAct.untilLabel === 'Donnerstag', 'Goldring-Do: Belief Donnerstag')
  const decision = deliberateAnna(belief, 'gold-thu')
  const spoken = decision.lines.join(' ')
  assert(/donnerstag/i.test(spoken), 'Goldring-Do: nennt Donnerstag')
  assert(/goldring|warte|blumenhoop/i.test(spoken), 'Goldring-Do: wartet auf Ringe')
  assert(!/etwas anderes|creme und etwas gr(ü|ue)n|locker gebunden/i.test(spoken), 'Goldring-Do: kein Sofort-Pivot')
  const plan = planAnnaReplies(conv, { entropy: 'gold-thu-plan' })
  const planSpoken = plan.bubbles.map((b) => b.text ?? '').join(' ')
  assert(/donnerstag/i.test(planSpoken), 'Goldring-Do-Plan: Donnerstag')
  assert(!/creme und etwas gr(ü|ue)n|locker gebunden/i.test(planSpoken), 'Goldring-Do-Plan: kein Creme-Pivot')
}

{
  // Kranz abgelehnt + Frischware/Strauß → merkt sich den Kranz, nicht den Blumenhoop
  const conv: Conversation = {
    ...emptyAnna(),
    messages: [
      msg('kunde', 'So ungefähr stelle ich mir den Kranz vor.'),
      msg(
        'atelier',
        'Nein das ist nicht möglich. Ich habe alternativ noch Frischware. Soll ich dir einen Strauß fertigen?',
      ),
    ],
  }
  const belief = buildAnnaBelief(conv)
  assert(belief.deferredKind === 'kranz', 'Kranz-Pivot: deferredKind = kranz')
  assert(belief.wishedKind === 'strauss' || belief.lastAct.kind === 'strauss', 'Kranz-Pivot: Wunsch oder Angebot gesetzt')
  const decision = deliberateAnna(belief, 'kranz-pivot')
  const spoken = decision.lines.join(' ')
  assert(/strau/i.test(spoken), 'Kranz-Pivot: nimmt Strauß an')
  assert(/kranz/i.test(spoken), 'Kranz-Pivot: merkt sich den Kranz')
  assert(!/blumenhoop/i.test(spoken), 'Kranz-Pivot: kein Blumenhoop-Rücksprung')
}

{
  // Nach Hoop-Einstieg + Kranz-Ablehnung: trotzdem Kranz merken
  const conv: Conversation = {
    ...emptyAnna(),
    messages: [
      msg('kunde', 'Hättest du noch einmal Zeit für so einen Blumenhoop wie bei meiner Freundin?'),
      msg('atelier', 'Leider habe ich derzeit nur Dekoartikel im Lager.'),
      msg('kunde', 'So ungefähr stelle ich mir den Kranz vor.'),
      msg(
        'atelier',
        'Nein das ist nicht möglich. Ich habe alternativ noch Frischware. Soll ich dir einen Strauß fertigen?',
      ),
    ],
  }
  const belief = buildAnnaBelief(conv)
  assert(belief.deferredKind === 'kranz', 'Hoop→Kranz-Pivot: deferred = kranz')
  const spoken = deliberateAnna(belief, 'hoop-kranz-pivot').lines.join(' ')
  assert(/kranz/i.test(spoken), 'Hoop→Kranz-Pivot: merkt Kranz')
  assert(/strau/i.test(spoken), 'Hoop→Kranz-Pivot: nimmt Strauß')
  assert(!/blumenhoop/i.test(spoken), 'Hoop→Kranz-Pivot: kein Blumenhoop in Antwort')
}

{
  // Goldringe weg + Alternative: keine Fachbelehrung „ohne Goldring schwierig“
  const conv: Conversation = {
    ...emptyAnna(),
    messages: [
      msg('kunde', 'Hättest du noch einmal Zeit für so einen Blumenhoop wie bei meiner Freundin?'),
      msg(
        'atelier',
        'Leider habe ich zur Zeit keine Goldringe im Lager. Kann ich mir etwas Anderem aushelfen?',
      ),
    ],
  }
  const belief = buildAnnaBelief(conv)
  assert(belief.lastAct.type === 'material', 'Goldring-Alt: material')
  assert(belief.lastAct.offersAlternative === true, 'Goldring-Alt: Alternative erkannt')
  const spoken = deliberateAnna(belief, 'gold-alt').lines.join(' ')
  assert(/gerne|klar|strau|andere|creme|rosa|zeig|anbieten|hättest/i.test(spoken), 'Goldring-Alt: nimmt Angebot an')
  assert(!/ohne goldring wird|hoop schwierig/i.test(spoken), 'Goldring-Alt: keine Fachbelehrung')
  assert(!/weiterverfolgen|nehme ich gern einen blumenhoop/i.test(spoken), 'Goldring-Alt: kein Selbstwiderspruch')
}

{
  // „keine Hoops fertigen“ + anderweitig: klar Alternative, nie Blumenhoop nochmal annehmen
  const conv: Conversation = {
    ...emptyAnna(),
    messages: [
      msg('kunde', 'Hättest du noch einmal Zeit für so einen Blumenhoop wie bei meiner Freundin?'),
      msg(
        'atelier',
        'Leider habe ich derzeit keine Goldringe auf Lager und kann keine Hoops fertigen. Kann ich dir anderweitig weiterhelfen?',
      ),
    ],
  }
  const belief = buildAnnaBelief(conv)
  assert(belief.canPursueWish === false, 'Keine-Hoops: Hoop nicht verfolgbar')
  assert(!belief.offeredKinds.includes('blumenhoop'), 'Keine-Hoops: Belief ohne Hoop-Angebot')
  const plan = planAnnaReplies(conv, { entropy: 'no-hoop-alt' })
  const spoken = plan.bubbles.map((b) => b.text ?? '').join(' ')
  assert(/strau|andere|creme|rosa|hättest|zeig|anbieten|gerne|klar/i.test(spoken), 'Keine-Hoops: klare Alternative')
  assert(!/nehme ich gern einen blumenhoop|weiterverfolgen/i.test(spoken), 'Keine-Hoops: kein Selbstwiderspruch')
  assert(!/\u2014/.test(spoken), 'Keine-Hoops: kein Gedankenstrich')
}

{
  // Nachfrage Eigenbestand: Mitbringen zusagen, nicht erneut nach Alternative fragen
  const conv: Conversation = {
    ...emptyAnna(),
    messages: [
      msg('kunde', 'Hättest du noch einmal Zeit für so einen Blumenhoop wie bei meiner Freundin?'),
      msg(
        'atelier',
        'Leider habe ich zur Zeit keine Goldringe im Lager. Kann ich mir etwas Anderem aushelfen?',
      ),
      msg('kunde', 'Verstehe. Was könntest du mir sonst gerade machen?'),
      msg('atelier', 'Hast du privat noch einen Goldring den ich verwerten kann?'),
    ],
  }
  const belief = buildAnnaBelief(conv)
  assert(belief.lastAct.type === 'material', 'Privat-Ring: material')
  assert(belief.lastAct.bringOwn === true, 'Privat-Ring: bringOwn')
  const decision = deliberateAnna(belief, 'privat-ring')
  const spoken = decision.lines.join(' ')
  assert(decision.reason === 'material-bring', 'Privat-Ring: material-bring')
  assert(/bringe|mitbring|zu hause|zuhause|habe noch/i.test(spoken), 'Privat-Ring: sagt Mitbringen zu')
  assert(!/schade wegen|sonst gerade machen|hoop schwierig/i.test(spoken), 'Privat-Ring: kein Ausweichen')
}

{
  // Bild unklar → Tischkranz in Worten beschreiben, nicht Produktwechsel
  const conv: Conversation = {
    ...emptyAnna(),
    messages: [
      msg('kunde', 'Hättest du Zeit für einen Tischkranz, Mitte frei für eine Kerze?'),
      msg(
        'atelier',
        'Auf dem Bild kann ich nicht eindeutig erkennen, was du dir wünschst. Bitte beschreib es doch in Worten',
      ),
    ],
  }
  const belief = buildAnnaBelief(conv)
  assert(belief.wishedKind === 'tischkranz', 'Tischkranz-Beschreibung: Wunsch bleibt')
  assert(belief.lastAct.type === 'preference_ask', 'Tischkranz-Beschreibung: preference_ask')
  const spoken = deliberateAnna(belief, 'tisch-desc').lines.join(' ')
  assert(/creme|rosa|weiss|weiß|gr(ü|ue)n|locker|kerze|handlich|farben/i.test(spoken), 'Tischkranz-Beschreibung: nennt Wünsche')
  assert(!/sonst gerade machen|etwas anderes/i.test(spoken), 'Tischkranz-Beschreibung: kein Alternativ-Pivot')
  assert(!/blumenhoop|halte ich|merke ich mir|alles klar|zwischenzeitlich/i.test(spoken), 'Tischkranz-Beschreibung: kein Pivot-Echo')
}

{
  // Nach Strauß-Wahl: Optik-Frage beantworten, nicht „nehme ich“ wiederholen
  const conv: Conversation = {
    ...emptyAnna(),
    messages: [
      msg('kunde', 'Hättest du noch einmal Zeit für so einen Blumenhoop wie bei meiner Freundin?'),
      msg(
        'atelier',
        'Leider habe ich keine Goldringe auf Lager. Derzeit kann ich dir nur Kränze anbieten.',
      ),
      msg('kunde', 'Ja gerne. Ein Strauß mit ruhigen Farben wäre auch schön.'),
      msg('atelier', 'Möchtest du einen Kranz oder einen Strauß?'),
      msg('kunde', 'Ah okay, dann eher einen Strauß. Das ginge für mich auch.'),
      msg('atelier', 'wie darf der Strauß aussehen? Was stellst du dir vor?'),
    ],
  }
  const belief = buildAnnaBelief(conv)
  assert(belief.lastAct.type === 'preference_ask', 'Strauß-Optik: preference_ask')
  const spoken = deliberateAnna(belief, 'strauss-look').lines.join(' ')
  assert(/creme|rosa|weiss|weiß|gr(ü|ue)n|locker|farben|handlich|luftig/i.test(spoken), 'Strauß-Optik: beschreibt Vorstellung')
  assert(!/nehme ich\.?$/i.test(spoken.trim()) && !/^gerne, einen strauß nehme ich/i.test(spoken), 'Strauß-Optik: kein Annahme-Loop')
  assert(!/merke ich mir|halte ich bis|zwischenzeitlich/i.test(spoken), 'Strauß-Optik: kein Merken-Echo')
}

{
  // Pivot schon gesagt → Optik nur zum aktuellen Produkt
  const conv: Conversation = {
    ...emptyAnna(),
    messages: [
      msg('kunde', 'Hättest du noch einmal Zeit für so einen Blumenhoop wie bei meiner Freundin?'),
      msg(
        'atelier',
        'Kränze und Hoops erst ab Oktober. Derzeit Tischkranz oder Strauß.',
      ),
      msg(
        'kunde',
        'Alles klar. Den Blumenhoop merke ich mir bis später. Jetzt nehme ich gern einen Tischkranz.',
      ),
      msg('atelier', 'was stellst du dir vor?'),
    ],
  }
  const belief = buildAnnaBelief(conv)
  assert(belief.wishedKind === 'tischkranz', 'Pivot-Optik: aktueller Wunsch Tischkranz')
  assert(belief.deferredKind === 'blumenhoop', 'Pivot-Optik: Hoop deferred')
  assert(belief.offeredKinds.includes('tischkranz'), 'Pivot-Optik: Tischkranz war angeboten')
  assert(belief.canPursueWish === true, 'Pivot-Optik: angebotener Tischkranz verfolgbar')
  const spoken = deliberateAnna(belief, 'pivot-look').lines.join(' ')
  assert(/creme|rosa|kerze|locker|handlich|farben/i.test(spoken), 'Pivot-Optik: nur Vorstellung')
  assert(!/blumenhoop|merke ich mir|halte ich|zwischenzeitlich|alles klar|nehme ich gern/i.test(spoken), 'Pivot-Optik: kein Pivot-Echo')
}

{
  // Doppelfrage Optik + Preis: beides in einer flüssigen Antwort
  const conv: Conversation = {
    ...emptyAnna(),
    messages: [
      msg('kunde', 'Alles klar. Den Blumenhoop merke ich mir bis später. Jetzt nehme ich gern einen Tischkranz.'),
      msg('atelier', 'Wie darf der Tischkranz aussehen und was darf er kosten?'),
    ],
  }
  const belief = buildAnnaBelief(conv)
  assert(belief.lastAct.type === 'preference_ask', 'Doppelfrage: preference_ask')
  assert(belief.lastAct.alsoBudget === true, 'Doppelfrage: alsoBudget')
  const spoken = deliberateAnna(belief, 'dual-look-bud').lines.join(' ')
  assert(/creme|rosa|ruhig|locker|farben/i.test(spoken), 'Doppelfrage: nennt Optik')
  assert(/45|budget|preis|euro/i.test(spoken), 'Doppelfrage: nennt Preis')
  assert(/und/i.test(spoken), 'Doppelfrage: verbindet Optik und Preis flüssig')
  assert(!/mir schwebt/i.test(spoken), 'Doppelfrage: keine KI-Formel Mir schwebt')
  assert(!/\u2014|\u2013/.test(spoken), 'Doppelfrage: kein Gedankenstrich')
  assert(!/referenzbild|leite dir|schicke dir ein bild/i.test(spoken), 'Doppelfrage: keine Medien-Ablenkung')
}

{
  // Alltagssprache: Aussehen + ungefährer Preis
  const conv: Conversation = {
    ...emptyAnna(),
    messages: [
      msg('kunde', 'Ich hätte gern noch einmal so einen Blumenhoop.'),
      msg('atelier', 'Wie soll der aussehen und was darf er ungefähr kosten?'),
    ],
  }
  const belief = buildAnnaBelief(conv)
  assert(belief.lastAct.type === 'preference_ask', 'Alltags-Doppelfrage: preference_ask')
  assert(belief.lastAct.alsoBudget === true, 'Alltags-Doppelfrage: alsoBudget')
  const spoken = deliberateAnna(belief, 'nat-dual').lines.join(' ')
  assert(/goldring|pampas|ruhig|zurückhalt/i.test(spoken), 'Alltags-Doppelfrage: Optik')
  assert(/45|euro/i.test(spoken), 'Alltags-Doppelfrage: Preis')
  assert(!/mir schwebt|kurz gesagt|darüber hinaus/i.test(spoken), 'Alltags-Doppelfrage: kein KI-Ton')
}

{
  // Reine Preisvorstellung: kein Invite/Medien, klare Budget-Antwort
  const conv: Conversation = {
    ...emptyAnna(),
    messages: [
      msg('kunde', 'Jetzt nehme ich gern einen Tischkranz.'),
      msg('atelier', 'Was ist deine Preisvorstellung?'),
    ],
  }
  const belief = buildAnnaBelief(conv)
  assert(belief.lastAct.type === 'budget_ask', 'Preisvorstellung: budget_ask')
  const plan = planAnnaReplies(conv, { entropy: 'preis-only' })
  const spoken = plan.bubbles.map((b) => b.text ?? '').join(' ')
  assert(/45|euro|budget|preis/i.test(spoken), 'Preisvorstellung: nennt Budget')
  assert(!plan.bubbles.some((b) => b.referenceSearch || b.video || b.image), 'Preisvorstellung: keine Medien')
  assert(!/referenz|orientierung leite/i.test(spoken), 'Preisvorstellung: kein Referenz-Pivot')
}

{
  // Soft-Pause: „Warte bitte“ ist kein Weiterfragen und kein Foto/Goldring-Rätsel
  const conv: Conversation = {
    ...emptyAnna(),
    messages: [
      msg('kunde', 'Hättest du noch einmal Zeit für so einen Blumenhoop wie bei meiner Freundin?'),
      msg('atelier', 'Guten Morgen, Anna. Warte bitte einen kurzen Moment.'),
    ],
  }
  const belief = buildAnnaBelief(conv)
  assert(belief.lastAct.type === 'hold', 'Hold-Belief: hold')
  assert(belief.paused === true, 'Hold-Belief: paused')
  const decision = deliberateAnna(belief, 'hold1')
  assert(decision.allowLegacy === false, 'Hold: kein Legacy')
  assert(/warte|klar|alles gut|kein problem/i.test(decision.lines.join(' ')), 'Hold: bestätigt Pause')
  assert(!/foto|goldring|meinst du|melde dich|bin da/i.test(decision.lines.join(' ')), 'Hold: keine Rückfrage/Floskel')

  const plan = planAnnaReplies(conv, { entropy: 'ex-hold' })
  const spoken = plan.bubbles.map((b) => b.text ?? '').join(' ')
  assert(/warte|klar|alles gut|kein problem/i.test(spoken), 'Hold-Plan: Pause bestätigt')
  assert(!/meinst du ein foto|foto oder|goldring\?|melde dich/i.test(spoken), 'Hold-Plan: kein UNSURE_ASK')
  assert(
    plan.bubbles.every((b) => b.kind === 'text' && !b.video && !b.image && !b.referenceSearch),
    'Hold-Plan: keine Medien',
  )
}

{
  // Nach Pause: Resume setzt fort
  const conv: Conversation = {
    ...emptyAnna(),
    messages: [
      msg('kunde', 'Hättest du noch einmal Zeit für so einen Blumenhoop wie bei meiner Freundin?'),
      msg('atelier', 'Guten Morgen, Anna. Warte bitte einen kurzen Moment.'),
      msg('kunde', 'Alles klar, ich warte kurz.'),
      msg('atelier', 'So nun bin ich da.'),
    ],
  }
  const belief = buildAnnaBelief(conv)
  assert(belief.lastAct.type === 'resume', 'Resume-Belief: resume')
  assert(belief.paused === false, 'Resume-Belief: Pause vorbei')
}

{
  // Anlass-Frage: konkret antworten, kein Pivot-Echo; Anlass bleibt im Belief
  const FRISCH = 'Derzeit habe ich nur Frischware im Lager'
  const conv: Conversation = {
    ...emptyAnna(),
    messages: [
      msg('kunde', 'Könntest du noch einmal so einen Blumenhoop machen wie bei meiner Freundin?'),
      msg('atelier', FRISCH),
      msg(
        'kunde',
        'Verstehe. Wenn gerade keine Trockenblumen gehen, nehme ich gern einen Strauß. Wegen dem Blumenhoop komme ich ein anderes Mal auf dich zu.',
      ),
      msg('atelier', 'zu welchem Anlass soll der Strauß sein?'),
    ],
  }
  const belief = buildAnnaBelief(conv)
  assert(belief.lastAct.type === 'occasion_ask', 'Anlass-Belief: occasion_ask')
  assert(belief.wishedKind === 'strauss' || belief.wishedKind === 'bouquet', 'Anlass-Belief: Wunsch Strauß')
  assert(belief.deferredKind === 'blumenhoop', 'Anlass-Belief: Hoop deferred über Dialog')
  const plan = planAnnaReplies(conv, { entropy: 'ex-anlass' })
  const spoken = plan.bubbles.map((b) => b.text ?? '').join(' ')
  assert(
    /mitbring|verschenk|geschenk|freundin/i.test(spoken),
    'Anlass: nennt konkreten Anlass',
  )
  assert(!/halten wir bis später fest/i.test(spoken), 'Anlass: kein Protokoll-Pivot')
  assert(!/nehme ich gern einen strauß/i.test(spoken), 'Anlass: kein erneutes Annehmen')
  assert(!/trockenblumen gehen/i.test(spoken), 'Anlass: kein Frischware-Echo')
}

{
  // Anlass bleibt über weitere Turns im Belief und Auftrag
  const conv: Conversation = {
    ...emptyAnna(),
    messages: [
      msg('kunde', 'Als Mitbringsel zum Verschenken, nichts Großes.'),
      msg('atelier', 'Alles klar. Welche Farben darf er haben?'),
      msg('kunde', 'Eher ruhig in Creme und etwas Rosa.'),
    ],
  }
  const belief = buildAnnaBelief(conv)
  assert(belief.hasStatedOccasion === true, 'Anlass-Dauer: hasStatedOccasion')
  assert(/geschenk|mitbring/i.test(belief.occasion ?? ''), 'Anlass-Dauer: occasion gesetzt')
}

{
  // Goldene Ringe fehlen → kein Goldring-Bestätigungs-Loop
  const GOLD =
    'Derzeit habe ich keine goldenen Ringe mehr auf Lager. Sie sind weiterhin nicht lieferbar'
  const first: Conversation = {
    ...emptyAnna(),
    messages: [
      msg('kunde', 'Könntest du noch einmal so einen Blumenhoop machen wie bei meiner Freundin, mit dem Goldring?'),
      msg('atelier', GOLD),
    ],
  }
  assert(buildAnnaBelief(first).lastAct.type === 'material', 'Stuck-Gold: material')
  assert(buildAnnaBelief(first).goldRingMissing === true, 'Stuck-Gold: goldRingMissing')
  const plan1 = planAnnaReplies(first, { entropy: 'stuck-gold-1' })
  const spoken1 = plan1.bubbles.map((b) => b.text ?? '').join(' ')
  assert(!/weiterhin der blumenhoop mit dem goldring/i.test(spoken1), 'Stuck-Gold: kein Goldring-Echo')
  assert(
    /sonst|alternative|strau|ander|creme|rosa|gerade da/i.test(spoken1),
    'Stuck-Gold: fragt nach Alternative',
  )

  const second: Conversation = {
    ...emptyAnna(),
    messages: [
      msg('kunde', 'Könntest du noch einmal so einen Blumenhoop machen wie bei meiner Freundin, mit dem Goldring?'),
      msg('atelier', GOLD),
      msg('kunde', spoken1),
      msg('atelier', 'Ich kann dir etwas anderes anbieten'),
    ],
  }
  const plan2 = planAnnaReplies(second, { entropy: 'stuck-gold-2' })
  const spoken2 = plan2.bubbles.map((b) => b.text ?? '').join(' ')
  assert(!/weiterhin der blumenhoop mit dem goldring/i.test(spoken2), 'Stuck-Alt: kein Goldring-Echo')
  assert(fold(spoken2) !== fold(spoken1), 'Stuck-Alt: keine Wiederholung der Vorzeile')
  assert(
    /strau|gesteck|girlande|creme|rosa|nehme|gerne|ander/i.test(spoken2),
    'Stuck-Alt: nimmt Alternative an oder fragt konkret',
  )
}

{
  // Triple-Intent Ende-zu-Ende: Oktober + keine Goldringe + Optik/Preis
  const TRIPLE =
    'Hallo Anna, Kränze habe ich erst ab Oktober auf Lager. Leider habe ich derzeit auch keine Goldringe. Wie soll es aussehen und was darf es kosten?'
  const conv: Conversation = {
    ...emptyAnna(),
    messages: [
      msg('kunde', 'Hättest du noch einmal Zeit für so einen Blumenhoop wie bei meiner Freundin?'),
      msg('atelier', TRIPLE),
    ],
  }
  const belief = buildAnnaBelief(conv)
  assert(belief.lastAct.type === 'unavailable_until', 'Triple-E2E: unavailable_until')
  assert(belief.lastAct.alsoMaterial === true, 'Triple-E2E: alsoMaterial')
  assert(belief.lastAct.alsoPreference === true, 'Triple-E2E: alsoPreference')
  assert(belief.lastAct.alsoBudget === true, 'Triple-E2E: alsoBudget')
  assert(belief.goldRingMissing === true, 'Triple-E2E: goldRingMissing trotz unavailable_until')
  assert(belief.canPursueWish === false, 'Triple-E2E: Hoop nicht verfolgbar')
  const decision = deliberateAnna(belief, 'triple-e2e')
  const spoken = decision.lines.join(' ')
  assert(/oktober/i.test(spoken), 'Triple-E2E: nennt Oktober')
  assert(/goldring/i.test(spoken), 'Triple-E2E: nennt Goldring')
  assert(/45|euro/i.test(spoken), 'Triple-E2E: nennt Preis')
  assert(/creme|rosa|ruhig|locker|pampas|farben|goldring/i.test(spoken), 'Triple-E2E: Optik')
  assert(
    !/alternative auf lager|was k[oö]nntest du mir jetzt sonst|soll ich warten/i.test(spoken),
    'Triple-E2E: keine verbotene Rückfrage',
  )
  assert(decision.allowLegacy === false, 'Triple-E2E: kein Legacy')
}

{
  // Unav+Pref ohne Material: Optik mitbeantworten, nicht nur warten
  const conv: Conversation = {
    ...emptyAnna(),
    messages: [
      msg('kunde', 'Ich hätte gern einen Tischkranz.'),
      msg(
        'atelier',
        'Kränze habe ich erst ab Oktober. Derzeit kann ich dir einen Strauß machen. Was stellst du dir vor?',
      ),
    ],
  }
  const belief = buildAnnaBelief(conv)
  assert(belief.lastAct.type === 'unavailable_until', 'Unav+Pref: unavailable_until')
  assert(belief.lastAct.alsoPreference === true, 'Unav+Pref: alsoPreference')
  const spoken = deliberateAnna(belief, 'unav-pref').lines.join(' ')
  assert(/oktober/i.test(spoken), 'Unav+Pref: Oktober')
  assert(/strau/i.test(spoken), 'Unav+Pref: wählt Strauß')
  assert(/creme|rosa|ruhig|locker|farben/i.test(spoken), 'Unav+Pref: Optik')
}

{
  // Auswahl härten: nach Menüwahl kein zweiter Pivot bei neuem Angebot
  const menu =
    'Was darf es sein? Einen Strauß, ein Gesteck, eine Girlande oder einen Tischkranz?'
  const choice =
    'Dann nehme ich einen Tischkranz. Wegen dem Blumenhoop komme ich ein anderes Mal auf dich zu.'
  const afterChoice: Conversation = {
    ...emptyAnna(),
    messages: [
      msg('kunde', 'Hättest du noch einmal Zeit für so einen Blumenhoop?'),
      msg('atelier', menu),
      msg('kunde', choice),
      msg('atelier', 'Einen Strauß kann ich dir machen. Passt das?'),
    ],
  }
  const belief = buildAnnaBelief(afterChoice)
  assert(belief.acceptedKindByKunde === 'tischkranz', 'Menü-Härtung: accepted = Tischkranz')
  assert(belief.wishedKind === 'tischkranz', 'Menü-Härtung: Wunsch bleibt Tischkranz')
  assert(belief.deferredKind === 'blumenhoop', 'Menü-Härtung: Hoop deferred')
  const decision = deliberateAnna(belief, 'menu-stick')
  const spoken = decision.lines.join(' ')
  assert(decision.reason === 'offer-stick', 'Menü-Härtung: offer-stick')
  assert(/tischkranz/i.test(spoken), 'Menü-Härtung: bleibt beim Tischkranz')
  assert(!/dann eher einen strau|nehme ich jetzt gern einen strau/i.test(spoken), 'Menü-Härtung: kein Strauß-Pivot')
  assert(!/wegen dem blumenhoop/i.test(spoken), 'Menü-Härtung: kein erneutes Hoop-Deferral')

  const againMenu: Conversation = {
    ...emptyAnna(),
    messages: [
      msg('kunde', 'Hättest du noch einmal Zeit für so einen Blumenhoop?'),
      msg('atelier', menu),
      msg('kunde', choice),
      msg('atelier', menu),
    ],
  }
  const belief2 = buildAnnaBelief(againMenu)
  const decision2 = deliberateAnna(belief2, 'menu-again')
  assert(decision2.reason === 'invite-already-chosen', 'Menü-Härtung: invite-already-chosen')
  assert(
    /tischkranz|bleibe|weiterhin|genau|passt/i.test(decision2.lines.join(' ')),
    'Menü-Härtung: bestätigt bestehende Wahl',
  )
  assert(!/nehme ich (gern |gerne )?(einen |eine )?(gesteck|girlande)/i.test(decision2.lines.join(' ')), 'Menü-Härtung: kein neues „nehme ich“')
  assert(!/45|budget|preisvorstellung/i.test(decision2.lines.join(' ')), 'Menü-Härtung: kein Budget-Echo')

  const sameOffer: Conversation = {
    ...emptyAnna(),
    messages: [
      msg('kunde', 'Hättest du noch einmal Zeit für so einen Blumenhoop?'),
      msg('atelier', menu),
      msg('kunde', choice),
      msg('atelier', 'Einen Tischkranz kann ich dir machen.'),
    ],
  }
  const belief3 = buildAnnaBelief(sameOffer)
  const spoken3 = deliberateAnna(belief3, 'menu-confirm').lines.join(' ')
  assert(/tischkranz|bleibe|weiterhin|passt/i.test(spoken3), 'Menü-Härtung: bestätigt Wahl')
  assert(!/strau[sß]|dann eher/i.test(spoken3), 'Menü-Härtung: kein Produktwechsel')
}

{
  // Varianten-MVP Ende-zu-Ende
  const conv: Conversation = {
    ...emptyAnna(),
    messages: [
      msg('kunde', 'Alles klar. Den Blumenhoop merke ich mir bis später. Jetzt nehme ich gern einen Tischkranz.'),
      msg('atelier', 'Creme, Rosa oder eher kräftiger?'),
    ],
  }
  const belief = buildAnnaBelief(conv)
  assert(belief.lastAct.type === 'preference_ask', 'Variante-E2E: preference_ask')
  assert((belief.lastAct.variantOptions?.length ?? 0) >= 2, 'Variante-E2E: Optionen')
  const decision = deliberateAnna(belief, 'variant-e2e')
  assert(decision.reason === 'variant-choice', 'Variante-E2E: variant-choice')
  const spoken = decision.lines.join(' ')
  assert(/creme|rosa/i.test(spoken), 'Variante-E2E: wählt ruhige Farbe')
  assert(!/kräftig|kraeftig/i.test(spoken), 'Variante-E2E: nicht kräftig')

  const photos: Conversation = {
    ...emptyAnna(),
    messages: [
      msg('kunde', 'Ich hätte gern einen Strauß.'),
      msg('atelier', 'Ich schicke dir drei Fotos. Welches gefällt dir?'),
    ],
  }
  const spokenPhotos = deliberateAnna(buildAnnaBelief(photos), 'foto-var').lines.join(' ')
  assert(/foto 1|erste/i.test(spokenPhotos), 'Variante-E2E: wählt Foto 1')
}

{
  // Soft-Ack: voller Satz, Guardrail darf ihn nicht verwerfen
  const softConv: Conversation = {
    ...emptyAnna(),
    messages: [
      msg('kunde', 'Jetzt nehme ich gern einen Strauß.'),
      msg('atelier', 'Super, danke dir. Ich melde mich.'),
    ],
  }
  const softBelief = buildAnnaBelief(softConv)
  assert(softBelief.lastAct.type === 'other', 'Soft-Ack: other')
  assert(softBelief.acceptedKindByKunde === 'strauss', 'Soft-Ack: accepted Strauß')
  const softDec = deliberateAnna(softBelief, 'soft-thanks')
  assert(softDec.reason === 'soft-ack', 'Soft-Ack: reason soft-ack')
  assert(softDec.allowLegacy === false, 'Soft-Ack: kein Legacy')
  assert(
    softDec.lines.some((l) => l.split(/\s+/).length >= 4),
    'Soft-Ack: kein Ein-Wort-Fragment',
  )
  assert(!/was hättest du|sonst da|alternative/i.test(softDec.lines.join(' ')), 'Soft-Ack: keine Alternativfrage')

  const softPlan = planAnnaReplies(softConv, { entropy: 'soft-thanks' })
  const softSpoken = softPlan.bubbles.map((b) => b.text ?? '').join(' ')
  assert(/warte|rückmeldung|melde|dabei|strau/i.test(softSpoken), 'Soft-Ack-Plan: bestätigt/wartet')
  assert(!/was hättest du denn gerade sonst|goldring|blumenhoop/i.test(softSpoken), 'Soft-Ack-Plan: kein Fallback-Alt')
}

{
  // Terminfrage: nur Zeit antworten, kein Referenz-Anhang
  const termConv: Conversation = {
    ...emptyAnna(),
    messages: [
      msg('kunde', 'Ich hätte gern einen Strauß.'),
      msg('atelier', 'Passt Samstag zur Abholung?'),
    ],
  }
  const termPlan = planAnnaReplies(termConv, { entropy: 'term-sam' })
  const termSpoken = termPlan.bubbles.map((b) => b.text ?? '').join(' ')
  assert(/samstag|15|16|nachmittag|abhol/i.test(termSpoken), 'Termin: nennt Zeit/Tag')
  assert(
    !termPlan.bubbles.some((b) => b.referenceSearch || b.image),
    'Termin: keine Referenzmedien',
  )
  assert(!/in der richtung wäre der strau/i.test(termSpoken), 'Termin: keine Caption-Floskel')
}

{
  // Preisangebot vs. Soft-Ack
  const stretch: Conversation = {
    ...emptyAnna(),
    messages: [
      msg('kunde', 'Jetzt nehme ich gern einen Strauß.'),
      msg('atelier', 'Der Strauß würde 58 Euro kosten. Passt das?'),
    ],
  }
  const d58 = deliberateAnna(buildAnnaBelief(stretch), 'p58')
  assert(d58.reason === 'price-stretch' || /58|vertrau|handarbeit/i.test(d58.lines.join(' ')), 'Preis-58: stretch')
  assert(/58|vertrau|handarbeit|geht noch/i.test(d58.lines.join(' ')), 'Preis-58: nennt Preis/Vertrauen')

  const high: Conversation = {
    ...emptyAnna(),
    messages: [
      msg('kunde', 'Jetzt nehme ich gern einen Strauß.'),
      msg('atelier', 'Leider wären das 75 Euro.'),
    ],
  }
  const d75 = deliberateAnna(buildAnnaBelief(high), 'p75')
  assert(d75.reason === 'price-high', 'Preis-75: price-high')
  assert(/75|knapp|50/i.test(d75.lines.join(' ')), 'Preis-75: verhandelt')
  assert(!/bleibe ich dabei|behalte ich im kopf/i.test(d75.lines.join(' ')), 'Preis-75: kein Soft-Ack')
}

{
  // Menü „Was darf es sein?“ nach Wahl ≠ Budgetfrage
  const menu =
    'Was darf es sein? Einen Strauß, ein Gesteck oder eine Girlande?'
  const conv: Conversation = {
    ...emptyAnna(),
    messages: [
      msg('kunde', 'Jetzt nehme ich gern einen Strauß.'),
      msg('atelier', menu),
    ],
  }
  const belief = buildAnnaBelief(conv)
  assert(belief.lastAct.type !== 'budget_ask', 'Remenu: kein budget_ask')
  assert(belief.lastAct.type === 'invite', 'Remenu: invite')
  const d = deliberateAnna(belief, 'remenu')
  assert(d.reason === 'invite-already-chosen', 'Remenu: already-chosen')
  assert(/strau|dabei|genau|passt|weiterhin/i.test(d.lines.join(' ')), 'Remenu: bestätigt Strauß')
  assert(!/45|budget|gesteck nehme|girlande nehme/i.test(d.lines.join(' ')), 'Remenu: kein Budget/Neuwahl')
  const plan = planAnnaReplies(conv, { entropy: 'remenu-plan' })
  const spoken = plan.bubbles.map((b) => b.text ?? '').join(' ')
  assert(/strau|dabei|genau|passt/i.test(spoken), 'Remenu-Plan: bestätigt')
  assert(!/45 euro|preis denke/i.test(spoken), 'Remenu-Plan: kein Budget')
  assert(!plan.bubbles.some((b) => b.referenceSearch || b.image), 'Remenu-Plan: keine neuen Medien')
}

{
  // Zusatz Karte nach Wahl
  const conv: Conversation = {
    ...emptyAnna(),
    messages: [
      msg('kunde', 'Jetzt nehme ich gern einen Strauß.'),
      msg('atelier', 'Brauchst du noch etwas dazu, eine Karte vielleicht?'),
    ],
  }
  const d = deliberateAnna(buildAnnaBelief(conv), 'karte')
  assert(d.reason === 'addon-decline', 'Karte: addon-decline')
  assert(/karte|ohne|reicht/i.test(d.lines.join(' ')), 'Karte: lehnt Extra ab')
}

{
  // Donnerstag fertig ≠ Lagerengpass
  const act = classifyAtelierSpeechAct('Donnerstag fertig — geht das?')
  assert(act.type !== 'stock_limit', 'Fertig-Termin: kein stock_limit')
  const conv: Conversation = {
    ...emptyAnna(),
    messages: [
      msg('kunde', 'Jetzt nehme ich gern einen Strauß.'),
      msg('atelier', 'Donnerstag fertig — geht das?'),
    ],
  }
  const d = deliberateAnna(buildAnnaBelief(conv), 'don-fertig')
  assert(
    d.reason === 'termin-shift' || d.reason === 'termin-ok',
    'Fertig-Termin: termin-Antwort',
  )
  assert(/samstag|donnerstag|abhol|fertig/i.test(d.lines.join(' ')), 'Fertig-Termin: nennt Tag')
  assert(!/alternative|sonst da|lager/i.test(d.lines.join(' ')), 'Fertig-Termin: kein Lager-Pivot')
}

{
  // Zahlung
  const conv: Conversation = {
    ...emptyAnna(),
    messages: [
      msg('kunde', 'Jetzt nehme ich gern einen Strauß.'),
      msg('atelier', 'Bar oder Überweisung?'),
    ],
  }
  const d = deliberateAnna(buildAnnaBelief(conv), 'pay')
  assert(d.reason === 'payment', 'Zahlung: payment')
  assert(/bar|überweisung|ueberweisung/i.test(d.lines.join(' ')), 'Zahlung: nennt Art')
}

{
  // Pampas-Nachfrage
  const conv: Conversation = {
    ...emptyAnna(),
    messages: [
      msg('kunde', 'Jetzt nehme ich gern einen Strauß.'),
      msg('atelier', 'Mit etwas Pampas, einverstanden?'),
    ],
  }
  const d = deliberateAnna(buildAnnaBelief(conv), 'pampas')
  assert(d.reason === 'style-pampas', 'Pampas: style-pampas')
  assert(/pampas|sparsam|wenig|dezent/i.test(d.lines.join(' ')), 'Pampas: sparsam')
}

{
  // Farbe fehlt, Alternative angeboten
  const conv: Conversation = {
    ...emptyAnna(),
    messages: [
      msg('kunde', 'Jetzt nehme ich gern einen Strauß.'),
      msg('atelier', 'Rosa habe ich gerade nicht. Creme und Weiß ginge.'),
    ],
  }
  const d = deliberateAnna(buildAnnaBelief(conv), 'rosa-weg')
  assert(d.reason === 'color-sub', 'Farbe-Ersatz: color-sub')
  assert(/creme|weiss|weiß/i.test(d.lines.join(' ')), 'Farbe-Ersatz: nimmt Creme/Weiß')
  assert(!/bleibe ich dabei$/i.test(d.lines.join(' ').trim()), 'Farbe-Ersatz: kein reines Soft-Ack')
}

{
  // Nur Überweisung
  const conv: Conversation = {
    ...emptyAnna(),
    messages: [
      msg('kunde', 'Jetzt nehme ich gern einen Strauß.'),
      msg('atelier', 'Geht nur Überweisung, ok?'),
    ],
  }
  const d = deliberateAnna(buildAnnaBelief(conv), 'nur-ueber')
  assert(d.reason === 'payment-transfer', 'Nur-Überweisung: payment-transfer')
  assert(/überweisung|ueberweisung/i.test(d.lines.join(' ')), 'Nur-Überweisung: akzeptiert')
}

{
  const phone: Conversation = {
    ...emptyAnna(),
    messages: [
      msg('kunde', 'Jetzt nehme ich gern einen Strauß.'),
      msg('atelier', 'Kann ich dich kurz anrufen?'),
    ],
  }
  const d = deliberateAnna(buildAnnaBelief(phone), 'call')
  assert(d.reason === 'prefer-chat', 'Anruf: prefer-chat')
  assert(/whatsapp|chat|schreib/i.test(d.lines.join(' ')), 'Anruf: lieber Chat')
}

{
  const two: Conversation = {
    ...emptyAnna(),
    messages: [
      msg('kunde', 'Jetzt nehme ich gern einen Strauß.'),
      msg('atelier', 'Soll ich gleich zwei Sträuße machen?'),
    ],
  }
  const d = deliberateAnna(buildAnnaBelief(two), 'zwei')
  assert(d.reason === 'qty-one', 'Zwei: qty-one')
  assert(/reicht|nur|einen|eins/i.test(d.lines.join(' ')), 'Zwei: lehnt ab')
}

{
  const kraft: Conversation = {
    ...emptyAnna(),
    messages: [
      msg('kunde', 'Jetzt nehme ich gern einen Strauß.'),
      msg('atelier', 'Soll ich doch eher kräftiger binden?'),
    ],
  }
  const d = deliberateAnna(buildAnnaBelief(kraft), 'kraft')
  assert(d.reason === 'style-keep-quiet', 'Kräftiger: style-keep-quiet')
  assert(/ruhig|nicht zu|creme|zurückhalt/i.test(d.lines.join(' ')), 'Kräftiger: bleibt ruhig')
}

{
  const invoice: Conversation = {
    ...emptyAnna(),
    messages: [
      msg('kunde', 'Jetzt nehme ich gern einen Strauß.'),
      msg('atelier', 'Brauchst du eine Rechnung?'),
    ],
  }
  const d = deliberateAnna(buildAnnaBelief(invoice), 'inv')
  assert(d.reason === 'invoice', 'Rechnung: invoice')
  assert(/rechnung|beleg/i.test(d.lines.join(' ')), 'Rechnung: nennt Beleg')
}

{
  const again: Conversation = {
    ...emptyAnna(),
    messages: [
      msg('kunde', 'Jetzt nehme ich gern einen Strauß.'),
      msg('atelier', 'Der Strauß kostet 45 Euro.'),
      msg('kunde', 'Das passt gut für mich. Dann machen wir das so.'),
      msg('atelier', 'Also 45 Euro, abgemacht?'),
    ],
  }
  const d = deliberateAnna(buildAnnaBelief(again), 'abgem')
  assert(d.reason === 'price-confirm', 'Preis-nochmal: price-confirm')
  assert(/45|abgemacht|einig|passen/i.test(d.lines.join(' ')), 'Preis-nochmal: bestätigt')
  assert(!/besser, als ich dachte/i.test(d.lines.join(' ')), 'Preis-nochmal: kein Erst-Preis-Ton')
}

{
  const park: Conversation = {
    ...emptyAnna(),
    messages: [
      msg('kunde', 'Jetzt nehme ich gern einen Strauß.'),
      msg('atelier', 'Weißt du, wo du parken kannst bei uns?'),
    ],
  }
  const d = deliberateAnna(buildAnnaBelief(park), 'park')
  assert(d.reason === 'parking', 'Parken: parking')
  assert(/park|finken|viersen/i.test(d.lines.join(' ')), 'Parken: nennt Ort')
}

{
  const dep: Conversation = {
    ...emptyAnna(),
    messages: [
      msg('kunde', 'Jetzt nehme ich gern einen Strauß.'),
      msg('atelier', 'Wäre eine kleine Anzahlung okay, so 20 Euro?'),
    ],
  }
  const d = deliberateAnna(buildAnnaBelief(dep), 'dep')
  assert(d.reason === 'deposit-ok', 'Anzahlung: deposit-ok')
  assert(/anzahlung|20/i.test(d.lines.join(' ')), 'Anzahlung: nennt Betrag')
  assert(!/besser, als ich dachte/i.test(d.lines.join(' ')), 'Anzahlung: kein Preis-Ok-Ton')
}

{
  const own: Conversation = {
    ...emptyAnna(),
    messages: [
      msg('kunde', 'Jetzt nehme ich gern einen Strauß.'),
      msg('atelier', 'Möchtest du einen eigenen Rohling mitbringen, den ich belege?'),
    ],
  }
  const d = deliberateAnna(buildAnnaBelief(own), 'own')
  assert(d.reason === 'own-blank-decline', 'Eigen-Rohling: own-blank-decline')
  assert(/nein|nicht|atelier|bestand|eigen/i.test(d.lines.join(' ')), 'Eigen-Rohling: lehnt ab')
  assert(!/bringe ich mit|habe noch/i.test(d.lines.join(' ')), 'Eigen-Rohling: kein Mitbringen')
}

{
  const allergy: Conversation = {
    ...emptyAnna(),
    messages: [
      msg('kunde', 'Jetzt nehme ich gern einen Strauß.'),
      msg('atelier', 'Hast du Allergien gegen bestimmte Blumen oder Pollen?'),
    ],
  }
  const d = deliberateAnna(buildAnnaBelief(allergy), 'all')
  assert(d.reason === 'no-allergy', 'Allergie: no-allergy')
  assert(/keine|nein|unempfindlich|normal/i.test(d.lines.join(' ')), 'Allergie: verneint')
}

{
  const color: Conversation = {
    ...emptyAnna(),
    messages: [
      msg('kunde', 'Jetzt nehme ich gern einen Strauß.'),
      msg('atelier', 'Creme und etwas Rosa, ok?'),
      msg('kunde', 'Ja, Creme und Rosa passt.'),
      msg('atelier', 'Doch lieber ohne Rosa, nur Creme und Weiß — geht das?'),
    ],
  }
  const d = deliberateAnna(buildAnnaBelief(color), 'crev')
  assert(d.reason === 'color-revise', 'Farbkorrektur: color-revise')
  assert(/ohne rosa|creme und weiß|creme und weiss/i.test(d.lines.join(' ')), 'Farbkorrektur: ohne Rosa')
}

{
  const wrap: Conversation = {
    ...emptyAnna(),
    messages: [
      msg('kunde', 'Jetzt nehme ich gern einen Strauß.'),
      msg('atelier', 'Soll ich den Strauß noch schön einpacken als Geschenk?'),
    ],
  }
  const d = deliberateAnna(buildAnnaBelief(wrap), 'wrap')
  assert(d.reason === 'gift-wrap', 'Geschenk: gift-wrap')
  assert(/einpack|geschenk|mitbringsel/i.test(d.lines.join(' ')), 'Geschenk: will einpacken')
}

{
  const hours: Conversation = {
    ...emptyAnna(),
    messages: [
      msg('kunde', 'Jetzt nehme ich gern einen Strauß.'),
      msg('atelier', 'Unter der Woche bin ich Di–Fr 10–18 Uhr da. Passt dir das?'),
    ],
  }
  const d = deliberateAnna(buildAnnaBelief(hours), 'hrs')
  assert(d.reason === 'hours-weekend', 'Öffnung: hours-weekend')
  assert(/samstag|wochenende/i.test(d.lines.join(' ')), 'Öffnung: bevorzugt Samstag')
  assert(!/\u2013|\u2014/.test(d.lines.join('')), 'Öffnung: kein En/Em-Dash in Antwortzeilen')
}

{
  const voice: Conversation = {
    ...emptyAnna(),
    messages: [
      msg('kunde', 'Jetzt nehme ich gern einen Strauß.'),
      msg('atelier', 'Ich schick dir gleich eine Sprachnachricht, ok?'),
    ],
  }
  const d = deliberateAnna(buildAnnaBelief(voice), 'voi')
  assert(d.reason === 'voice-ok', 'Sprachnachricht: voice-ok')
}

{
  const candle: Conversation = {
    ...emptyAnna(),
    messages: [
      msg('kunde', 'Jetzt nehme ich gern einen Strauß.'),
      msg('atelier', 'Soll eine Kerze in die Mitte, oder lieber ohne?'),
    ],
  }
  const d = deliberateAnna(buildAnnaBelief(candle), 'cndl')
  assert(d.reason === 'candle-decline', 'Kerze: candle-decline')
  assert(/ohne|keine kerze/i.test(d.lines.join(' ')), 'Kerze: lehnt ab')
}

{
  const size: Conversation = {
    ...emptyAnna(),
    messages: [
      msg('kunde', 'Jetzt nehme ich gern einen Strauß.'),
      msg('atelier', 'Soll ich ihn doch etwas kleiner machen?'),
    ],
  }
  const d = deliberateAnna(buildAnnaBelief(size), 'sz')
  assert(d.reason === 'size-smaller', 'Größe: size-smaller')
}

{
  const tip: Conversation = {
    ...emptyAnna(),
    messages: [
      msg('kunde', 'Jetzt nehme ich gern einen Strauß.'),
      msg('atelier', 'Darf ich ein kleines Trinkgeld mitnehmen?'),
    ],
  }
  const d = deliberateAnna(buildAnnaBelief(tip), 'tip')
  assert(d.reason === 'tip-decline', 'Trinkgeld: tip-decline')
}

{
  const wait: Conversation = {
    ...emptyAnna(),
    messages: [
      msg('kunde', 'Jetzt nehme ich gern einen Strauß.'),
      msg('atelier', 'Soll ich dich für den nächsten Goldring auf die Warteliste setzen?'),
    ],
  }
  const d = deliberateAnna(buildAnnaBelief(wait), 'wl')
  assert(d.reason === 'waitlist-later', 'Warteliste: waitlist-later')
  assert(/strau|liste|vormerk/i.test(d.lines.join(' ')), 'Warteliste: Strauß jetzt')
}

{
  const name: Conversation = {
    ...emptyAnna(),
    messages: [
      msg('kunde', 'Jetzt nehme ich gern einen Strauß.'),
      msg('atelier', 'Hallo Marie, der Strauß ist fertig — passt Samstag?'),
    ],
  }
  const d = deliberateAnna(buildAnnaBelief(name), 'nm')
  assert(d.reason === 'name-correct', 'Name: name-correct')
  assert(/anna/i.test(d.lines.join(' ')), 'Name: korrigiert zu Anna')
}

{
  const tw: Conversation = {
    ...emptyAnna(),
    messages: [
      msg('kunde', 'Jetzt nehme ich gern einen Strauß.'),
      msg('atelier', 'Geht bei dir auch 14 Uhr statt 15–16?'),
    ],
  }
  const d = deliberateAnna(buildAnnaBelief(tw), 'tw')
  assert(d.reason === 'time-window-keep', 'Fenster: time-window-keep')
  assert(/15|16|lieber|knapp|eng/i.test(d.lines.join(' ')), 'Fenster: hält 15-16')
  assert(d.reason !== 'hours-weekend', 'Fenster: kein hours-weekend-False-Positive')
}

{
  const card: Conversation = {
    ...emptyAnna(),
    messages: [
      msg('kunde', 'Jetzt nehme ich gern einen Strauß.'),
      msg('atelier', 'Kartenzahlung geht auch, falls du kein Bargeld dabei hast — ok?'),
    ],
  }
  const d = deliberateAnna(buildAnnaBelief(card), 'card')
  assert(d.reason === 'payment-card', 'Karte zahlen: payment-card')
  assert(!/ohne karte oder schleife/i.test(d.lines.join(' ')), 'Karte zahlen: kein Addon-Decline')
}

{
  const delay: Conversation = {
    ...emptyAnna(),
    messages: [
      msg('kunde', 'Jetzt nehme ich gern einen Strauß.'),
      msg('atelier', 'Samstag fertig, passt?'),
      msg('kunde', 'Samstag passt gut.'),
      msg('atelier', 'Leider erst Sonntag fertig, Samstag schaffe ich es nicht. Geht das?'),
    ],
  }
  const d = deliberateAnna(buildAnnaBelief(delay), 'del')
  assert(d.reason === 'termin-sunday', 'Verzögerung: termin-sunday')
  assert(/sonntag/i.test(d.lines.join(' ')), 'Verzögerung: akzeptiert Sonntag')
}

if (process.exitCode) {
  console.error('\nannaAgent tests failed')
  process.exit(1)
}
console.log('\nannaAgent / belief tests passed')

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
