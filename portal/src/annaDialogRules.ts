/**
 * =============================================================================
 * ANNA — Dialog-Regelwerk / Metaprompt (verbindlich für planAnnaReplies)
 * =============================================================================
 *
 * Rolle
 * -----
 * Anna ist die KUNDIN. Sie will etwas kaufen (oder verbindlich vorbereiten).
 * Sie hat Zeit und Aufmerksamkeit für diesen Chat reserviert und kommt mit
 * einer Erwartungs-/Wunschhaltung — nicht als Moderatorin, die dem Atelier
 * die Entscheidung zurückspielt.
 *
 * Atelier-Nachricht zuerst als Sprechakt lesen
 * --------------------------------------------
 * Bevor Keywords wie Farbe, „noch einen“, Produktnamen Antworten auslösen,
 * wird die letzte Atelier-Nachricht klassifiziert. Ein Primärakt führt die
 * Priorität; Side-Signals (alsoMaterial / alsoPreference / alsoBudget /
 * alsoOccasion) tragen weitere Absichten derselben Nachricht mit, damit
 * Multi-Intent (z. B. Sperre + Goldring + Optik/Preis) nicht verloren geht.
 * Keyword-Addons (Farbe, Größe, …) dürfen danach nur ergänzen, wenn kein
 * Constraint-Akt aktiv ist.
 *
 * Priorität der Sprechakte (hoch → niedrig)
 * -----------------------------------------
 * 1. BOUNDARY          — Abbruch / später / keine Kapazität jetzt
 * 1b. GREETING         — reine Begrüßung (kein Ja zur Anfrage, keine Medien)
 * 1c. HOLD             — „Warte kurz / Moment bitte“ (soft pause, kein Abbruch)
 * 1d. RESUME           — „Nun bin ich da / wieder da“ (Pause beendet)
 * 2. UNAVAILABLE_UNTIL — Produktfamilie erst ab Datum/Monat wieder da
 * 3. MATERIAL          — Rohling/Material fehlt; optional Kunden-Mitbringen
 * 4. STOCK_LIMIT       — Farben/Ware knapp; Alternative und/oder Warten
 * 5. PREFERENCE_ASK    — Atelier fragt die Kundin nach Optik/Wünschen
 * 5b. BUDGET_ASK       — Preisvorstellung / was darf es kosten
 *     (Optik+Preis zusammen → preference_ask mit alsoBudget)
 * 6. OFFER_OTHER       — Atelier bietet positiv ein anderes Produkt an
 * 7. INVITE            — Was brauchst du / Zeit / Einladung zum Zeigen
 * 8. OTHER             — Rest
 *
 * Polarität (kritisch)
 * --------------------
 * Ein Produktwort in der Atelier-Nachricht ist KEIN Angebot, wenn es in
 * verneintem oder zeitlich gesperrtem Kontext steht:
 *   „Kränze habe ich erst ab Oktober auf Lager.“
 *   → UNAVAILABLE_UNTIL(kranz-Familie, Oktober), nicht OFFER_OTHER(Kranz).
 *   „keine Goldringe“ → MATERIAL, nicht Farbwunsch.
 *   „solltest du noch einen zu Hause haben“ → Mitbringen, nicht „ähnlich“.
 *
 * Kauferwartung (Antwort-Haltung)
 * -------------------------------
 * - Nie: „Soll ich warten?“ (Entscheidung zurück an Atelier).
 * - Nie: gesperrtes Produkt weiter bestellen / Referenz dazu schicken,
 *   als wäre es verfügbar.
 * - Bei UNAVAILABLE_UNTIL: Wunsch anerkennen + entweder bis Datum warten
 *   ODER eine vom Atelier genannte Alternative jetzt verbindlich wählen.
 *   Nie erneut fragen, was sonst möglich wäre, wenn die Liste schon da ist.
 * - Bei Angebot einer Alternative: annehmen und eigenen Wunsch nennen.
 * - Bei Mitbringen-Angebot: annehmen, wenn plausibel (Goldring zu Hause).
 *
 * Ton (natürliche WhatsApp-Kundin, Vorbild: Marie-Demo + echte Chatfragmente)
 * ---------------------------------------------------------------------------
 * Schreibe wie eine echte Kauferin tippt: ganze Sätze mit Subjekt und Verb,
 * warm und klar, ohne Marketing und ohne KI-Muster.
 *
 * Ja:
 * - Eine Idee pro Blase, oft 1–2 flüssige Sätze (Marie: „Ich brauche den Kranz
 *   bis Mittwoch und hatte mir einen Preis bis 65€ vorgestellt.“).
 * - Doppelfragen (Optik + Kosten) in EINEM Atemzug beantworten, nicht
 *   abgehackt in zwei Punchlines.
 * - Vertraute Füllwörter sparsam („schon“, „irgendwie“, „ganz“), wenn sie
 *   den Satz tragen.
 * - Punkt, Komma, Fragezeichen. Doppelpunkt nur selten („Zur Orientierung …“).
 *
 * Nein:
 * - Gedankenstrich (—) und Bis-Strich als Einschub; keine „X – Y“-Punchlines.
 * - Satzfragmente als alleinige Blase („Gut.“ / „Schön.“ / „Klar.“ /
 *   „Kein Video nötig.“).
 * - Literarische/KI-Formeln („Mir schwebt vor“, „kurz gesagt“, „darüber hinaus“,
 *   „nicht nur … sondern auch“, „spannend“, „einzigartig“).
 * - Mechanische Satzanfänge in Serie („Ah okay,“ / „Alles klar.“ / „Verstehe.“).
 * - Emojis, Ankündigungsfloskeln („Hier ist …“, „Anbei …“).
 *
 * =============================================================================
 */

import {
  detectAllFloristryKinds,
  detectFloristryProduct,
  isHoopKind,
  isKranzFamilyKind,
  labelForKind,
  type FloristryKind,
} from './floristryLexicon'

/** Kompakte Policy für optionalen LLM-Endpoint (VITE_ANNA_AGENT_ENDPOINT). */
export const ANNA_POLICY_FOR_LLM = `
Du bist Anna Hartmann, Kundin bei Damaris (Floristik-Atelier). WhatsApp, Duzen.
Du tippst wie eine echte Kauferin: ganze Sätze, warm, klar. Keine Moderatorin.

Verständnis:
1. Lies die Atelier-Nachricht als Sprechakt (Grenze, nicht verfügbar bis Datum, Material fehlt, Lager/Farben, Alternativangebot, Wunschfrage, Preisfrage, Einladung).
2. Polarität: Produktwort + Verneinung/„erst ab“ ist KEIN Angebot.
3. Doppelfragen (Aussehen + Kosten) immer als preference_ask mit beidem beantworten, nie nur einen Teil.
3b. Multi-Intent: Side-Signals (alsoMaterial/alsoPreference/alsoBudget/alsoOccasion) in derselben Antwort mitbeantworten.
4. Nie „Soll ich warten?“; entscheide als Kauferin (Alternative jetzt oder verbindlich bis Datum warten).
5. Genannte Alternativen (Strauß, Gesteck, Girlande, Hoop, …) auswählen und benennen; nie erneut fragen „Was könntest du sonst machen?“.
6. Nie gesperrtes Produkt weiter bestellen oder Referenz dazu schicken.
7. „Warte bitte / Moment“: kurz bestätigen und still bleiben; keine Medien, kein „ich bin da“.
8. Reine Begrüßung: knapp zurückgrüßen. „Nun bin ich da“ = Pause vorbei, dann Anliegen fortsetzen.

Ton (natürlich, nicht KI):
9. Ganze Sätze mit Subjekt und Verb. Vorbild: „Ich brauche den Kranz bis Mittwoch und hatte mir einen Preis bis 65€ vorgestellt.“
10. Optik und Preis in einem flüssigen Satz verbinden, wenn beides gefragt wurde.
11. Kein Gedankenstrich (—), keine Fragmente als alleinige Blase, keine Formeln wie „Mir schwebt vor“, „kurz gesagt“, „darüber hinaus“, „spannend“.
12. Keine Emojis, kein „Hier ist …“ / „Anbei …“.
13. Antworte mit 1–3 kurzen WhatsApp-Nachrichten als JSON: {"lines":["..."],"sendReference":false,"referenceKind":null}
`.trim()

export type AtelierSpeechActType =
  | 'boundary'
  | 'greeting'
  | 'hold'
  | 'resume'
  | 'unavailable_until'
  | 'material'
  | 'stock_limit'
  | 'preference_ask'
  | 'budget_ask'
  | 'occasion_ask'
  | 'offer_other'
  | 'invite'
  | 'other'

export type AtelierSpeechAct = {
  type: AtelierSpeechActType
  /** Gesperrte / zentrale Produktfamilie (bei unavailable = das Blockierte) */
  kind?: FloristryKind
  /** z. B. „Oktober“ */
  untilLabel?: string
  /** Konkret angebotene Alternativen in derselben Nachricht */
  offeredKinds: FloristryKind[]
  offersAlternative: boolean
  bringOwn: boolean
  freshContext: boolean
  /** Bei preference_ask: zusätzlich nach Budget/Preis gefragt (Doppelfrage) */
  alsoBudget?: boolean
  /**
   * Weitere Absichten in derselben Nachricht neben dem Primärakt
   * (Multi-Intent, z. B. Sperre + Optikfrage + Material).
   */
  alsoMaterial?: boolean
  alsoPreference?: boolean
  alsoOccasion?: boolean
  /** Stil-/Farb-/A–B–C-Optionen innerhalb derselben Produktfamilie */
  variantOptions?: string[]
}

const MONTHS: { pattern: RegExp; label: string }[] = [
  { pattern: /\bjanuar\b|\bjan\b/, label: 'Januar' },
  { pattern: /\bfebruar\b|\bfeb\b/, label: 'Februar' },
  { pattern: /\bmaerz\b|\bmarz\b|\bmärz\b/, label: 'März' },
  { pattern: /\bapril\b|\bapr\b/, label: 'April' },
  { pattern: /\bmai\b/, label: 'Mai' },
  { pattern: /\bjuni\b|\bjun\b/, label: 'Juni' },
  { pattern: /\bjuli\b|\bjul\b/, label: 'Juli' },
  { pattern: /\baugust\b|\baug\b/, label: 'August' },
  { pattern: /\bseptember\b|\bsept\b|\bsep\b/, label: 'September' },
  { pattern: /\boktober\b|\bokt\b/, label: 'Oktober' },
  { pattern: /\bnovember\b|\bnov\b/, label: 'November' },
  { pattern: /\bdezember\b|\bdez\b/, label: 'Dezember' },
]

export function foldDialog(value: string): string {
  return value
    .toLowerCase()
    .replace(/ß/g, 'ss')
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
}

export function isKranzFamily(kind: FloristryKind | undefined): boolean {
  return isKranzFamilyKind(kind)
}

/** Produktnennung steht in verneintem / gesperrtem Kontext. */
export function isProductMentionBlocked(folded: string): boolean {
  return (
    /erst ab /.test(folded) ||
    /erst im /.test(folded) ||
    /erst wieder/.test(folded) ||
    /nicht vor /.test(folded) ||
    /noch nicht/.test(folded) ||
    /leider (noch )?keine?/.test(folded) ||
    /habe ich (leider )?(derzeit |gerade |momentan )?(keine?|nicht)/.test(folded) ||
    /keine? .{0,24}(mehr )?(auf lager|vorr(ae|a)?tig)/.test(folded) ||
    /nicht (mehr )?(auf lager|vorr(ae|a)?tig)/.test(folded) ||
    /auf lager erst/.test(folded) ||
    /\berst\b.{0,20}auf lager/.test(folded) ||
    /starten mit .{0,40}erst ab/.test(folded) ||
    /kraenzsaison|kranzsaison/.test(folded) ||
    /gibt es (derzeit |gerade )?nicht/.test(folded) ||
    /sind (derzeit |gerade )?nicht/.test(folded)
  )
}

/**
 * Welche Produktfamilie ist zeitlich gesperrt?
 * Liest die Sperr-Klausel, nicht die Angebotsliste danach.
 */
export function detectBlockedKind(text: string): FloristryKind | undefined {
  const folded = foldDialog(text)
  const hoopClause = folded.match(
    /(?:blumenhoop|hoops?|loops?|goldringe?)[^.]{0,80}?(?:erst ab|erst im|nicht|keine|auf lager|fertig)/,
  )?.[0]
  const noHoopBefore = folded.match(
    /(?:keine|keinen|kein)\s+(?:blumen)?hoops?\b|(?:keine|keinen)\s+goldringe?\b|(?:kann|koennen|können)\s+keine\s+(?:blumen)?hoops?\b/,
  )?.[0]
  const clause =
    folded.match(
      /(?:starten mit|habe ich|gibt es|sind|beginnt).{0,48}?(wand|tisch|tuer|tur|fenster|advents)?kraenz(?:e|en|saison)?[^.]{0,60}?(?:erst ab|erst im|auf lager|nicht)/,
    )?.[0] ??
    folded.match(
      /(?:wand|tisch|tuer|tur|fenster|advents)?kraenz(?:e|en|saison)?[^.]{0,80}?(?:erst ab|erst im|auf lager)/,
    )?.[0] ??
    hoopClause ??
    noHoopBefore

  const scope = clause ?? ''
  if (!scope) return undefined
  if (/\btischkraenz|\btischkranz/.test(scope)) return 'tischkranz'
  if (/\bwandkraenz|\bwandkranz/.test(scope)) return 'wandkranz'
  if (/\btuerkraenz|\btuerkranz|\bturkraenz|\bturkranz|\btuerkrank/.test(scope)) {
    return 'tuerkranz'
  }
  if (/\bfensterkraenz|\bfensterkranz/.test(scope)) return 'fensterkranz'
  if (/\badventskraenz|\badventskranz/.test(scope)) return 'adventskranz'
  if (/\bkraenz|\bkranz/.test(scope)) return 'kranz'
  // Goldring/Hoop-Sperre: Negation darf vor oder nach dem Produktwort stehen
  if (
    hoopClause ||
    noHoopBefore ||
    (/\bblumenhoop|\bhoops?\b|\bloops?\b|\bgoldring/.test(scope) &&
      /erst ab|erst im|nicht|keine|auf lager|fertig/.test(scope))
  ) {
    return 'blumenhoop'
  }
  return undefined
}

function sameBlockFamily(blocked: FloristryKind | undefined, kind: FloristryKind): boolean {
  if (!blocked) return false
  if (blocked === kind) return true
  if (isKranzFamilyKind(blocked) && isKranzFamilyKind(kind)) return true
  if (isHoopKind(blocked) && isHoopKind(kind)) return true
  return false
}

/**
 * Produktarten, die explizit als jetzt verfügbar genannt sind
 * („Derzeit Tischkranz oder Strauß“), auch wenn dieselbe Familie gesperrt ist.
 */
function extractCurrentlyAvailableKinds(text: string): FloristryKind[] {
  const folded = foldDialog(text)
  const found: FloristryKind[] = []
  const seen = new Set<FloristryKind>()
  const pushFrom = (chunk: string) => {
    for (const k of detectAllFloristryKinds(chunk)) {
      if (k === 'katalog' || seen.has(k)) continue
      seen.add(k)
      found.push(k)
    }
  }
  for (const part of folded.split(/(?<=[.!?])\s+/)) {
    const trimmed = part.trim()
    if (/^(derzeit|momentan|aktuell|heute)\b/.test(trimmed)) {
      // „Derzeit keine Hoops“ = Sperre, nicht Angebot
      if (/^(derzeit|momentan|aktuell|heute)\s+(keine|keinen|kein|nicht)\b/.test(trimmed)) {
        continue
      }
      pushFrom(trimmed)
      continue
    }
    const afterNow = trimmed.match(
      /\b(derzeit|momentan|aktuell|jetzt)\b(?:\s+(?:habe ich|kann ich|biete ich))?\s+(.+)$/,
    )
    if (afterNow?.[2]) {
      const chunk = afterNow[2].trim()
      if (/^(keine|keinen|kein|nicht)\b/.test(chunk)) continue
      if (/erst ab|erst im|nicht auf lager|kann keine|keine hoops|keine goldring/.test(chunk)) {
        continue
      }
      pushFrom(chunk)
    }
  }
  return found
}

/** Arten nur in der Sperrklausel („… erst ab Oktober“ / „keine Hoops“), nicht als Angebot. */
function extractBlockedClauseKinds(text: string): FloristryKind[] {
  const folded = foldDialog(text)
  const clause =
    folded.match(
      /(?:starten mit|habe ich|gibt es|sind|beginnt).{0,48}?(wand|tisch|tuer|tur|fenster|advents)?kraenz(?:e|en|saison)?[^.]{0,60}?(?:erst ab|erst im|auf lager|nicht)/,
    )?.[0] ??
    folded.match(
      /(?:wand|tisch|tuer|tur|fenster|advents)?kraenz(?:e|en|saison)?[^.]{0,80}?(?:erst ab|erst im|auf lager)/,
    )?.[0] ??
    folded.match(
      /(?:blumenhoop|hoops?|loops?|goldringe?)[^.]{0,80}?(?:erst ab|erst im|nicht|keine|auf lager|fertig)/,
    )?.[0] ??
    folded.match(
      /(?:keine|keinen|kein)\s+(?:blumen)?hoops?\b|(?:kann|koennen|können)\s+keine\s+(?:blumen)?hoops?\b/,
    )?.[0]
  if (!clause) return []
  return detectAllFloristryKinds(clause).filter((k) => k !== 'katalog')
}

/**
 * Konkret angebotene Alternativen in der Nachricht (ohne die gesperrte Familie),
 * außer explizit „derzeit/jetzt“ angebotene Arten derselben Familie.
 */
export function extractOfferedKinds(
  text: string,
  blockedKind?: FloristryKind,
): FloristryKind[] {
  const folded = foldDialog(text)
  const all = detectAllFloristryKinds(text).filter((k) => k !== 'katalog')
  const currently = extractCurrentlyAvailableKinds(text)
  const inBlockedClause = new Set(extractBlockedClauseKinds(text))
  const offered = all.filter((k) => {
    if (currently.includes(k)) return true
    if (sameBlockFamily(blockedKind, k)) return false
    // „Kränze und Hoops erst ab Oktober“ → Hoop ist kein Angebot
    if (inBlockedClause.has(k)) return false
    return true
  })

  // Auch ohne Lexikon-Treffer: Frischware / Frischblumen → Strauß als Option
  // „Dekoartikel“ allein ist zu vage (kein Strauß-Ersatz).
  if (
    offered.length === 0 &&
    (/frischware|frischblumen|aus frisch|etwas machen/.test(folded) ||
      /anderweitig|etwas anbieten|etwas anderes/.test(folded))
  ) {
    return ['strauss']
  }

  // Frischware genannt, aber noch kein Strauß im Lexikon → ergänzen
  if (
    /frischware|frischblumen|aus frisch/.test(folded) &&
    !offered.includes('strauss') &&
    !offered.includes('bouquet') &&
    !sameBlockFamily(blockedKind, 'strauss')
  ) {
    return [...offered, 'strauss']
  }

  return offered
}

export function atelierOffersAlternative(
  folded: string,
  offeredKinds: readonly FloristryKind[] = [],
): boolean {
  if (offeredKinds.length > 0) return true
  return (
    /anderweitig/.test(folded) ||
    /etwas anbieten|etwas anderes|etwas anderem|was anderes|eine alternative|als alternative/.test(
      folded,
    ) ||
    /kann ich .{0,40}(anbieten|aushelfen|helfen)/.test(folded) ||
    /aushelfen|weiterhelfen/.test(folded) ||
    /andere (farbe|farben|richtung|produkte?|stuecke?|stucke)/.test(folded) ||
    /frischblumen|aus frisch|frischware/.test(folded) ||
    (/dekoartikel/.test(folded) &&
      /(kann|biete|oder|strau|gesteck|girlande|loop|hoop)/.test(folded)) ||
    /oder ich kann/.test(folded)
  )
}

const WEEKDAY_LABELS: { pattern: RegExp; label: string }[] = [
  { pattern: /\bmontag\b/, label: 'Montag' },
  { pattern: /\bdienstag\b/, label: 'Dienstag' },
  { pattern: /\bmittwoch\b/, label: 'Mittwoch' },
  { pattern: /\bdonnerstag\b/, label: 'Donnerstag' },
  { pattern: /\bfreitag\b/, label: 'Freitag' },
  { pattern: /\bsamstag\b/, label: 'Samstag' },
  { pattern: /\bsonntag\b/, label: 'Sonntag' },
]

/** Wochentag, an dem Material/Ware wieder da sein soll. */
export function extractWeekdayLabel(folded: string): string | undefined {
  for (const day of WEEKDAY_LABELS) {
    if (day.pattern.test(folded)) return day.label
  }
  return undefined
}

/**
 * Goldringe/Rohlinge erst später wieder da (Wochentag oder relative Angabe).
 * Beispiele: „erst Donnerstag Goldringe einkaufen“, „erst in ein paar Tagen“.
 */
export function detectGoldRingRestockDay(folded: string): string | undefined {
  if (!/goldring|rohling/.test(folded)) return undefined
  const restockIntent =
    /einkauf|einkaufen|nachschub|bestell|kriege|bekomm|liefer/.test(folded) ||
    /erst\s+(am\s+)?(montag|dienstag|mittwoch|donnerstag|freitag|samstag|sonntag)/.test(
      folded,
    ) ||
    /erst\s+in\b/.test(folded) ||
    /nicht (derzeit )?moeglich|nicht möglich/.test(folded)

  if (!restockIntent) return undefined

  const day = extractWeekdayLabel(folded)
  if (day) return day

  if (/in ein paar tagen/.test(folded)) return 'in ein paar Tagen'
  if (/in den naechsten tagen|in den nächsten tagen/.test(folded)) {
    return 'in den nächsten Tagen'
  }
  const numbered = folded.match(/\bin\s+(\d+)\s+tagen\b/)
  if (numbered?.[1]) return `in ${numbered[1]} Tagen`
  if (/naechste woche|nächste woche/.test(folded)) return 'nächste Woche'
  if (/bald/.test(folded)) return 'bald'
  // „kaufe … Goldringe ein“ ohne Zeitwort → trotzdem als Nachschub erkennen
  if (/einkauf|einkaufen/.test(folded)) return 'bald'
  return undefined
}

/** Kauferin wählt die beste angebotene Alternative zum Wunsch. */
export function chooseOfferedAlternative(
  wished: FloristryKind,
  offered: readonly FloristryKind[],
): FloristryKind | undefined {
  if (offered.length === 0) return undefined
  // Nie dasselbe / dieselbe Familie wie der gesperrte Wunsch
  const candidates = offered.filter((k) => {
    if (k === wished) return false
    if (isHoopKind(wished) && isHoopKind(k)) return false
    if (isKranzFamilyKind(wished) && isKranzFamilyKind(k)) return false
    return true
  })
  if (candidates.length === 0) return undefined
  const preference: FloristryKind[] = []
  if (wished === 'tischkranz' || wished === 'gesteck') {
    preference.push('gesteck', 'girlande', 'blumenhoop', 'strauss', 'bouquet', 'herz')
  } else if (isKranzFamilyKind(wished)) {
    preference.push('gesteck', 'girlande', 'blumenhoop', 'strauss', 'bouquet')
  } else if (isHoopKind(wished)) {
    preference.push(
      'tischkranz',
      'gesteck',
      'wandkranz',
      'girlande',
      'strauss',
      'bouquet',
      'tuerkranz',
    )
  } else {
    preference.push('strauss', 'gesteck', 'girlande', 'blumenhoop', 'bouquet')
  }
  for (const kind of preference) {
    if (candidates.includes(kind)) return kind
  }
  return candidates[0]
}

export function extractUntilLabel(folded: string): string | undefined {
  const ab = folded.match(
    /\b(?:erst\s+)?(?:ab|im)\s+(januar|februar|maerz|marz|april|mai|juni|juli|august|september|oktober|okt|november|dezember)\b/,
  )
  if (ab?.[1]) {
    const hit = MONTHS.find((m) => m.pattern.test(ab[1]!))
    if (hit) return hit.label
  }
  for (const month of MONTHS) {
    if (
      month.pattern.test(folded) &&
      (/erst|ab |bis |lager|vorrat|wieder|saison/.test(folded) || /nicht vor/.test(folded))
    ) {
      return month.label
    }
  }
  return undefined
}

function detectFreshContext(folded: string): boolean {
  return (
    /\bfrischware\b/.test(folded) ||
    /\bnur frisch\b/.test(folded) ||
    /\bmit frisch\b/.test(folded) ||
    /\bfrischblumen\b/.test(folded) ||
    /\bfrische blumen\b/.test(folded) ||
    /\beinzelwerkstueck/.test(folded) ||
    /keine trocken|kein trocken|ohne trocken/.test(folded)
  )
}

/** Frischware als einzige Option (nicht: Frischware plus Kränze/Menü). */
export function detectExclusiveFreshOnly(folded: string): boolean {
  if (!detectFreshContext(folded)) return false
  if (detectProductMenu(folded)) return false
  return (
    /\bnur frisch(ware|blumen)?\b/.test(folded) ||
    /keine trockenblumen|kein trockenblumen|ohne trockenblumen/.test(folded) ||
    /keine trockenfloristik|ohne trockenfloristik/.test(folded) ||
    /trockenblumen.{0,24}(nicht|keine)|nicht.{0,16}trockenblumen/.test(folded) ||
    (/frischware|frischblumen/.test(folded) &&
      /keine (hoops?|loops?|goldringe?|kraenz|kranz|kollektion)/.test(folded))
  )
}

/** Offenes Produktmenü: Kundin soll eine Variante wählen. */
export function detectProductMenu(folded: string): boolean {
  const asksChoice =
    /welches produkt/.test(folded) ||
    /was (moechtest|möchtest|willst) du (haben|nehmen|bestellen)/.test(folded) ||
    /was darf (es|das) (denn )?sein\b/.test(folded) ||
    /moechtest du eher|möchtest du eher|lieber den|lieber die|lieber das/.test(folded) ||
    /sag mir .{0,24}welches/.test(folded) ||
    /entscheid(e|ung).{0,24}(produkt|was)/.test(folded)
  const listsOptions =
    /(strau|girlande|gesteck|hoop|blumenhoop).{0,100}(strau|girlande|gesteck|hoop|kranz|tischkranz)/.test(
      folded,
    ) ||
    /(tischkranz|wand|tuer|kranz).{0,80}(strau|girlande|gesteck)/.test(folded) ||
    /moeglich sind|möglich sind/.test(folded) ||
    /alternativ kann ich/.test(folded) ||
    /dekoartikel/.test(folded)
  return asksChoice || (listsOptions && /oder|alternativ|,/.test(folded))
}

/** Atelier fragt nach Kundinnen-Eigenbestand (Ring/Rohling mitbringen). */
export function detectBringOwn(folded: string): boolean {
  // Optional „eigenen Rohling mitbringen?“ ohne Mangel → kein Bring-Own-Signal
  if (detectOptionalOwnMaterial(folded)) return false
  // Kind/Hund mitbringen ≠ Material (Achtung: „ring“ steckt in „mitbringen“)
  if (
    /(kind|baby|tochter|sohn|hund|partner|freundin)\b/.test(folded) &&
    /mitbring|bring .{0,12}mit/.test(folded) &&
    !/\bgoldring\b|\brohling\b|\beinen ring\b|\bgoldene?n? ring/.test(folded)
  ) {
    return false
  }
  return (
    /(bei dir|zuhause|zu hause|privat).{0,48}(haben|mitbring|bring|verwert)/.test(folded) ||
    /(hast|solltest|wenn) du.{0,48}(noch )?(einen |eine )?(gold)?ring\b/.test(folded) ||
    /(hast|solltest|wenn) du.{0,36}(noch )?(einen|einen ring|goldring).{0,40}(zuhause|zu hause|bei dir|privat|verwert)/.test(
      folded,
    ) ||
    /mitbring|bring .{0,16}mit|bringst .{0,12}mit|verwerten kann/.test(folded)
  )
}

/**
 * Atelier bietet optional an, dass die Kundin eigenen Rohling/Ring mitbringt —
 * ohne dass Material fehlt. Anna lehnt ab (Atelier liefert).
 */
export function detectOptionalOwnMaterial(folded: string): boolean {
  const asksOwn =
    /eigen(en|e|es)?\s+(rohling|ring|material|kranz|goldring)/.test(folded) ||
    /selbst .{0,16}mitbring/.test(folded) ||
    /eigenen .{0,20}mitbring/.test(folded)
  if (!asksOwn) return false
  const shortage =
    /keine? gold|nicht (mehr )?(da|vorr(ae|a)?tig|lieferbar)|fehlt|ausverkauft|nicht auf lager|kaum .{0,12}da/.test(
      folded,
    )
  if (shortage) return false
  // folded: möchtest→mochtest, wäre→ware (NFD), nicht moechtest/waere
  return (
    /mochtest du|moechtest du|willst du|soll ich|kannst du|ware |waere /.test(folded) ||
    /\?/.test(folded)
  )
}

function detectMaterialIssue(folded: string): boolean {
  const missingRing =
    /keine? goldringe?\b/.test(folded) ||
    /keine? goldene?n? ringe?\b/.test(folded) ||
    /goldringe?.{0,24}(nicht|keine|leer|alle|mehr)/.test(folded) ||
    /goldene?n? ringe?.{0,40}(nicht|keine|leer|alle|mehr|lager|liefer)/.test(folded) ||
    /nicht.{0,20}goldring/.test(folded) ||
    /keine goldringe im lager|keine goldringe zur zeit|zur zeit keine goldringe/.test(folded) ||
    (/nicht (mehr )?lieferbar/.test(folded) && /gold|ringe?\b/.test(folded))
  const pendingRingBuy =
    (/goldringe?.{0,48}(einkauf|einkaufen)/.test(folded) ||
      /(einkauf|einkaufen).{0,48}goldring/.test(folded) ||
      /goldene?n? ringe?.{0,48}(einkauf|einkaufen)/.test(folded)) &&
    /erst|bald|tagen|woche|nicht (derzeit )?moeglich|nicht möglich|nicht lieferbar/.test(folded)
  const missingRohling =
    /kein(en)? rohling/.test(folded) || /rohling.{0,20}(nicht|kein|fehlt)/.test(folded)
  const notInStock =
    /nicht (mehr )?vorr(ae|a)?tig/.test(folded) ||
    /kein(e)? vorrat/.test(folded) ||
    /nicht auf lager/.test(folded) ||
    (/im lager|auf lager/.test(folded) &&
      (/keine? goldringe?\b/.test(folded) || /keine? goldene?n? ringe?\b/.test(folded)))
  if (missingRing || pendingRingBuy || missingRohling) return true
  if (detectOptionalOwnMaterial(folded)) return false

  const bringOwn = detectBringOwn(folded)
  const canFinish =
    /fertig machen|fertigmachen|fertig ?binden|darauf binden|belegen|verwert/.test(folded) &&
    /ring|rohling|gold|mitbring|zuhause|zu hause|bei dir|privat/.test(folded)

  if (bringOwn && (canFinish || /ring|rohling|gold/.test(folded))) return true
  if (notInStock && /ring|rohling|gold/.test(folded)) return true
  return false
}

function detectStockLimit(folded: string): boolean {
  // Fertig-/Abholtermine sind kein Lagerengpass („Donnerstag fertig — geht das?“)
  if (
    /(montag|dienstag|mittwoch|donnerstag|freitag|samstag|sonntag).{0,40}(fertig|abhol|termin)/.test(
      folded,
    ) ||
    /(fertig|abhol|termin).{0,40}(montag|dienstag|mittwoch|donnerstag|freitag|samstag|sonntag)/.test(
      folded,
    )
  ) {
    return false
  }
  return (
    /kaum (etwas|was) da\b/.test(folded) ||
    /nicht (mehr )?da\b/.test(folded) ||
    /ausverkauft|keine ware|wenig (da|vorrat)/.test(folded) ||
    /farbwahl|farben.{0,28}(nicht|kaum|wenig)/.test(folded) ||
    /aus deiner farb/.test(folded) ||
    /abwarten|warte(n)? bis|neue ware|nachschub/.test(folded) ||
    (/donnerstag|mittwoch|freitag|montag|dienstag|naechste woche/.test(folded) &&
      (/ware|vorrat|nachschub|\bda\b|warten|abwarten|kommen/.test(folded) &&
        !/goldring|rohling|fertig|abhol|termin/.test(folded)))
  )
}

function detectPreferenceAsk(folded: string): boolean {
  return (
    /du bist (die )?kundin/.test(folded) ||
    /was ist dir wichtig/.test(folded) ||
    /was magst du/.test(folded) ||
    /welche farbe(n)? (willst|moechtest|sind dir)/.test(folded) ||
    /was schwebt dir/.test(folded) ||
    /sag (mir )?was (dir|du) (wichtig|willst|moechtest)/.test(folded) ||
    // Bild unklar → bitte in Worten beschreiben (kein Produktwechsel)
    /beschreib.{0,32}(in )?worten/.test(folded) ||
    /in worten (beschreib|sagen|erkl)/.test(folded) ||
    /nicht (eindeutig |klar |genau )?erkennen/.test(folded) ||
    /kann ich nicht.{0,28}erkennen/.test(folded) ||
    /auf dem bild.{0,48}(nicht|kein|unklar)/.test(folded) ||
    /vom bild.{0,32}(nicht|kein|unklar)/.test(folded) ||
    // Optik / Vorstellung nach Produktwahl — nicht erneut „nehme ich“
    /wie darf .{0,48}aussehen/.test(folded) ||
    /wie soll .{0,48}aussehen/.test(folded) ||
    /wie (sollte|kann) .{0,48}aussehen/.test(folded) ||
    /was stellst du dir vor/.test(folded) ||
    /wie stellst du (dir|ihn|sie|es) vor/.test(folded) ||
    /welche (optik|richtung|stimmung|farben?)/.test(folded) ||
    /was (wuenschst|wünschst|moechtest|möchtest) du (dir )?genau/.test(folded) ||
    /\boptik\b/.test(folded) ||
    // Stilvarianten / Auswahl innerhalb derselben Produktfamilie
    /welche variante/.test(folded) ||
    /variante\s*\d/.test(folded) ||
    /welche soll es sein/.test(folded) ||
    /welches gefaellt|welches gefällt|welches magst/.test(folded) ||
    /welches foto|welche(s|n)? (bild|aufnahme)/.test(folded) ||
    /drei fotos|3 fotos|mehrere fotos/.test(folded) ||
    detectVariantChoiceAsk(folded)
  )
}

/** Stil-/Farb-/Nummern-Auswahl innerhalb einer Produktfamilie (kein Produktmenü). */
export function detectVariantChoiceAsk(folded: string): boolean {
  if (extractVariantOptions(folded).length >= 2) return true
  if (
    /welche variante|variante\s*\d|welche soll es sein|welches gefaellt|welches gefällt/.test(
      folded,
    )
  ) {
    return true
  }
  if (/welches foto|welche(s|n)? (bild|aufnahme)|drei fotos|3 fotos/.test(folded)) {
    return true
  }
  // „Creme, Rosa oder kräftiger?“ / „hell oder dunkel?“ / „luftig oder üppig?“
  if (
    /\boder\b/.test(folded) &&
    /(creme|rosa|weiss|weiß|hell|dunkel|luftig|ueppig|üppig|kraeftig|kräftig|ruhig|zurueckhalt|zurückhalt|variante|foto)/.test(
      folded,
    ) &&
    !detectForcedChoice(folded)
  ) {
    return true
  }
  return false
}

/**
 * Extrahiert benannte Stiloptionen aus einer Variantenfrage.
 * Produktfamilien-Menüs (Strauß/Gesteck/…) gehören nicht hierher.
 */
export function extractVariantOptions(folded: string): string[] {
  const options: string[] = []
  const push = (label: string) => {
    const clean = label.replace(/\s+/g, ' ').trim()
    if (!clean || clean.length > 40) return
    if (options.some((o) => o.toLowerCase() === clean.toLowerCase())) return
    options.push(clean)
  }

  // Variante 1 / 2 / 3
  const numbered = [...folded.matchAll(/variante\s*(\d+)/g)]
  if (numbered.length >= 2) {
    for (const m of numbered) push(`Variante ${m[1]}`)
    return options
  }
  if (/variante\s*1.+variante\s*2|1[,\/\s]+2[,\/\s]+(oder\s+)?3/.test(folded)) {
    push('Variante 1')
    push('Variante 2')
    if (/3|drei/.test(folded)) push('Variante 3')
    return options
  }

  // Drei Fotos / welches Foto
  if (/drei fotos|3 fotos|mehrere fotos|welches foto/.test(folded)) {
    push('Foto 1')
    push('Foto 2')
    push('Foto 3')
    return options
  }

  // A / B / C
  if (/\b[aA]\b.+\b[bB]\b/.test(folded) && /oder|\/|,/.test(folded)) {
    push('A')
    push('B')
    if (/\b[cC]\b/.test(folded)) push('C')
    return options
  }

  // „X oder Y“ / „X, Y oder Z“ mit Stilwörtern
  const styleToken =
    /(creme|rosa|weiss|weiß|hell|dunkel|luftig|ueppig|üppig|kraeftig|kräftig|ruhig|zurueckhaltend|zurückhaltend|sanft|bunt|gruen|grün)/i
  if (styleToken.test(folded) && /\boder\b/.test(folded)) {
    const parts = folded
      .replace(/[?!.]+$/g, '')
      .split(/\boder\b|,|\bund\b/)
      .map((p) => p.trim())
      .filter(Boolean)
    for (const part of parts) {
      const m = part.match(styleToken)
      if (!m) continue
      const word = m[1]
      const normalized =
        /ueppig|üppig/i.test(word)
          ? 'üppiger'
          : /kraeftig|kräftig/i.test(word)
            ? 'kräftiger'
            : /luftig/i.test(word)
              ? 'luftig'
              : /hell/i.test(word)
                ? 'hell'
                : /dunkel/i.test(word)
                  ? 'dunkel'
                  : /ruhig|zurueckhalt|zurückhalt|sanft/i.test(word)
                    ? 'ruhig'
                    : /creme/i.test(word)
                      ? 'Creme'
                      : /rosa/i.test(word)
                        ? 'Rosa'
                        : /weiss|weiß/i.test(word)
                          ? 'Weiß'
                          : /gruen|grün/i.test(word)
                            ? 'Grün'
                            : word
      push(normalized)
    }
  }

  return options
}

/** Anna wählt die ruhigste passende Option (Creme/Rosa/hell/luftig vor kräftig/üppig). */
export function chooseVariantOption(options: readonly string[]): string | undefined {
  if (!options.length) return undefined
  const score = (label: string): number => {
    const f = foldDialog(label)
    let s = 0
    if (/creme|rosa|weiss|weiss|ruhig|sanft|hell|luftig|zurueckhalt/.test(f)) s += 5
    if (/variante 1|foto 1|\ba\b/.test(f)) s += 3
    if (/variante 2|foto 2|\bb\b/.test(f)) s += 1
    if (/kraeftig|ueppig|dunkel|bunt|variante 3|foto 3|\bc\b/.test(f)) s -= 4
    return s
  }
  let best = options[0]
  let bestScore = score(best)
  for (const opt of options.slice(1)) {
    const s = score(opt)
    if (s > bestScore) {
      best = opt
      bestScore = s
    }
  }
  return best
}

/** Atelier fragt nach Anlass / Empfänger. */
export function detectOccasionAsk(folded: string): boolean {
  return (
    /zu welchem anlass/.test(folded) ||
    /welcher anlass/.test(folded) ||
    /fuer welchen anlass|für welchen anlass/.test(folded) ||
    /anlass (soll|ist|waere|wäre|darf)/.test(folded) ||
    /was (ist|waere|wäre) der anlass/.test(folded) ||
    /fuer wen (soll|ist|waere|wäre)|für wen (soll|ist|waere|wäre)/.test(folded) ||
    /zum verschenken oder/.test(folded) ||
    /privat oder/.test(folded) ||
    /geschenk oder/.test(folded)
  )
}

/** Atelier fragt nach Budget / Preisvorstellung der Kundin. */
export function detectBudgetAsk(folded: string): boolean {
  // „Was darf es sein?“ = Produktmenü, keine Preisfrage
  if (/was darf (es|das|der|die) (denn )?sein\b/.test(folded)) return false
  if (/was darf ich (dir |euch )?(anbieten|machen|tun|helfen)/.test(folded)) return false
  return (
    /preisvorstellung/.test(folded) ||
    /was darf .{0,40}kosten/.test(folded) ||
    /was darf (der|die|das|es|er)\b.{0,48}(kosten|preis|werden|ueberhaupt|überhaupt|max|maximal)/.test(
      folded,
    ) ||
    /wie viel darf/.test(folded) ||
    /wie viel (darf|soll|kann|wuerde|würde)/.test(folded) ||
    /wie teuer/.test(folded) ||
    /kosten darf/.test(folded) ||
    /kostenrahmen|preisrahmen/.test(folded) ||
    /was ist dein(e|er)? preis/.test(folded) ||
    /welchen preis/.test(folded) ||
    /ungefähre?r? preis|ungefaehre?r? preis/.test(folded) ||
    /preislich/.test(folded) ||
    /\bbudget\b/.test(folded) ||
    /was darf .{0,16}ueberhaupt/.test(folded) ||
    /was (hattest|hast) du dir .{0,40}(preis|kosten|budget|euro)/.test(folded) ||
    /was stellst du dir .{0,40}(preis|kosten|budget|euro)/.test(folded) ||
    /was stellst du dir vor.{0,48}(preis|kosten|budget|euro|wie viel)/.test(folded) ||
    /stell(st|en) .+ vor.{0,40}(preis|kosten|budget|euro)/.test(folded) ||
    /hast du (eine |einen )?(preisvorstellung|budget|kostenrahmen|preisrahmen)/.test(folded) ||
    /sag mir .{0,36}(preis|budget|kosten|wie viel)/.test(folded)
  )
}

/** Atelier zwingt zur Wahl zwischen genannten Produkten. */
function detectForcedChoice(folded: string): boolean {
  return (
    /moechtest du .{0,40} oder .{0,40}\?/.test(folded) ||
    /willst du .{0,40} oder .{0,40}\?/.test(folded) ||
    /kranz oder (einen )?strau/.test(folded) ||
    /strau[sß] oder (einen )?kranz/.test(folded) ||
    /entscheidung (zu )?treffen/.test(folded) ||
    /entscheide (dich|bitte)/.test(folded)
  )
}

/** Nur reine Begrüßung, nicht „Hallo … und dann Inhalt“. */
export function isGreetingOnly(folded: string): boolean {
  const cleaned = folded.replace(/[.,!?;:]+/g, ' ').replace(/\s+/g, ' ').trim()
  return /^(hey|hallo|hi|na|moin|lieben tag|guten (morgen|tag|abend))(\s+[a-z0-9\-]+)?$/i.test(
    cleaned,
  )
}

/**
 * Nur Kontakt-/Zeitfrage ohne Produkt — z. B. „Hallo Damaris, hast du kurz Zeit?“
 * Das ist noch kein Anliegen.
 */
export function isMereContactOpener(folded: string): boolean {
  if (isGreetingOnly(folded)) return true
  const hasProductCue =
    /blumenhoop|\bhoops?\b|\bloops?\b|goldring|pampas|trocken|freundin|kranz|gesteck|girlande|strau|bouquet|blickfang|kapazitaet|kapazität|noch einmal|nochmal/.test(
      folded,
    )
  if (hasProductCue) return false
  return (
    /hast du (kurz |einen )?(moment|augenblick|sekunde|zeit)\b/.test(folded) ||
    /hast du (kurz )?luft\b/.test(folded) ||
    /bist du (kurz )?da\b/.test(folded) ||
    /hast du (einen )?moment\b/.test(folded)
  )
}

/** Kundin hat ein konkretes Kauf-/Produktanliegen genannt (nicht nur begrüßt/Zeit gefragt). */
export function kundeMessageStatesWish(folded: string): boolean {
  if (!folded.trim()) return false
  if (isGreetingOnly(folded) || isMereContactOpener(folded)) return false
  if (
    /blumenhoop|\bhoops?\b|\bloops?\b|goldring|pampas|trocken|freundin|kranz|gesteck|girlande|strau|bouquet|blickfang/.test(
      folded,
    )
  ) {
    return true
  }
  if (
    /brauch|haettest|hättest|koenntest|könntest|haette gern|hätte gern|wuerde gern|würde gern|noch einmal|nochmal|zeit fuer|zeit für|lust auf|kapazitaet|kapazität/.test(
      folded,
    )
  ) {
    return true
  }
  return false
}

/**
 * Soft-Pause: Atelier bittet um einen kurzen Moment — kein harter Abbruch.
 * Nicht verwechseln mit „warte bis Donnerstag“ (Lager) oder „Soll ich warten?“.
 */
export function isPleaseWait(folded: string): boolean {
  if (/soll ich warten/.test(folded)) return false
  if (/warte(n)?\s+bis\s+/.test(folded) || /abwarten\s+bis/.test(folded)) return false
  return (
    /warte bitte/.test(folded) ||
    /bitte (kurz |einen |einen kurzen )?warte/.test(folded) ||
    /warte (bitte )?(kurz|einen (kurzen )?moment|einen augenblick|eine sekunde)/.test(folded) ||
    /\b(einen |einen kurzen |kurzen )?moment(,)? bitte\b/.test(folded) ||
    /\bwarte (bitte )?(einen |einen kurzen )?moment\b/.test(folded) ||
    /\b(augenblick|sekunde)( bitte)?\b/.test(folded) ||
    /kurz (mal )?warten/.test(folded) ||
    /bin gleich (da|zurueck|zurück)/.test(folded) ||
    /gleich (zurueck|zurück|da)\b/.test(folded) ||
    /eine sekunde/.test(folded)
  )
}

/** Pause vorbei: Atelier ist wieder ansprechbar. */
export function isResumePresence(folded: string): boolean {
  return (
    /nun bin ich da/.test(folded) ||
    /jetzt bin ich da/.test(folded) ||
    /so(,)? nun bin ich da/.test(folded) ||
    /so(,)? jetzt bin ich da/.test(folded) ||
    /ich bin (wieder |nun |jetzt )?da\b/.test(folded) ||
    /wieder da\b/.test(folded) ||
    /jetzt (hab(e)?|habe) ich (wieder )?zeit/.test(folded) ||
    /jetzt kann ich/.test(folded) ||
    /da bin ich (wieder|nun)/.test(folded)
  )
}

function detectInvite(folded: string): boolean {
  return (
    /was brauchst du/.test(folded) ||
    /was kann ich(.{0,24})?tun/.test(folded) ||
    /wobei kann ich/.test(folded) ||
    /womit kann ich/.test(folded) ||
    /was soll ich/.test(folded) ||
    /was darf ich/.test(folded) ||
    /welches produkt/.test(folded) ||
    /was (moechtest|möchtest|willst) du (haben|nehmen)/.test(folded) ||
    /komm .{0,32}vorbei/.test(folded) ||
    /ich hab(e)? (jetzt |wieder )?zeit/.test(folded) ||
    /wieder da/.test(folded) ||
    /kinder schlafen/.test(folded)
  )
}

/**
 * Klassifiziert die Atelier-Nachricht. Primärakt + Side-Signals (Multi-Intent).
 * Exported für Tests und Dokumentation der Priorität.
 */
export function classifyAtelierSpeechAct(
  atelierText: string,
  options: { isBoundary?: boolean } = {},
): AtelierSpeechAct {
  const folded = foldDialog(atelierText)
  const primary = classifyAtelierSpeechActPrimary(atelierText, folded, options)
  return enrichSideSignals(primary, folded)
}

function enrichSideSignals(act: AtelierSpeechAct, folded: string): AtelierSpeechAct {
  const lookAsk = detectPreferenceAsk(folded)
  const budgetAsk = detectBudgetAsk(folded)
  const material = detectMaterialIssue(folded)
  const occasion = detectOccasionAsk(folded)
  const alsoBudget =
    Boolean(act.alsoBudget) ||
    (act.type !== 'budget_ask' && budgetAsk && (lookAsk || act.type === 'unavailable_until' || act.type === 'material' || act.type === 'offer_other'))
  return {
    ...act,
    alsoBudget: alsoBudget || undefined,
    alsoMaterial: act.type !== 'material' && material ? true : undefined,
    alsoPreference:
      act.type !== 'preference_ask' &&
      act.type !== 'budget_ask' &&
      lookAsk
        ? true
        : undefined,
    alsoOccasion: act.type !== 'occasion_ask' && occasion ? true : undefined,
  }
}

function classifyAtelierSpeechActPrimary(
  atelierText: string,
  folded: string,
  options: { isBoundary?: boolean } = {},
): AtelierSpeechAct {
  const blockedKind = detectBlockedKind(atelierText)
  const offeredKinds = extractOfferedKinds(atelierText, blockedKind)
  const empty = {
    offeredKinds,
    offersAlternative: atelierOffersAlternative(folded, offeredKinds),
    bringOwn: detectBringOwn(folded),
    freshContext: detectFreshContext(folded),
  } as const

  if (options.isBoundary) {
    return { type: 'boundary', ...empty }
  }

  // Soft-Pause vor Begrüßung: „Guten Morgen. Warte bitte einen Moment.“
  if (isPleaseWait(folded)) {
    return { type: 'hold', ...empty }
  }

  if (isResumePresence(folded)) {
    return { type: 'resume', ...empty }
  }

  // Reine Begrüßung ≠ Zusage / Einladung zum Weiterbestellen
  if (isGreetingOnly(folded)) {
    return { type: 'greeting', ...empty }
  }

  const hit = detectFloristryProduct(atelierText)
  const kind = hit && hit.kind !== 'katalog' ? hit.kind : undefined
  const untilLabel = extractUntilLabel(folded)
  const blockedMention = isProductMentionBlocked(folded)

  // „Kränze erst ab Oktober“ / zeitliche Sperre — kind = Gesperrtes, nicht die Angebotsliste
  if (
    untilLabel &&
    (blockedMention ||
      /auf lager|vorrat|wieder|erst|starten mit/.test(folded) ||
      /kraenz|kranz|hoop|goldring|strauss/.test(folded))
  ) {
    const blocked =
      blockedKind ??
      (/kraenz|kranz/.test(folded)
        ? 'kranz'
        : kind && isProductMentionBlocked(folded)
          ? kind
          : undefined)
    return {
      type: 'unavailable_until',
      kind: blocked ?? 'kranz',
      untilLabel,
      ...empty,
    }
  }

  // Goldring-Nachschub (Wochentag oder „in ein paar Tagen“) → warten, vor material
  const ringRestockDay = detectGoldRingRestockDay(folded)
  if (ringRestockDay) {
    return {
      type: 'unavailable_until',
      kind: 'blumenhoop',
      untilLabel: ringRestockDay,
      ...empty,
      offersAlternative: empty.offersAlternative,
    }
  }

  if (detectMaterialIssue(folded)) {
    return { type: 'material', kind: blockedKind ?? kind, ...empty }
  }

  // Frischware-only (exklusiv) → vor stock_limit
  const exclusiveFresh = detectExclusiveFreshOnly(folded)
  if (exclusiveFresh && offeredKinds.length === 0) {
    return {
      type: 'offer_other',
      kind: kind && (kind === 'strauss' || kind === 'bouquet') ? kind : 'strauss',
      ...empty,
      freshContext: true,
    }
  }

  if (exclusiveFresh && offeredKinds.length > 0) {
    return {
      type: 'offer_other',
      kind: offeredKinds.includes('strauss')
        ? 'strauss'
        : offeredKinds.includes('bouquet')
          ? 'bouquet'
          : offeredKinds[0],
      ...empty,
      freshContext: true,
    }
  }

  // Offenes Produktmenü (Frischware + Kränze + …) → Einladung mit Angebotsliste
  if (detectProductMenu(folded) && offeredKinds.length > 0) {
    return {
      type: 'invite',
      kind: undefined,
      ...empty,
      freshContext: false,
      offersAlternative: true,
    }
  }

  // Frischware erwähnt, aber nicht exklusiv und mit Liste → normales Angebot
  if (empty.freshContext && offeredKinds.length > 0 && !detectProductMenu(folded)) {
    return {
      type: 'offer_other',
      kind: offeredKinds[0],
      ...empty,
      freshContext: false,
    }
  }

  if (empty.freshContext && offeredKinds.length === 0) {
    return {
      type: 'offer_other',
      kind: kind && (kind === 'strauss' || kind === 'bouquet') ? kind : 'strauss',
      ...empty,
      freshContext: true,
    }
  }

  if (detectStockLimit(folded) && !blockedMention) {
    return { type: 'stock_limit', kind, ...empty }
  }

  const lookAsk = detectPreferenceAsk(folded)
  const budgetAsk = detectBudgetAsk(folded)
  const occasionAsk = detectOccasionAsk(folded)
  const variantOpts = extractVariantOptions(folded)
  const variantOptions = variantOpts.length >= 2 ? variantOpts : undefined
  // Optik + Preis in einer Nachricht → eine Antwort, beide Teile
  if (lookAsk && budgetAsk) {
    return { type: 'preference_ask', kind, ...empty, alsoBudget: true, variantOptions }
  }
  if (lookAsk) {
    return { type: 'preference_ask', kind, ...empty, variantOptions }
  }
  if (budgetAsk) {
    return { type: 'budget_ask', kind, ...empty }
  }
  // Reine Variantenfrage ohne Preference-Muster (Fallback)
  if (detectVariantChoiceAsk(folded)) {
    return { type: 'preference_ask', kind, ...empty, variantOptions }
  }
  // Anlass vor Produktangebot — „Strauß“ in der Frage ist kein neues Angebot
  if (occasionAsk) {
    return { type: 'occasion_ask', kind, ...empty }
  }

  // Fachfragen zu Größe/Termin (Preis/Budget schon oben) sind kein Produktangebot
  const tradeQuestion =
    /\?/.test(atelierText) &&
    /grosse|grose|groesse|größe|cm|durchmesser|abhol|uhrzeit|termin|wann|wie breit|wie gross|wie groß/.test(
      folded,
    )

  // „Kranz oder Strauß?“ nach bereits geäußertem Wunsch → Einladung zur Festlegung, kein Neuangebot
  if (detectForcedChoice(folded)) {
    return { type: 'invite', kind, ...empty, offersAlternative: true }
  }

  // Fachfragen zu Größe/Termin/Preis schon oben; reine Maße/Termin ohne Menü
  if (tradeQuestion) {
    return {
      type: 'invite',
      kind,
      ...empty,
      offeredKinds: [],
      offersAlternative: false,
    }
  }

  // Positives Angebot eines anderen Produkts — nie bei blockierter Nennung
  // und nie, wenn nur nach Optik/Vorstellung gefragt wird (oben preference_ask)
  if (kind && !isHoopKind(kind) && !blockedMention) {
    return { type: 'offer_other', kind, ...empty }
  }

  // „Ich kann dir etwas anderes anbieten“ — auch ohne konkretes Lexikon-Produkt
  if (empty.offersAlternative && !blockedMention) {
    const altKind =
      offeredKinds[0] ??
      (kind && !isHoopKind(kind) ? kind : undefined) ??
      'strauss'
    return {
      type: 'offer_other',
      kind: altKind,
      ...empty,
      offersAlternative: true,
    }
  }

  if (detectInvite(folded)) {
    return { type: 'invite', kind, ...empty }
  }

  return { type: 'other', kind, ...empty }
}

/** Darf Anna für diese Wunsch-Familie weiter Referenz/Clip schicken? */
export function mayPursueProduct(
  wished: FloristryKind,
  act: AtelierSpeechAct,
): boolean {
  if (act.type === 'boundary') return false
  if (act.type === 'hold') return false
  if (act.type === 'greeting') return false
  if (act.type === 'resume') return true
  if (act.type === 'unavailable_until') {
    if (!act.kind) return false
    if (act.kind === wished) return false
    if (isKranzFamily(act.kind) && isKranzFamily(wished)) return false
    if (isHoopKind(act.kind) && isHoopKind(wished)) return false
    return true
  }
  if (act.type === 'material' && isHoopKind(wished) && !act.bringOwn) {
    return false
  }
  return true
}

/** Optik- und/oder Budget-Antwort als flüssiger Satz (Multi-Intent / Doppelfrage). */
export function preferenceBudgetPhrase(
  focus: FloristryKind,
  withLook: boolean,
  withBudget: boolean,
  seed: string,
  pick: <T>(items: readonly T[], seed: string) => T,
): string {
  if (withLook && withBudget) {
    if (isHoopKind(focus)) {
      return pick(
        [
          'Am liebsten ruhig und luftig mit Goldring, Pampas eher wenig, und beim Preis hatte ich so um die 45 Euro im Kopf.',
          'Ich hätte ihn gern zurückhaltend mit Goldring, und preislich denke ich an etwa 45 Euro.',
        ],
        `${seed}|side-dual-hoop`,
      )
    }
    if (focus === 'tischkranz') {
      return pick(
        [
          'Am liebsten ruhig in Creme und etwas Rosa, eher locker, Mitte frei für eine Kerze, und beim Preis so um die 45 Euro.',
          'Ruhige Farben, luftig gebunden, Mitte gern frei für eine Kerze, und ich hatte mir etwa 45 Euro vorgestellt, bis 50 ginge noch.',
        ],
        `${seed}|side-dual-tisch`,
      )
    }
    return pick(
      [
        'Am liebsten ruhig in Creme und etwas Rosa, eher locker, und beim Preis hatte ich so um die 45 Euro im Kopf.',
        'Ruhige Farben und nicht zu üppig, und preislich denke ich an etwa 45 Euro, ein Stück darüber wäre okay.',
      ],
      `${seed}|side-dual`,
    )
  }
  if (withBudget && !withLook) {
    return pick(
      [
        'Beim Preis denke ich an etwa 45 Euro, bis ungefähr 50 ginge auch noch.',
        'Ich hatte mir so um die 45 Euro vorgestellt. Ein Stück darüber wäre okay, wenn es sich lohnt.',
      ],
      `${seed}|side-bud`,
    )
  }
  if (isHoopKind(focus)) {
    return pick(
      [
        'Am liebsten ruhig und eher luftig, mit dem Goldring, und bei den Pampas eher wenig.',
        'Ich hätte den gern zurückhaltend, Goldring ja, Pampas nur sparsam.',
      ],
      `${seed}|side-look-hoop`,
    )
  }
  if (focus === 'tischkranz') {
    return pick(
      [
        'Am liebsten ruhig in Creme und etwas Rosa, eher locker gebunden, und die Mitte gern frei für eine Kerze.',
        'Ruhige Farben wären schön, Creme und Weiß, vielleicht etwas Grün, luftig gebunden, und in der Mitte Platz für eine Kerze.',
      ],
      `${seed}|side-look-tisch`,
    )
  }
  return pick(
    [
      'Am liebsten ruhig in Creme und etwas Rosa, eher locker und nicht zu üppig.',
      'Ruhige Farben wären schön, Creme und Weiß, vielleicht etwas Grün, und eher luftig.',
    ],
    `${seed}|side-look`,
  )
}

function mergeUnavailableParts(parts: string[]): string[] {
  const cleaned = parts.map((p) => p.trim()).filter(Boolean)
  if (cleaned.length <= 1) return cleaned
  if (cleaned.length === 2) return [`${cleaned[0]} ${cleaned[1]}`]
  return [`${cleaned[0]} ${cleaned[1]}`, cleaned.slice(2).join(' ')]
}

export function replyForUnavailableUntil(
  act: AtelierSpeechAct,
  wished: FloristryKind,
  seed: string,
  pick: <T>(items: readonly T[], seed: string) => T,
  atelierText = '',
): string[] {
  const until = act.untilLabel ?? 'dann'
  const wishedLabel = labelForKind(wished)
  const offered = act.offeredKinds ?? []
  const chosen = chooseOfferedAlternative(wished, offered)
  const atelierFolded = foldDialog(atelierText)
  const thursdayFresh =
    /donnerstag/.test(atelierFolded) &&
    /frisch|einkauf|strau[sß]|blumenstrau/.test(atelierFolded)
  const multiSide =
    Boolean(act.alsoPreference) ||
    Boolean(act.alsoBudget) ||
    Boolean(act.alsoMaterial) ||
    Boolean(act.alsoOccasion)

  const indefinite = (kind: FloristryKind): string => {
    const name = labelForKind(kind)
    if (kind === 'girlande') return `eine ${name}`
    if (kind === 'gesteck') return `ein ${name}`
    if (kind === 'blumenhoop') return `einen Blumenhoop`
    return `einen ${name}`
  }

  let core: string

  // Konkrete Alternativen genannt → eine wählen, nie nachfragen
  if (chosen) {
    const chosenPhrase = indefinite(chosen)
    const candleHint =
      wished === 'tischkranz' && chosen === 'gesteck'
        ? ' Das passt auch gut zur Kerze.'
        : ''
    const thursdayHint =
      thursdayFresh && (chosen === 'strauss' || chosen === 'bouquet')
        ? ' Am besten, wenn du Donnerstag die Frischware hast.'
        : ''
    // Bei Side-Preference kommt der Stil separat — kein doppelter Style-Anhang
    const styleHint =
      act.alsoPreference || act.alsoBudget
        ? ''
        : wished === 'tuerkranz' || wished === 'wandkranz'
          ? ' Eher luftig und nicht zu üppig, bitte.'
          : wished === 'tischkranz'
            ? ''
            : ' Am liebsten ruhig in Creme und etwas Rosa.'

    core = pick(
      [
        `Das verstehe ich. Mit dem ${wishedLabel} warte ich gern bis ${until}. Bis dahin nehme ich ${chosenPhrase}.${candleHint}${thursdayHint}${styleHint}`,
        `Alles klar. Wegen dem ${wishedLabel} komme ich bis ${until} nochmal auf dich zu. Zwischenzeitlich freue ich mich über ${chosenPhrase}.${thursdayHint}${styleHint}`,
        `Gut, bis ${until} warte ich mit dem ${wishedLabel}. Jetzt würde ich gerne ${chosenPhrase} nehmen.${candleHint}${thursdayHint}`,
      ],
      `${seed}|unav-pick`,
    )
  } else {
    // Nur Nachschub (Goldringe Wochentag / in ein paar Tagen), ohne konkrete Alternative
    const ringRestockWait =
      (isHoopKind(wished) || /goldring/.test(atelierFolded) || Boolean(act.alsoMaterial)) &&
      /montag|dienstag|mittwoch|donnerstag|freitag|samstag|sonntag|paar tagen|naechsten tagen|nächsten tagen|\d+ tagen|naechste woche|nächste woche|^bald$/i.test(
        until,
      )
    if (ringRestockWait) {
      core = pick(
        [
          until === 'bald'
            ? 'Verstehe. Dann warte ich gern, bis die Goldringe da sind, damit der Blumenhoop wie geplant geht.'
            : until.startsWith('in ')
              ? `Verstehe. Dann warte ich gern ${until} auf die Goldringe, damit der Blumenhoop wie geplant geht.`
              : `Verstehe. Dann warte ich gern bis ${until} auf die Goldringe, damit der Blumenhoop wie geplant geht.`,
          until === 'bald'
            ? 'Alles klar. Ich warte, bis du die Goldringe da hast.'
            : until.startsWith('in ')
              ? `Alles klar. ${until.charAt(0).toUpperCase()}${until.slice(1)} kann ich warten, wenn du dann die Goldringe da hast.`
              : `Alles klar. Bis ${until} kann ich warten, wenn du dann die Goldringe da hast.`,
          until === 'bald' || until.startsWith('in ')
            ? 'Gut, dann melde ich mich wegen dem Blumenhoop, sobald die Goldringe da sind.'
            : `Gut, dann melde ich mich wegen dem Blumenhoop bis ${until}, sobald die Goldringe da sind.`,
        ],
        `${seed}|unav-ringday`,
      )
    } else if (act.offersAlternative) {
      core = pick(
        [
          `Das verstehe ich. Den ${wishedLabel} halte ich bis ${until} fest. Von dem, was du jetzt da hast, nehme ich gern etwas Frisches in ruhigen Farben.`,
          `Alles klar, erst ab ${until}. Bis dahin warte ich mit dem ${wishedLabel} und nehme jetzt etwas aus deinem aktuellen Angebot.`,
        ],
        `${seed}|unav-alt`,
      )
    } else if (multiSide) {
      // Multi-Intent: warten anerkennen, keine „Hast du Alternative?“-Rückfrage
      core = pick(
        [
          `Das verstehe ich. Dann warte ich mit dem ${wishedLabel} bis ${until}.`,
          `Alles klar, erst ab ${until}. Den ${wishedLabel} halte ich bis dahin fest.`,
          `Verstehe. Bis ${until} warte ich auf den ${wishedLabel}.`,
        ],
        `${seed}|unav-side`,
      )
    } else {
      core = pick(
        [
          `Das verstehe ich. Dann warte ich mit dem ${wishedLabel} bis ${until}. Hast du bis dahin etwas anderes, das ich jetzt nehmen könnte?`,
          `Alles klar, erst ab ${until}. Den ${wishedLabel} halte ich bis dahin fest. Ein Strauß in ruhigen Farben wäre für mich jetzt auch schön.`,
          `Verstehe. Bis ${until} warte ich auf den ${wishedLabel}. Oder hast du jetzt etwas anderes da?`,
        ],
        `${seed}|unav`,
      )
    }
  }

  const parts: string[] = [core.trim()]
  const coreMentionsGold = /goldring/i.test(core)

  if (act.alsoMaterial && !coreMentionsGold) {
    parts.push(
      pick(
        [
          'Wegen den Goldringen warte ich gern, bis die wieder da sind.',
          'Schade wegen den Goldringen. Den Blumenhoop machen wir, sobald die wieder lieferbar sind.',
          'Wegen den fehlenden Goldringen warte ich lieber, statt den Hoop jetzt zu fordern.',
        ],
        `${seed}|side-mat`,
      ),
    )
  }

  if (act.alsoPreference || act.alsoBudget) {
    const focus =
      chosen ??
      (isHoopKind(wished) && act.alsoMaterial && !act.bringOwn ? 'strauss' : wished)
    parts.push(
      preferenceBudgetPhrase(
        focus,
        Boolean(act.alsoPreference),
        Boolean(act.alsoBudget),
        `${seed}|pref`,
        pick,
      ),
    )
  }

  if (act.alsoOccasion) {
    parts.push(
      pick(
        [
          'Als Mitbringsel zum Verschenken, nichts Großes.',
          'Zum Verschenken für eine Freundin, eher als kleines Mitbringsel.',
        ],
        `${seed}|side-occ`,
      ),
    )
  }

  return mergeUnavailableParts(parts)
}
