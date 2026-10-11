import {
  classifyAtelierSpeechAct,
  chooseOfferedAlternative,
  chooseVariantOption,
  detectBlockedKind,
  detectBringOwn,
  detectGoldRingRestockDay,
  extractOfferedKinds,
  isGreetingOnly,
  isMereContactOpener,
  isProductMentionBlocked,
  kundeMessageStatesWish,
  mayPursueProduct,
  foldDialog,
  replyForUnavailableUntil,
} from './annaDialogRules'

function assert(condition: unknown, message: string) {
  if (!condition) {
    console.error(`FAIL  ${message}`)
    process.exitCode = 1
    return
  }
  console.log(`ok    ${message}`)
}

const DAMARIS_OKTOBER_LIST =
  'Hallo Anna, schön von dir zu hören. Wir starten mit den Kränzen erst ab Oktober. Derzeit habe ich einige schöne Dekoartikel oder ich kann dir aus Frischblumen etwas machen. Einen Strauß, ein Gesteck, eine Girlande oder auch Hoops.'

{
  const folded = foldDialog(
    'Hallo Anna, danke für deine Nachricht. Kränze habe ich erst ab Oktober auf Lager.',
  )
  assert(isProductMentionBlocked(folded), 'Polarität: „erst ab … auf Lager“ blockiert')
  const act = classifyAtelierSpeechAct(
    'Hallo Anna, danke für deine Nachricht. Kränze habe ich erst ab Oktober auf Lager.',
  )
  assert(act.type === 'unavailable_until', 'Sprechakt: unavailable_until')
  assert(act.untilLabel === 'Oktober', 'Sprechakt: bis Oktober')
  assert(act.kind === 'kranz', 'Sprechakt: gesperrt ist Kranz-Familie')
  assert(mayPursueProduct('tischkranz', act) === false, 'Tischkranz nicht weiterverfolgen')
  assert(mayPursueProduct('strauss', act) === true, 'Strauß darf alternativ verfolgt werden')
}

{
  const act = classifyAtelierSpeechAct(
    'Hallo Anna, leider habe ich derzeit keine Goldringe auf Lager. Kann ich anderweitig etwas anbieten?',
  )
  assert(act.type === 'material' || act.type === 'unavailable_until' || act.type === 'stock_limit', 'Goldring-Lager: Constraint-Akt')
  assert(act.offersAlternative === true, 'Goldring-Lager: Alternative erkannt')
}

{
  const atelier =
    'Leider habe ich derzeit keine Goldringe auf Lager und kann keine Hoops fertigen. Kann ich dir anderweitig weiterhelfen?'
  assert(detectBlockedKind(atelier) === 'blumenhoop', 'Keine-Hoops: Sperre Blumenhoop')
  const offered = extractOfferedKinds(atelier, 'blumenhoop')
  assert(!offered.includes('blumenhoop'), 'Keine-Hoops: Hoop kein Angebot')
  assert(offered.includes('strauss') || offered.length === 0, 'Keine-Hoops: kein Schein-Angebot Hoop')
  assert(chooseOfferedAlternative('blumenhoop', ['blumenhoop', 'strauss']) === 'strauss', 'Keine-Hoops: wählt Strauß nicht Hoop')
  assert(chooseOfferedAlternative('blumenhoop', ['blumenhoop']) === undefined, 'Keine-Hoops: kein Selbst-Pivot')
}

{
  const act = classifyAtelierSpeechAct('Zur Zeit mache ich nur Wandkränze — geht das für dich?')
  assert(act.type === 'offer_other', 'Positives Angebot: offer_other')
  assert(act.kind === 'wandkranz', 'Positives Angebot: Wandkranz')
}

{
  const act = classifyAtelierSpeechAct('Hey Anna, klar doch. Was brauchst du?')
  assert(act.type === 'invite', 'Einladung: invite')
  assert(
    classifyAtelierSpeechAct('Was kann ich für dich tun?').type === 'invite',
    'Einladung: Was kann ich für dich tun?',
  )
}

{
  const act = classifyAtelierSpeechAct('Guten Morgen Anna')
  assert(act.type === 'greeting', 'Begrüßung: greeting')
  assert(classifyAtelierSpeechAct('Hallo').type === 'greeting', 'Begrüßung: Hallo allein')
  assert(
    classifyAtelierSpeechAct('Guten Morgen Anna, Kränze habe ich erst ab Oktober.').type !==
      'greeting',
    'Begrüßung: nicht wenn Inhalt folgt',
  )
}

{
  const hold = classifyAtelierSpeechAct(
    'Guten Morgen, Anna. Warte bitte einen kurzen Moment.',
  )
  assert(hold.type === 'hold', 'Hold: Warte bitte einen Moment')
  assert(
    classifyAtelierSpeechAct('Moment bitte.').type === 'hold',
    'Hold: Moment bitte',
  )
  assert(
    classifyAtelierSpeechAct('So nun bin ich da.').type === 'resume',
    'Resume: nun bin ich da',
  )
  assert(
    classifyAtelierSpeechAct('Kränze habe ich erst ab Oktober auf Lager.').type !== 'hold',
    'Hold: nicht bei Oktober-Sperre',
  )
}

{
  assert(detectBlockedKind(DAMARIS_OKTOBER_LIST) === 'kranz', 'Liste: Sperre = kranz (nicht Gesteck)')
  const offered = extractOfferedKinds(DAMARIS_OKTOBER_LIST, 'kranz')
  assert(offered.includes('strauss'), 'Liste: Strauß erkannt')
  assert(offered.includes('gesteck'), 'Liste: Gesteck erkannt')
  assert(offered.includes('girlande'), 'Liste: Girlande erkannt')
  assert(offered.includes('blumenhoop'), 'Liste: Hoops erkannt')
  assert(!offered.includes('kranz'), 'Liste: Kranz nicht als Angebot')
  assert(!offered.includes('tischkranz'), 'Liste: Tischkranz nicht als Angebot')

  const act = classifyAtelierSpeechAct(DAMARIS_OKTOBER_LIST)
  assert(act.type === 'unavailable_until', 'Liste: unavailable_until')
  assert(act.untilLabel === 'Oktober', 'Liste: bis Oktober')
  assert(act.kind === 'kranz', 'Liste: kind = kranz (nicht Gesteck aus der Liste)')
  assert(act.offersAlternative === true, 'Liste: offersAlternative')
  assert(act.offeredKinds.includes('gesteck'), 'Liste: offeredKinds enthält Gesteck')
  assert(act.offeredKinds.includes('strauss'), 'Liste: offeredKinds enthält Strauß')
  assert(act.offeredKinds.includes('girlande'), 'Liste: offeredKinds enthält Girlande')
  assert(act.offeredKinds.includes('blumenhoop'), 'Liste: offeredKinds enthält Hoop')

  const chosen = chooseOfferedAlternative('tischkranz', act.offeredKinds)
  assert(chosen === 'gesteck', 'Tischkranz → wählt Gesteck aus der Liste')

  const lines = replyForUnavailableUntil(
    act,
    'tischkranz',
    'test|damaris',
    (items) => items[0],
    DAMARIS_OKTOBER_LIST,
  )
  const spoken = lines.join(' ')
  assert(/oktober/i.test(spoken), 'Antwort: nennt Oktober')
  assert(/gesteck|tischgesteck/i.test(spoken), 'Antwort: wählt Gesteck')
  assert(/verstehe|alles klar|merke/i.test(spoken), 'Antwort: ausformuliert')
  assert(spoken.split(/[.!?]/).filter((s) => s.trim().length > 12).length >= 2, 'Antwort: mehrere volle Sätze')
  assert(!/was k[oö]nntest du mir jetzt sonst/i.test(spoken), 'Antwort: keine Rückfrage „sonst machen“')
  assert(!/was hast du gerade da/i.test(spoken), 'Antwort: keine Rückfrage „gerade da“')
  assert(!/hast du jetzt eine alternative/i.test(spoken), 'Antwort: keine Rückfrage Alternative')
}

{
  // Explizit „Derzeit Tischkranz“ = Angebot, trotz Kranz-Sperre; Hoop in Sperrsatz ≠ Angebot
  const atelier = 'Kränze und Hoops erst ab Oktober. Derzeit Tischkranz oder Strauß.'
  assert(detectBlockedKind(atelier) === 'kranz', 'Derzeit-Tischkranz: Sperre = kranz')
  const offered = extractOfferedKinds(atelier, 'kranz')
  assert(offered.includes('tischkranz'), 'Derzeit-Tischkranz: Tischkranz als Angebot')
  assert(offered.includes('strauss'), 'Derzeit-Tischkranz: Strauß als Angebot')
  assert(!offered.includes('blumenhoop'), 'Derzeit-Tischkranz: Hoop nicht aus Sperrsatz')
  assert(!offered.includes('kranz'), 'Derzeit-Tischkranz: generischer Kranz kein Angebot')
}

{
  const atelier =
    'Hallo Anna, danke für deine Anfrage. Leider beginnt die Kranzsaison erst im Oktober. Derzeit habe ich noch einige spannende Dekoartikel oder ich kann dir einen Loop mit Trockenblumen machen. Zudem fahre ich Donnerstag in den Einkauf und werde Frischware erhalten. Einen schönen Blumenstrauß könnte ich dir dann auch fertigen'
  const act = classifyAtelierSpeechAct(atelier)
  assert(act.type === 'unavailable_until', 'Türkranz-Fall: unavailable_until')
  assert(act.kind === 'kranz', 'Türkranz-Fall: Sperre = kranz')
  assert(act.offeredKinds.includes('blumenhoop'), 'Türkranz-Fall: Loop → Blumenhoop')
  assert(act.offeredKinds.includes('strauss'), 'Türkranz-Fall: Strauß erkannt')
  const chosen = chooseOfferedAlternative('tuerkranz', act.offeredKinds)
  assert(chosen === 'blumenhoop', 'Türkranz-Fall: wählt Loop/Blumenhoop vor Strauß')
  const lines = replyForUnavailableUntil(act, 'tuerkranz', 'test|tuer', (items) => items[0], atelier)
  const spoken = lines.join(' ')
  assert(/blumenhoop|hoop/i.test(spoken), 'Türkranz-Fall: nennt Blumenhoop')
  assert(/oktober/i.test(spoken), 'Türkranz-Fall: Oktober')
  assert(/luftig|nicht zu [uü]ppig|creme|rosa/i.test(spoken), 'Türkranz-Fall: Stilwunsch')
  assert(!/^referenz/i.test(spoken), 'Türkranz-Fall: kein Platzhalter „Referenz“')
}

{
  const FRISCH =
    'ich habe leider nur Frischware im Lager. Hoops sind erst im Oktober wieder lieferbar'
  assert(detectBlockedKind(FRISCH) === 'blumenhoop', 'Frisch+Okt: Sperre = blumenhoop')
  const offered = extractOfferedKinds(FRISCH, 'blumenhoop')
  assert(offered.includes('strauss'), 'Frisch+Okt: Strauß aus Frischware')
  const act = classifyAtelierSpeechAct(FRISCH)
  assert(act.type === 'unavailable_until', 'Frisch+Okt: unavailable_until')
  assert(act.untilLabel === 'Oktober', 'Frisch+Okt: Oktober')
  assert(act.offeredKinds.includes('strauss'), 'Frisch+Okt: offeredKinds Strauß')
  const lines = replyForUnavailableUntil(act, 'blumenhoop', 'test|frisch', (items) => items[0], FRISCH)
  const spoken = lines.join(' ')
  assert(/strau/i.test(spoken), 'Frisch+Okt: Antwort wählt Strauß')
  assert(!/hast du jetzt eine alternative/i.test(spoken), 'Frisch+Okt: keine Alternativ-Rückfrage')
}

{
  const act = classifyAtelierSpeechAct('Ich kann dir einen schönen Herbststrauß machen')
  assert(act.type === 'offer_other', 'Herbststrauß: offer_other')
  assert(act.kind === 'strauss', 'Herbststrauß: kind = strauss')
}

{
  assert(isGreetingOnly(foldDialog('Hallo')) === true, 'Kontakt: Hallo = greeting only')
  assert(
    isMereContactOpener(foldDialog('Hallo Damaris, hast du kurz Zeit?')) === true,
    'Kontakt: kurz Zeit = mere opener',
  )
  assert(
    kundeMessageStatesWish(foldDialog('Hallo Damaris, hast du kurz Zeit?')) === false,
    'Kontakt: kurz Zeit ≠ Anliegen',
  )
  assert(
    kundeMessageStatesWish(
      foldDialog('Hättest du noch einmal Zeit für so einen Blumenhoop wie bei meiner Freundin?'),
    ) === true,
    'Kontakt: Blumenhoop-Bitte = Anliegen',
  )
}

{
  const atelier =
    'leider ist das derzeit nicht möglich. Ich kaufe erst in ein paar Tagen Goldringe ein'
  assert(
    detectGoldRingRestockDay(foldDialog(atelier)) === 'in ein paar Tagen',
    'Goldring-bald: relative Frist erkannt',
  )
  const act = classifyAtelierSpeechAct(atelier)
  assert(act.type === 'unavailable_until', 'Goldring-bald: unavailable_until')
  assert(act.kind === 'blumenhoop', 'Goldring-bald: Sperre Blumenhoop')
  assert(/warte|goldring/i.test(
    replyForUnavailableUntil(act, 'blumenhoop', 't|bald', (items) => items[0], atelier).join(' '),
  ), 'Goldring-bald: wartet')
}

{
  const GOLD_THU =
    'Leider habe ich derzeit nur Dekoartikel im Lager. Ich werde erst Donnerstag Goldringe einkaufen'
  assert(detectGoldRingRestockDay(foldDialog(GOLD_THU)) === 'Donnerstag', 'Goldring-Do: Restock-Tag')
  const act = classifyAtelierSpeechAct(GOLD_THU)
  assert(act.type === 'unavailable_until', 'Goldring-Do: unavailable_until')
  assert(act.untilLabel === 'Donnerstag', 'Goldring-Do: bis Donnerstag')
  assert(act.kind === 'blumenhoop', 'Goldring-Do: Sperre Blumenhoop')
  const lines = replyForUnavailableUntil(act, 'blumenhoop', 'test|goldthu', (items) => items[0], GOLD_THU)
  const spoken = lines.join(' ')
  assert(/donnerstag/i.test(spoken), 'Goldring-Do: nennt Donnerstag')
  assert(/goldring|blumenhoop|warte/i.test(spoken), 'Goldring-Do: wartet auf Ringe/Hoop')
  assert(!/etwas anderes|creme und etwas gr(ü|ue)n|locker gebunden/i.test(spoken), 'Goldring-Do: kein Sofort-Pivot')
}

{
  const PRIVAT =
    'Hast du privat noch einen Goldring den ich verwerten kann?'
  assert(detectBringOwn(foldDialog(PRIVAT)), 'Privat-Ring: detectBringOwn')
  const act = classifyAtelierSpeechAct(PRIVAT)
  assert(act.type === 'material', 'Privat-Ring: material')
  assert(act.bringOwn === true, 'Privat-Ring: bringOwn')
}

{
  const ALT =
    'Leider habe ich zur Zeit keine Goldringe im Lager. Kann ich mir etwas Anderem aushelfen?'
  const act = classifyAtelierSpeechAct(ALT)
  assert(act.type === 'material', 'Aushelfen: material')
  assert(act.offersAlternative === true, 'Aushelfen: offersAlternative')
}

{
  const DESCRIBE =
    'Auf dem Bild kann ich nicht eindeutig erkennen, was du dir wünschst. Bitte beschreib es doch in Worten'
  const act = classifyAtelierSpeechAct(DESCRIBE)
  assert(act.type === 'preference_ask', 'Bild unklar: preference_ask / Beschreibung')
}

{
  const LOOK =
    'wie darf der Strauß aussehen? Was stellst du dir vor?'
  const act = classifyAtelierSpeechAct(LOOK)
  assert(act.type === 'preference_ask', 'Optik-Frage: preference_ask')
  assert(!act.alsoBudget, 'Optik-Frage: kein Budget-Anhang')
}

{
  const DUAL =
    'Wie darf der Tischkranz aussehen und was darf er kosten?'
  const act = classifyAtelierSpeechAct(DUAL)
  assert(act.type === 'preference_ask', 'Doppelfrage: preference_ask')
  assert(act.alsoBudget === true, 'Doppelfrage: alsoBudget')
}

{
  assert(
    classifyAtelierSpeechAct('Was ist deine Preisvorstellung?').type === 'budget_ask',
    'Preisvorstellung: budget_ask',
  )
  assert(
    classifyAtelierSpeechAct('Was darf der kosten / Budget?').type === 'budget_ask',
    'Kosten/Budget: budget_ask',
  )
  assert(
    classifyAtelierSpeechAct('Was darf es sein? Einen Strauß oder ein Gesteck?').type !==
      'budget_ask',
    'Was-darf-es-sein: kein budget_ask',
  )
  assert(
    classifyAtelierSpeechAct('Was darf es sein? Einen Strauß oder ein Gesteck?').type ===
      'invite' ||
      (classifyAtelierSpeechAct('Was darf es sein? Einen Strauß oder ein Gesteck?').offeredKinds
        .length ?? 0) > 0,
    'Was-darf-es-sein: Menü/Einladung',
  )
  assert(
    classifyAtelierSpeechAct('Sag mir bitte wie viel der Kranz kosten darf.').type ===
      'budget_ask',
    'Marie-Muster Kostenfrage: budget_ask',
  )
  assert(
    classifyAtelierSpeechAct('Wie teuer darf er werden?').type === 'budget_ask',
    'Wie teuer: budget_ask',
  )
  assert(
    classifyAtelierSpeechAct('Was stellst du dir vor?').type === 'preference_ask',
    'Nur Vorstellung: preference_ask, kein Budget',
  )
  assert(
    !classifyAtelierSpeechAct('Was stellst du dir vor?').alsoBudget,
    'Nur Vorstellung: kein alsoBudget',
  )
}

{
  const CHOICE =
    'Ich würde dich bitte eine Entscheidung zu treffen. Möchtest du einen Kranz oder einen Strauß?'
  const act = classifyAtelierSpeechAct(CHOICE)
  assert(act.type === 'invite' || act.type === 'preference_ask', 'Kranz-oder-Strauß: Einladung/Wahl')
  assert(act.type !== 'offer_other', 'Kranz-oder-Strauß: kein offer_other')
}

{
  const act = classifyAtelierSpeechAct('zu welchem Anlass soll der Strauß sein?')
  assert(act.type === 'occasion_ask', 'Anlass-Frage: occasion_ask')
  assert(act.type !== 'offer_other', 'Anlass-Frage: kein offer_other trotz Strauß')
}

{
  const GOLD =
    'Derzeit habe ich keine goldenen Ringe mehr auf Lager. Sie sind weiterhin nicht lieferbar'
  const act = classifyAtelierSpeechAct(GOLD)
  assert(act.type === 'material', 'Goldene-Ringe: material')
  assert(act.type !== 'other', 'Goldene-Ringe: nicht other')
}

{
  const act = classifyAtelierSpeechAct('Ich kann dir etwas anderes anbieten')
  assert(act.type === 'offer_other', 'Etwas-anderes: offer_other')
  assert(act.offersAlternative === true, 'Etwas-anderes: offersAlternative')
}

{
  // Varianten-MVP: Farb-/Stilwahl innerhalb derselben Familie
  const color = classifyAtelierSpeechAct('Creme, Rosa oder eher kräftiger?')
  assert(color.type === 'preference_ask', 'Farbvariante: preference_ask')
  assert(
    (color.variantOptions?.length ?? 0) >= 2,
    'Farbvariante: optionen erkannt',
  )
  assert(
    color.variantOptions?.some((o) => /creme/i.test(o)),
    'Farbvariante: Creme',
  )
  assert(
    color.variantOptions?.some((o) => /kräftig|kraeftig/i.test(o)),
    'Farbvariante: kräftiger',
  )
  const chosenColor = chooseVariantOption(color.variantOptions ?? [])
  assert(chosenColor && /creme|rosa/i.test(chosenColor), 'Farbvariante: wählt ruhig')

  const numbered = classifyAtelierSpeechAct(
    'Variante 1, 2 oder 3 — welche soll es sein?',
  )
  assert(numbered.type === 'preference_ask', 'Nummernvariante: preference_ask')
  assert(
    numbered.variantOptions?.includes('Variante 1') &&
      numbered.variantOptions?.includes('Variante 2'),
    'Nummernvariante: 1 und 2',
  )
  assert(
    chooseVariantOption(numbered.variantOptions ?? []) === 'Variante 1',
    'Nummernvariante: wählt 1',
  )

  const photos = classifyAtelierSpeechAct(
    'Ich schicke dir drei Fotos. Welches gefällt dir?',
  )
  assert(photos.type === 'preference_ask', 'Fotovariante: preference_ask')
  assert(
    (photos.variantOptions?.length ?? 0) >= 3,
    'Fotovariante: drei Optionen',
  )

  const binary = classifyAtelierSpeechAct(
    'Willst du die luftige oder die üppigere Variante?',
  )
  assert(binary.type === 'preference_ask', 'Binärvariante: preference_ask')
  assert(
    binary.variantOptions?.some((o) => /luftig/i.test(o)),
    'Binärvariante: luftig',
  )
  assert(
    chooseVariantOption(binary.variantOptions ?? []) &&
      /luftig/i.test(chooseVariantOption(binary.variantOptions ?? [])!),
    'Binärvariante: wählt luftig',
  )
}

{
  // Triple-Intent: Sperre + Goldringe + Optik/Preis in einer Nachricht
  const TRIPLE =
    'Hallo Anna, Kränze habe ich erst ab Oktober auf Lager. Leider habe ich derzeit auch keine Goldringe. Wie soll es aussehen und was darf es kosten?'
  const act = classifyAtelierSpeechAct(TRIPLE)
  assert(act.type === 'unavailable_until', 'Triple: Primärakt unavailable_until')
  assert(act.untilLabel === 'Oktober', 'Triple: bis Oktober')
  assert(act.alsoMaterial === true, 'Triple: alsoMaterial')
  assert(act.alsoPreference === true, 'Triple: alsoPreference')
  assert(act.alsoBudget === true, 'Triple: alsoBudget')
  const spoken = replyForUnavailableUntil(
    act,
    'blumenhoop',
    'triple-rules',
    (items) => items[0],
    TRIPLE,
  ).join(' ')
  assert(/oktober/i.test(spoken), 'Triple-Antwort: nennt Oktober')
  assert(/goldring/i.test(spoken), 'Triple-Antwort: nennt Goldring')
  assert(/creme|rosa|ruhig|locker|goldring|pampas|farben/i.test(spoken), 'Triple-Antwort: Optik')
  assert(/45|euro|preis/i.test(spoken), 'Triple-Antwort: Preis')
  assert(
    !/hast du .+ alternative|was k[oö]nntest du mir jetzt sonst|alternative auf lager/i.test(spoken),
    'Triple-Antwort: keine Alternativ-Rückfrage',
  )
}

{
  // Kombi: Sperre + Liste + Optik (ohne Budget)
  const KOMBI =
    'Kränze erst ab Oktober. Derzeit Strauß, Gesteck oder Girlande. Was stellst du dir vor?'
  const act = classifyAtelierSpeechAct(KOMBI)
  assert(act.type === 'unavailable_until', 'Kombi: unavailable_until')
  assert(act.alsoPreference === true, 'Kombi: alsoPreference')
  assert(!act.alsoBudget, 'Kombi: kein alsoBudget')
  assert(act.offeredKinds.length >= 2, 'Kombi: Angebotsliste')
  const spoken = replyForUnavailableUntil(
    act,
    'tischkranz',
    'kombi-rules',
    (items) => items[0],
    KOMBI,
  ).join(' ')
  assert(/oktober/i.test(spoken), 'Kombi-Antwort: Oktober')
  assert(/gesteck|strau|girlande/i.test(spoken), 'Kombi-Antwort: wählt Alternative')
  assert(/creme|rosa|ruhig|locker|farben|kerze/i.test(spoken), 'Kombi-Antwort: Optik')
  assert(!/hast du .+ anderes|alternative auf lager/i.test(spoken), 'Kombi-Antwort: keine Rückfrage')
}

if (process.exitCode) {
  console.error('\nannaDialogRules tests failed')
  process.exit(1)
}
console.log('\nannaDialogRules tests passed')
