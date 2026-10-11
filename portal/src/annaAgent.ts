/**
 * Deliberativer Anna-Agent — eine Entscheidung aus Belief + letztem Sprechakt.
 * Optional: LLM über VITE_ANNA_AGENT_ENDPOINT, sonst deterministisch.
 */

import type { Conversation } from './data'
import type { AnnaBubble, AnnaPlan, AnnaPlanOptions } from './annaBot'
import { labelForKind, type FloristryKind, isHoopKind, isKranzFamilyKind } from './floristryLexicon'
import { referenceQueryForKind } from './referenceImages'
import {
  activeBlockForWish,
  buildAnnaBelief,
  type AnnaBelief,
} from './annaBelief'
import {
  applyAnnaGuardrails,
  beliefAllowsMedia,
  fallbackPlanForBelief,
} from './annaGuardrails'
import { replyForUnavailableUntil, chooseOfferedAlternative, detectGoldRingRestockDay, detectBringOwn, detectOptionalOwnMaterial, preferenceBudgetPhrase, chooseVariantOption } from './annaDialogRules'
import { ANNA_POLICY_FOR_LLM } from './annaDialogRules'

export type AnnaDecision = {
  reason: string
  lines: string[]
  referenceKind?: FloristryKind
  allowLegacy: boolean
}

function hashSeed(value: string): number {
  let hash = 2166136261
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

function pick<T>(items: readonly T[], seed: string): T {
  return items[hashSeed(seed) % items.length]
}

/** Natürliche Zurückstellung — kein „halten wir fest“ / Protokollton. */
function deferLaterLine(kind: FloristryKind, seed: string): string {
  const name = labelForKind(kind)
  const wegen =
    kind === 'girlande' ? `Wegen der ${name}` : `Wegen dem ${name}`
  return pick(
    [
      `${wegen} komme ich ein anderes Mal auf dich zu.`,
      `${wegen} melde ich mich später nochmal.`,
      `${wegen} komme ich ein anderes Mal.`,
    ],
    `${seed}|defer`,
  )
}

function typingFor(text: string): number {
  return Math.min(3400, Math.max(620, 38 * Math.max(8, text.length)))
}

function textBubbles(lines: string[], seed: string): AnnaBubble[] {
  return lines.map((text, index) => ({
    kind: 'text' as const,
    text,
    gapMs: index === 0 ? 800 : 320 + (hashSeed(seed + String(index)) % 400),
    typingMs: typingFor(text),
  }))
}

function referenceBubble(kind: FloristryKind, seed: string, _index: number): AnnaBubble {
  const label = labelForKind(kind)
  const captions =
    kind === 'strauss' || kind === 'bouquet'
      ? [
          'So ungefähr stelle ich mir den Strauß vor.',
          'In der Richtung wäre der Strauß schön.',
        ]
      : kind === 'gesteck'
        ? [
            'So in der Richtung stelle ich mir das Gesteck vor.',
            'Ein Gesteck in etwa so, nicht zu hoch.',
          ]
        : kind === 'blumenhoop'
          ? [
              'So ungefähr stelle ich mir den Blumenhoop vor.',
              'In der Art mit dem Ring und den Trockenblumen.',
            ]
          : [
              `So ungefähr stelle ich mir ${label === 'Girlande' ? 'die Girlande' : `den ${label}`} vor.`,
              `In der Richtung wäre ${label === 'Girlande' ? 'die Girlande' : `der ${label}`} schön.`,
            ]
  return {
    kind: 'image',
    text: captions[hashSeed(`${seed}|cap`) % captions.length],
    forwarded: true,
    referenceSearch: { query: referenceQueryForKind(kind, `${seed}|refq`), kind },
    gapMs: 520,
    typingMs: 700,
  }
}

/**
 * Kernentscheidung: Constraint/Sprechakt zuerst, sonst Legacy freigeben.
 */
export function deliberateAnna(
  belief: AnnaBelief,
  seed: string,
): AnnaDecision {
  const act = belief.lastAct
  const wish = belief.wishedKind
  const block = activeBlockForWish(belief)

  // 0) Soft-Pause — bestätigen und still bleiben
  if (act.type === 'hold') {
    return {
      reason: 'hold',
      lines: [
        pick(
          [
            'Alles klar, ich warte kurz.',
            'Klar, ich warte gerne einen Moment.',
            'Kein Problem, ich warte kurz.',
            'Alles gut, ich warte kurz auf dich.',
          ],
          `${seed}|hold`,
        ),
      ],
      allowLegacy: false,
    }
  }

  // 0b) Pause vorbei — Legacy setzt Anliegen/Clip fort
  if (act.type === 'resume') {
    if (!belief.canPursueWish) {
      return {
        reason: 'resume-blocked',
        lines: [
          pick(
            [
              'Schön, dann machen wir weiter.',
              'Gut, dann geht es weiter.',
            ],
            `${seed}|resumeb`,
          ),
        ],
        allowLegacy: false,
      }
    }
    return {
      reason: 'resume',
      lines: [],
      allowLegacy: true,
    }
  }

  // 0c) Reine Begrüßung — nie nur Gegengruß und Stopp (Legacy führt Anliegen weiter)
  if (act.type === 'greeting') {
    return {
      reason: belief.hasStatedWish ? 'greeting-nudge' : 'greeting-continue-ask',
      lines: [],
      allowLegacy: true,
    }
  }

  // 0c1) Atelier braucht Pause / schreibt später weiter
  {
    const foldedPause = belief.lastAtelierText
      .toLowerCase()
      .replace(/ß/g, 'ss')
      .normalize('NFD')
      .replace(/\p{M}/gu, '')
    if (
      /in einer stunde|spaeter weiter|später weiter|gleich im termin|bin gleich|schreibe? in .{0,12}stunde/.test(
        foldedPause,
      )
    ) {
      return {
        reason: 'wait-later',
        lines: [
          pick(
            [
              'Alles klar, ich warte. Kein Stress.',
              'Passt, melde dich wenn du wieder da bist.',
              'Gerne, ich bin dann erreichbar.',
            ],
            `${seed}|laterEarly`,
          ),
        ],
        allowLegacy: false,
      }
    }
  }

  // 0c2) Atelier nennt einen konkreten Preis → vor Invite/Soft-Ack reagieren
  {
    const priceMatch = belief.lastAtelierText.match(
      /(\d+[.,]?\d*)\s*€|€\s*(\d+[.,]?\d*)|(\d+[.,]?\d*)\s*euro/i,
    )
    if (
      priceMatch &&
      (act.type === 'other' ||
        act.type === 'invite' ||
        act.type === 'offer_other' ||
        act.type === 'preference_ask')
    ) {
      const raw = priceMatch[1] || priceMatch[2] || priceMatch[3]
      const amount = Number(String(raw).replace(',', '.'))
      const foldedPrice = belief.lastAtelierText
        .toLowerCase()
        .normalize('NFD')
        .replace(/\p{M}/gu, '')
      const reconfirm =
        /abgemacht|also .{0,12}\d|nochmal|noch einmal|richtig\?|korrekt\?/.test(
          foldedPrice,
        )
      const isDeposit =
        /anzahlung|anbezahlt|anzahlen|anzahlungs|vorkasse|anzahlungsbetrag/.test(
          foldedPrice,
        )
      const isTaxIncl =
        /inkl\.?\s*mwst|inklusive mwst|inkl\.?\s*mehrwert|mwst\.?\s*klar|ust\.?\s*(klar|inkl)/.test(
          foldedPrice,
        )
      if (Number.isFinite(amount) && amount > 0) {
        if (isDeposit && amount <= 45) {
          return {
            reason: 'deposit-ok',
            lines: [
              pick(
                [
                  `Eine Anzahlung von ${Math.round(amount)} Euro ist in Ordnung. Gerne per Überweisung oder bar.`,
                  `Ja, ${Math.round(amount)} Euro Anzahlung passen. Sag mir einfach, wie du es bevorzugst.`,
                  `Klar, ${Math.round(amount)} Euro Anzahlung gehen für mich.`,
                ],
                `${seed}|deposit`,
              ),
            ],
            allowLegacy: false,
          }
        }
        if ((reconfirm || isTaxIncl) && amount <= 58) {
          return {
            reason: 'price-confirm',
            lines: [
              pick(
                [
                  isTaxIncl
                    ? `Ja, ${Math.round(amount)} Euro inkl. MwSt., abgemacht.`
                    : `Ja, ${Math.round(amount)} Euro, abgemacht.`,
                  `Genau, ${Math.round(amount)} Euro passen. Abgemacht.`,
                  `Passt, ${Math.round(amount)} Euro. Dann sind wir uns einig.`,
                ],
                `${seed}|priceconf`,
              ),
            ],
            allowLegacy: false,
          }
        }
        if (amount <= 45) {
          return {
            reason: 'price-ok',
            lines: [
              pick(
                [
                  'Das ist sogar besser, als ich dachte. Dann bitte so.',
                  'Das passt gut für mich. Dann machen wir das so.',
                ],
                `${seed}|priceok`,
              ),
            ],
            allowLegacy: false,
          }
        }
        if (amount <= 58) {
          return {
            reason: 'price-stretch',
            lines: [
              pick(
                [
                  `Hmm, ${Math.round(amount)} Euro. Wenn du sagst, die Handarbeit steckt darin, vertraue ich dir.`,
                  `${Math.round(amount)} Euro geht noch, wenn die Arbeit das hergibt.`,
                ],
                `${seed}|pricestr`,
              ),
            ],
            allowLegacy: false,
          }
        }
        return {
          reason: 'price-high',
          lines: [
            pick(
              [
                `${Math.round(amount)} Euro wird für mich knapp. Ginge es eher in Richtung 50?`,
                `${Math.round(amount)} Euro sprengt mein Budget etwas. Wäre Richtung 50 Euro machbar?`,
              ],
              `${seed}|pricehi`,
            ),
          ],
          allowLegacy: false,
        }
      }
    }
  }

  // 0c3) Wochentag + fertig/abhol → Termin antworten (auch wenn Akt invite/other)
  {
    const foldedTerm = belief.lastAtelierText
      .toLowerCase()
      .replace(/ß/g, 'ss')
      .normalize('NFD')
      .replace(/\p{M}/gu, '')
    const dayMatch = foldedTerm.match(
      /\b(montag|dienstag|mittwoch|donnerstag|freitag|samstag|sonntag)\b/,
    )
    const asksReady =
      Boolean(dayMatch) &&
      /fertig|abhol|termin|passt|gehen|geht\b|freier|frei(er)?\b/.test(foldedTerm) &&
      (act.type === 'invite' ||
        act.type === 'other' ||
        act.type === 'stock_limit')
    if (asksReady && dayMatch) {
      // Atelier kann Samstag nicht → Sonntag/anderen Tag akzeptieren
      if (
        /sonntag/.test(foldedTerm) &&
        /(erst|leider).{0,24}sonntag|samstag.{0,28}(nicht|schaff)|schaff.{0,20}(nicht|kein).{0,16}samstag|nicht.{0,12}samstag/.test(
          foldedTerm,
        )
      ) {
        return {
          reason: 'termin-sunday',
          lines: [
            pick(
              [
                'Schade wegen Samstag. Sonntag nachmittag geht auch.',
                'Dann Sonntag. Am besten wieder nachmittags.',
                'Ok, Sonntag passt. Lieber nachmittag als vormittag.',
              ],
              `${seed}|delaySun`,
            ),
          ],
          allowLegacy: false,
        }
      }
      const day =
        dayMatch[1].charAt(0).toUpperCase() + dayMatch[1].slice(1)
      const prefersSaturday = /samstag/.test(dayMatch[1])
      if (prefersSaturday) {
        return {
          reason: 'termin-ok',
          lines: [
            pick(
              [
                'Samstag passt gut. Nachmittags abholen wäre mir am liebsten.',
                'Ja, Samstag geht klar. Am besten zwischen 15 und 16 Uhr.',
              ],
              `${seed}|termok`,
            ),
          ],
          allowLegacy: false,
        }
      }
      return {
        reason: 'termin-shift',
        lines: [
          pick(
            [
              `${day} wäre eng. Samstag nachmittag wäre mir lieber, geht das?`,
              `Wegen ${day}: mir wäre Samstag lieber, Nachmittag zur Abholung.`,
              `${day} schaffe ich knapp. Samstag wäre entspannter für mich.`,
            ],
            `${seed}|termshift`,
          ),
        ],
        allowLegacy: false,
      }
    }
  }

  // 0d) Einladung mit Produktmenü → eine Option verbindlich wählen
  if (act.type === 'invite' && act.offeredKinds.length > 0) {
    const accepted = belief.acceptedKindByKunde
    const acceptedOffered =
      Boolean(accepted) &&
      act.offeredKinds.some(
        (k) =>
          k === accepted ||
          (isHoopKind(accepted!) && isHoopKind(k)) ||
          (isKranzFamilyKind(accepted!) && isKranzFamilyKind(k)),
      )
    // Nach bereits getroffener Menüwahl: kurz bestätigen, kein Legacy-Budget/Medien
    if (acceptedOffered && belief.canPursueWish) {
      const label = labelForKind(accepted!)
      return {
        reason: 'invite-already-chosen',
        lines: [
          pick(
            [
              `Genau, beim ${label} bleibe ich.`,
              `Ja, den ${label} hätte ich weiterhin gern.`,
              `Passt, ich bleibe beim ${label}.`,
            ],
            `${seed}|already`,
          ),
        ],
        allowLegacy: false,
      }
    }
    const wishOffered = act.offeredKinds.some(
      (k) =>
        k === wish ||
        (isHoopKind(wish) && isHoopKind(k)) ||
        (isKranzFamilyKind(wish) && isKranzFamilyKind(k)),
    )
    if (wishOffered && belief.canPursueWish) {
      return {
        reason: 'invite',
        lines: [],
        allowLegacy: true,
      }
    }
    const chosen =
      chooseOfferedAlternative(wish, act.offeredKinds) ?? act.offeredKinds[0]
    if (chosen && !isHoopKind(chosen) && beliefAllowsMedia(belief, chosen)) {
      const phrase =
        chosen === 'girlande'
          ? 'eine Girlande'
          : chosen === 'gesteck'
            ? 'ein Gesteck'
            : `einen ${labelForKind(chosen)}`
      const heldKind =
        wish !== chosen && !wishOffered ? wish : belief.deferredKind
      const visit = /komm .{0,32}vorbei|morgen .{0,24}vorbei/.test(
        belief.lastAtelierText
          .toLowerCase()
          .normalize('NFD')
          .replace(/\p{M}/gu, ''),
      )
      const withRef = !belief.hasReferenceImage
      const pickLines = heldKind
        ? [
            `Gern, dann nehme ich ${phrase}. ${deferLaterLine(heldKind, `${seed}|menu0`)}`,
            `Dann nehme ich ${phrase}. ${deferLaterLine(heldKind, `${seed}|menu1`)}`,
            `${phrase.charAt(0).toUpperCase()}${phrase.slice(1)} würde ich gern nehmen. ${deferLaterLine(heldKind, `${seed}|menu2`)}`,
          ]
        : [
            `Gern, dann nehme ich ${phrase}.`,
            `Dann entscheide ich mich für ${phrase}.`,
            `${phrase.charAt(0).toUpperCase()}${phrase.slice(1)} würde ich gern nehmen.`,
          ]
      const visitLine = visit
        ? 'Morgen vorbeizukommen wäre auch schön, wenn das bei dir passt.'
        : undefined
      return {
        reason: 'invite-menu',
        lines: [
          pick(pickLines, `${seed}|menu`),
          ...(visitLine ? [visitLine] : []),
          ...(withRef ? ['Ich schicke dir kurz ein Referenzbild zur Orientierung.'] : []),
        ],
        referenceKind: withRef ? chosen : undefined,
        allowLegacy: false,
      }
    }
  }

  // 0d2) Einladung ohne Menü — nur wenn Wunsch verfolgbar
  if (act.type === 'invite' && belief.canPursueWish) {
    return {
      reason: 'invite',
      lines: [],
      allowLegacy: true,
    }
  }

  // 0e) Positives anderes Produkt — VOR Sperr-Fallback (sonst wird jedes Angebot verschluckt)
  // Schon vom Kunden angenommenes Produkt in einer Folgefrage nicht erneut „annehmen“.
  const offerKind = act.type === 'offer_other' ? act.kind : undefined
  const alreadyOnOffer =
    Boolean(offerKind) &&
    Boolean(belief.acceptedKindByKunde) &&
    (belief.acceptedKindByKunde === offerKind ||
      (isHoopKind(belief.acceptedKindByKunde) && isHoopKind(offerKind)) ||
      ((offerKind === 'strauss' || offerKind === 'bouquet') &&
        (belief.acceptedKindByKunde === 'strauss' ||
          belief.acceptedKindByKunde === 'bouquet')))

  // Falscher Vorname auch bei offer_other / invite abfangen
  {
    const foldedEarly = belief.lastAtelierText
      .toLowerCase()
      .replace(/ß/g, 'ss')
      .normalize('NFD')
      .replace(/\p{M}/gu, '')
    // Nur Anrede an falschen Namen — nicht „Kollegin Lisa“
    if (
      /(hallo|liebe|hi|hey)\s+(marie|julia|lisa|sarah|petra|claudia)\b/.test(foldedEarly)
    ) {
      const dayBit = /samstag/.test(foldedEarly)
        ? ' Samstag nachmittag passt gut.'
        : ''
      return {
        reason: 'name-correct',
        lines: [
          pick(
            [
              `Kleine Korrektur: ich bin Anna Hartmann.${dayBit}`,
              `Ich heiße Anna, nicht der andere Name.${dayBit}`,
              `Kurz: Anna Hartmann hier.${dayBit}`,
            ],
            `${seed}|nameEarly`,
          ),
        ],
        allowLegacy: false,
      }
    }
  }

  // Nach Menüwahl: anderes Produkt anbieten → bei der Wahl bleiben, kein zweiter Pivot
  if (
    act.type === 'offer_other' &&
    act.kind &&
    belief.acceptedKindByKunde &&
    !alreadyOnOffer &&
    beliefAllowsMedia(belief, belief.acceptedKindByKunde)
  ) {
    const kept = belief.acceptedKindByKunde
    const keptLabel = labelForKind(kept)
    const otherLabel = labelForKind(act.kind)
    return {
      reason: 'offer-stick',
      lines: [
        pick(
          [
            `Danke, aber ich bleibe gern beim ${keptLabel}.`,
            `Eigentlich bleibe ich beim ${keptLabel}, den ich eben gewählt habe.`,
            `Den ${otherLabel} lasse ich erstmal. Beim ${keptLabel} fühle ich mich wohler.`,
          ],
          `${seed}|stick`,
        ),
      ],
      allowLegacy: false,
    }
  }

  // Gleiches Produkt, aber Menge/Upsell (zwei Sträuße) → bei einem bleiben
  if (
    act.type === 'offer_other' &&
    alreadyOnOffer &&
    belief.acceptedKindByKunde &&
    /zwei|beide|noch (einen|eine)|gleich zwei|doppelt/.test(
      belief.lastAtelierText
        .toLowerCase()
        .normalize('NFD')
        .replace(/\p{M}/gu, ''),
    )
  ) {
    const label = labelForKind(belief.acceptedKindByKunde)
    return {
      reason: 'qty-one',
      lines: [
        pick(
          [
            `Nein danke, einer reicht. Nur den einen ${label}.`,
            `Lieber nur einen, danke. Mehr brauche ich nicht.`,
            `Eins reicht mir völlig. Beim ${label} bleibe ich.`,
          ],
          `${seed}|qtyoffer`,
        ),
      ],
      allowLegacy: false,
    }
  }

  // Gleiches Produkt, aber Einpacken/Geschenk → auf Zusatz eingehen, nicht nur bestätigen
  if (
    act.type === 'offer_other' &&
    alreadyOnOffer &&
    belief.acceptedKindByKunde &&
    /einpack|als geschenk|geschenkpapier|schon einpacken|schon verpack|schön einpacken|schoen einpacken|verpacken/.test(
      belief.lastAtelierText
        .toLowerCase()
        .normalize('NFD')
        .replace(/\p{M}/gu, ''),
    )
  ) {
    return {
      reason: 'gift-wrap',
      lines: [
        pick(
          [
            'Ja bitte, schön als Geschenk einpacken.',
            'Gerne einpacken, es ist ein Mitbringsel.',
            'Ja, mit Geschenkpapier wäre schön. Danke.',
          ],
          `${seed}|wrap`,
        ),
      ],
      allowLegacy: false,
    }
  }

  // Gleiches Produkt + Regen/Übergabe drinnen
  if (
    act.type === 'offer_other' &&
    alreadyOnOffer &&
    /regen|drinnen|drin ubergeb|drin übergeb|nicht draussen|nicht draußen/.test(
      belief.lastAtelierText
        .toLowerCase()
        .normalize('NFD')
        .replace(/\p{M}/gu, ''),
    )
  ) {
    return {
      reason: 'indoor-ok',
      lines: [
        pick(
          [
            'Klar, bei Regen gerne drinnen im Atelier übergeben.',
            'Ja, drinnen ist völlig in Ordnung.',
            'Passt, dann hole ich ihn bei Regen drinnen ab.',
          ],
          `${seed}|indoor`,
        ),
      ],
      allowLegacy: false,
    }
  }

  // Gleiches Produkt + Duftfrage
  if (
    act.type === 'offer_other' &&
    alreadyOnOffer &&
    /duften|duft|riechen|parfum/.test(
      belief.lastAtelierText
        .toLowerCase()
        .normalize('NFD')
        .replace(/\p{M}/gu, ''),
    )
  ) {
    return {
      reason: 'scent-quiet',
      lines: [
        pick(
          [
            'Eher dezent, bitte nicht zu stark duftend.',
            'Lieber wenig Duft, eher zurückhaltend.',
            'Dezent reicht. Kein intensiver Duft.',
          ],
          `${seed}|scent`,
        ),
      ],
      allowLegacy: false,
    }
  }

  // Fertig-Status / melde mich wenn gebunden
  if (
    (act.type === 'offer_other' || act.type === 'other' || act.type === 'invite') &&
    /(fertig gebunden|wenn .{0,24}fertig|kurz bescheid wenn|status.?update|melde mich .{0,40}fertig)/.test(
      belief.lastAtelierText
        .toLowerCase()
        .normalize('NFD')
        .replace(/\p{M}/gu, ''),
    )
  ) {
    return {
      reason: 'notify-ok',
      lines: [
        pick(
          [
            'Ja gerne, melde dich kurz wenn er fertig ist.',
            'Super, ein kurzes Update wenn er gebunden ist reicht.',
            'Klar, schreib mir einfach Bescheid wenn er fertig ist.',
          ],
          `${seed}|notify`,
        ),
      ],
      allowLegacy: false,
    }
  }

  // Gleiches Produkt erneut angeboten → kurz bestätigen, kein zweites „nehme ich“
  if (act.type === 'offer_other' && alreadyOnOffer && belief.acceptedKindByKunde) {
    const label = labelForKind(belief.acceptedKindByKunde)
    return {
      reason: 'offer-confirm',
      lines: [
        pick(
          [
            `Ja, beim ${label} bleibe ich.`,
            `Genau, den ${label} nehme ich weiterhin.`,
            `Passt, ich bleibe beim ${label}.`,
          ],
          `${seed}|confirm`,
        ),
      ],
      allowLegacy: false,
    }
  }

  if (
    act.type === 'offer_other' &&
    act.kind &&
    !alreadyOnOffer &&
    !isHoopKind(act.kind) &&
    beliefAllowsMedia(belief, act.kind) &&
    !/grosse|grose|groesse|größe|cm|budget|preis|abhol|termin|wann|wie viel|anlass/.test(
      belief.lastAtelierText
        .toLowerCase()
        .normalize('NFD')
        .replace(/\p{M}/gu, ''),
    )
  ) {
    const chosen =
      chooseOfferedAlternative(wish, act.offeredKinds.length ? act.offeredKinds : [act.kind]) ??
      act.kind
    const label = labelForKind(chosen)
    const heldKind =
      belief.deferredKind && belief.deferredKind !== chosen
        ? belief.deferredKind
        : wish !== chosen
          ? wish
          : undefined
    const withRef = !belief.hasReferenceImage
    const lines = act.freshContext
      ? [
          pick(
            heldKind
              ? [
                  `Ah okay, derzeit nur Frischware. Dann wäre ein Blumenstrauß für mich auch schön. ${deferLaterLine(heldKind, `${seed}|f0`)}`,
                  `Verstehe. Wenn gerade keine Trockenblumen gehen, nehme ich gern einen Strauß. ${deferLaterLine(heldKind, `${seed}|f1`)}`,
                  `Alles klar, dann nehme ich jetzt gern einen Strauß. ${deferLaterLine(heldKind, `${seed}|f2`)}`,
                ]
              : [
                  'Ah okay, derzeit nur Frischware. Dann wäre ein Blumenstrauß für mich auch schön.',
                  'Verstehe. Wenn gerade keine Trockenblumen gehen, nehme ich gern einen Strauß.',
                  'Alles klar. Dann nehme ich gern einen Strauß.',
                ],
            `${seed}|fresh`,
          ),
          ...(withRef
            ? ['Ich schicke dir kurz ein Referenzbild zur Orientierung.']
            : []),
        ]
      : [
          pick(
            heldKind
              ? [
                  `Ah okay, dann eher einen ${label}. ${deferLaterLine(heldKind, `${seed}|o0`)}`,
                  `Verstehe. Einen ${label} würde ich gern nehmen. ${deferLaterLine(heldKind, `${seed}|o1`)}`,
                  `Alles klar, dann nehme ich jetzt gern einen ${label}. ${deferLaterLine(heldKind, `${seed}|o2`)}`,
                ]
              : [
                  `Ah okay, dann eher einen ${label}. Das ginge für mich auch.`,
                  `Verstehe. Einen ${label} würde ich gern nehmen.`,
                  `Gerne, einen ${label} nehme ich.`,
                ],
            `${seed}|offer`,
          ),
          ...(withRef
            ? ['Ich leite dir ein freies Referenzbild weiter.']
            : []),
        ]
    return {
      reason: 'offer-other',
      lines,
      referenceKind: withRef
        ? act.freshContext
          ? 'strauss'
          : chosen
        : undefined,
      allowLegacy: false,
    }
  }

  // 0f) Anlass / Empfänger — Antwort bleibt über den Dialog konsistent
  if (act.type === 'occasion_ask') {
    if (belief.hasStatedOccasion && belief.occasion) {
      return {
        reason: 'occasion-confirm',
        lines: [
          pick(
            [
              `Genau, ${belief.occasion.toLowerCase().includes('geschenk') || belief.occasion.toLowerCase().includes('mitbring') ? 'als Mitbringsel zum Verschenken' : `für ${belief.occasion}`}.`,
              belief.occasion.toLowerCase().includes('geschenk') ||
              belief.occasion.toLowerCase().includes('mitbring')
                ? 'Weiterhin zum Verschenken, als kleines Mitbringsel.'
                : `Bleibt bei ${belief.occasion}.`,
            ],
            `${seed}|anlass-confirm`,
          ),
        ],
        allowLegacy: false,
      }
    }
    return {
      reason: 'occasion',
      lines: [
        pick(
          [
            'Als Mitbringsel zum Verschenken, nichts Großes.',
            'Zum Verschenken für eine Freundin, eher als kleines Mitbringsel.',
            'Als Geschenk zum Mitbringen, nicht für ein Event.',
          ],
          `${seed}|anlass`,
        ),
      ],
      allowLegacy: false,
    }
  }

  // 1) Preference / Optik (+ optional Budget in derselben Frage)
  if (act.type === 'preference_ask' || act.type === 'budget_ask') {
    const focus =
      belief.deferredKind && belief.deferredKind !== wish ? wish : wish
    const withBudget = act.type === 'budget_ask' || Boolean(act.alsoBudget)
    const withLook = act.type === 'preference_ask' || Boolean(act.alsoPreference)
    const variants = act.variantOptions ?? []

    // Stil-/A–B–C-/Farbvarianten: eine Option verbindlich wählen
    if (variants.length >= 2) {
      const chosen = chooseVariantOption(variants) ?? variants[0]
      const quietHint =
        /kraeftig|kräftig|ueppig|üppig|dunkel|bunt/i.test(chosen)
          ? ''
          : ' Eher ruhig und nicht zu üppig.'
      return {
        reason: 'variant-choice',
        lines: [
          pick(
            [
              `Am liebsten ${chosen}.${quietHint}`.replace(/\s+/g, ' ').trim(),
              `Ich nehme ${chosen}, eher zurückhaltend.${quietHint}`
                .replace(/\s+/g, ' ')
                .trim(),
              `Dann eher ${chosen}, bitte.${quietHint}`.replace(/\s+/g, ' ').trim(),
            ],
            `${seed}|variant`,
          ),
        ],
        allowLegacy: false,
      }
    }

    return {
      reason:
        act.type === 'budget_ask'
          ? 'budget'
          : withBudget
            ? 'preference-budget'
            : 'preference',
      lines: [
        preferenceBudgetPhrase(
          focus,
          withLook || act.type === 'preference_ask',
          withBudget,
          `${seed}|pref`,
          pick,
        ),
      ],
      allowLegacy: false,
    }
  }

  // 2) Historische oder aktuelle Unavailability
  // Nicht bei preference_ask (oben), offer_other und nicht bei klarem Alternativprodukt
  const pivotKind =
    act.kind && !isHoopKind(act.kind) && act.type !== 'unavailable_until'
      ? act.kind
      : undefined
  if (
    act.type === 'unavailable_until' ||
    (block &&
      !belief.canPursueWish &&
      !pivotKind &&
      act.type !== 'offer_other')
  ) {
    let offeredKinds =
      act.offeredKinds.length > 0
        ? act.offeredKinds
        : belief.offeredKinds.length > 0
          ? belief.offeredKinds
          : belief.lastAct.offeredKinds
    // Frischware ohne explizite Liste → Strauß als konkrete Alternative
    if (
      (act.freshContext || belief.freshOnly) &&
      !offeredKinds.includes('strauss') &&
      !offeredKinds.includes('bouquet')
    ) {
      offeredKinds = [...offeredKinds, 'strauss']
    }
    const synthetic = {
      ...act,
      type: 'unavailable_until' as const,
      untilLabel: act.untilLabel ?? block?.untilLabel,
      kind: act.kind ?? block?.kind ?? wish,
      offeredKinds,
      offersAlternative:
        act.offersAlternative ||
        belief.alternativeOffered ||
        act.freshContext ||
        belief.freshOnly ||
        offeredKinds.length > 0,
      bringOwn: act.bringOwn,
      freshContext: act.freshContext || belief.freshOnly,
    }
    const chosen = chooseOfferedAlternative(wish, offeredKinds)
    return {
      reason: belief.pursuitBlockReason ?? 'unavailable',
      lines: replyForUnavailableUntil(
        synthetic,
        wish,
        `${seed}|unav`,
        pick,
        belief.lastAtelierText,
      ),
      referenceKind:
        chosen && !belief.hasReferenceImage && beliefAllowsMedia(belief, chosen)
          ? chosen
          : undefined,
      allowLegacy: false,
    }
  }

  // 3) Falls Sperre aktiv, aber Atelier nennt ein anderes Produkt → annehmen
  if (block && !belief.canPursueWish && pivotKind && beliefAllowsMedia(belief, pivotKind)) {
    const label = labelForKind(pivotKind)
    const withRef = !belief.hasReferenceImage
    return {
      reason: 'pivot-while-blocked',
      lines: [
        pick(
          [
            `Ah okay, dann eher einen ${label}. Das ginge für mich auch.`,
            `Verstehe. Einen ${label} würde ich gern nehmen.`,
            `Gerne, einen ${label} nehme ich.`,
          ],
          `${seed}|pivotblock`,
        ),
        ...(withRef ? ['Ich leite dir ein freies Referenzbild weiter.'] : []),
      ],
      referenceKind: withRef ? pivotKind : undefined,
      allowLegacy: false,
    }
  }

  // 4) Preference already handled above

  // 5) Material / Goldring
  const bringOwnAsk =
    act.bringOwn ||
    belief.canBringRing ||
    detectBringOwn(
      belief.lastAtelierText
        .toLowerCase()
        .replace(/ß/g, 'ss')
        .normalize('NFD')
        .replace(/\p{M}/gu, ''),
    )
  if (
    act.type === 'material' ||
    (belief.goldRingMissing &&
      (act.type === 'other' || act.type === 'stock_limit'))
  ) {
    const appendSides = (base: string): string[] => {
      const parts = [base]
      if (act.alsoPreference || act.alsoBudget) {
        const focus =
          act.offeredKinds.length > 0
            ? chooseOfferedAlternative(wish, act.offeredKinds) ?? 'strauss'
            : isHoopKind(wish)
              ? 'strauss'
              : wish
        parts.push(
          preferenceBudgetPhrase(
            focus,
            Boolean(act.alsoPreference),
            Boolean(act.alsoBudget),
            `${seed}|mat-pref`,
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
            `${seed}|mat-occ`,
          ),
        )
      }
      return parts.length === 1 ? parts : [`${parts[0]} ${parts.slice(1).join(' ')}`]
    }

    if (bringOwnAsk) {
      return {
        reason: 'material-bring',
        lines: appendSides(
          pick(
            [
              'Ja, ich habe noch einen Goldring zu Hause. Den bringe ich mit, dann kannst du ihn fertig machen.',
              'Einen Goldring habe ich noch. Den bringe ich vorbei, wenn du ihn belegen kannst.',
              'Gut, dass das geht. Ich habe noch einen Ring und bringe ihn mit.',
            ],
            `${seed}|bring`,
          ),
        ),
        allowLegacy: false,
      }
    }
    if (act.offersAlternative || belief.alternativeOffered) {
      return {
        reason: 'material-alt',
        lines: appendSides(
          pick(
            [
              'Ja gerne. Was hättest du denn gerade da? Ein Strauß mit ruhigen Farben wäre auch schön.',
              'Klar, dann schauen wir nach etwas anderem. Mir wären Creme und etwas Rosa recht, eher locker.',
              'Gerne. Ein Strauß oder ein frisches Stück wäre für mich auch in Ordnung.',
            ],
            `${seed}|matalt`,
          ),
        ),
        allowLegacy: false,
      }
    }
    return {
      reason: 'material-ask-alt',
      lines: appendSides(
        pick(
          [
            'Verstehe. Was hättest du denn gerade sonst da?',
            'Alles klar. Hast du gerade etwas in einer ähnlichen Richtung?',
            'Dann zeig mir gern, was du sonst gerade anbieten kannst.',
          ],
          `${seed}|matask`,
        ),
      ),
      allowLegacy: false,
    }
  }

  // 4) Stock / Farben
  if (act.type === 'stock_limit') {
    const folded = belief.lastAtelierText
      .toLowerCase()
      .normalize('NFD')
      .replace(/\p{M}/gu, '')
    const ringDay = detectGoldRingRestockDay(folded)
    if (ringDay) {
      return {
        reason: 'stock-ring-wait',
        lines: [
          pick(
            [
              `Verstehe. Dann warte ich gern bis ${ringDay} auf die Goldringe, damit der Blumenhoop wie geplant geht.`,
              `Alles klar. Bis ${ringDay} kann ich warten, wenn du dann die Goldringe da hast.`,
            ],
            `${seed}|ringwait`,
          ),
        ],
        allowLegacy: false,
      }
    }
    if (act.offersAlternative || belief.alternativeOffered) {
      return {
        reason: 'stock-buy-alt',
        lines: [
          pick(
            [
              'Dann nehmen wir etwas anderes. Creme und etwas Grün wären auch schön, eher locker gebunden.',
              'Andere Farben gehen auch. Mir wären Creme, Weiß und etwas Rosa recht.',
              'Gerne etwas anderes jetzt. Was hast du gerade passend da?',
            ],
            `${seed}|stock`,
          ),
        ],
        allowLegacy: false,
      }
    }
    return {
      reason: 'stock-ask',
      lines: [
        pick(
          [
            'Verstehe. Was hättest du denn gerade sonst da?',
            'Dann zeig mir gern eine Alternative, die du jetzt da hast.',
          ],
          `${seed}|stockask`,
        ),
      ],
      allowLegacy: false,
    }
  }

  // 5a) (Preisreaktion steht früh unter 0c2)

  // 5b) Weiches Atelier-Ack ohne Frage → voller Satz, kein Goldring-Fallback
  if (act.type === 'other') {
    const foldedAct = belief.lastAtelierText
      .toLowerCase()
      .replace(/ß/g, 'ss')
      .normalize('NFD')
      .replace(/\p{M}/gu, '')
    const isQuestion = /\?/.test(belief.lastAtelierText)
    const hasPriceOffer = /(\d+[.,]?\d*)\s*(€|euro)|€\s*(\d+)/i.test(belief.lastAtelierText)
    const wantsMediaFollowup =
      /schoen|schon|ich seh|sehe ich|gefaellt|gefällt|klasse|toll|genau so|video|clip|foto|bild|abspiel/.test(
        foldedAct,
      )
    // Zusatzfrage (Karte/Schleife, nicht Kartenzahlung) nach getroffener Wahl
    if (
      isQuestion &&
      belief.acceptedKindByKunde &&
      !/kartenzahlung|karte zahlen|per karte|mit der karte|ec[- ]?karte/.test(foldedAct) &&
      (/schleife|grusskarte|grußkarte|gruss|gruß|anh[aä]nger|noch (etwas|was) dazu|brauchst du noch/.test(
        foldedAct,
      ) ||
        (/\bkarte\b/.test(foldedAct) && !/zahl/.test(foldedAct))) &&
      !/rechnung/.test(foldedAct)
    ) {
      const piece = labelForKind(belief.acceptedKindByKunde)
      return {
        reason: 'addon-decline',
        lines: [
          pick(
            [
              `Eine Karte brauche ich nicht, danke. Der ${piece} allein reicht mir.`,
              `Danke, ohne Extra. Nur der ${piece} reicht.`,
              `Nein danke, ohne Karte oder Schleife. So ist es gut.`,
            ],
            `${seed}|addon`,
          ),
        ],
        allowLegacy: false,
      }
    }
    // Rechnung
    if (
      (isQuestion || /brauchst du|moechtest du|möchtest du/.test(foldedAct)) &&
      /rechnung|\bbeleg\b|\bquittung\b/.test(foldedAct)
    ) {
      return {
        reason: 'invoice',
        lines: [
          pick(
            [
              'Eine kurze Rechnung wäre nett, ja bitte.',
              'Ja gerne, eine Rechnung für meine Unterlagen.',
              'Wenn es geht, gerne einen Beleg. Danke.',
            ],
            `${seed}|invoice`,
          ),
        ],
        allowLegacy: false,
      }
    }
    // Optional eigenen Rohling/Ring mitbringen? → Atelier liefert
    if (detectOptionalOwnMaterial(foldedAct)) {
      return {
        reason: 'own-blank-decline',
        lines: [
          pick(
            [
              'Nein danke, ich bringe nichts Eigenes mit. Nimm bitte deinen Rohling vom Atelier.',
              'Lieber ohne meinen eigenen Rohling. Du hast ja Material da.',
              'Nein, ich bringe keinen eigenen Ring mit. Mach es bitte aus deinem Bestand.',
            ],
            `${seed}|ownblank`,
          ),
        ],
        allowLegacy: false,
      }
    }
    // Parken / Anfahrt
    if (
      (isQuestion || /park|stellplatz|anfahr/.test(foldedAct)) &&
      /park|parken|stellplatz|wo (finde|park)|anfahr/.test(foldedAct)
    ) {
      return {
        reason: 'parking',
        lines: [
          pick(
            [
              'Ich schaue vor Ort in der Finkenstraße. Ein Parkplatz in der Nähe reicht mir.',
              'Parken finde ich schon. Finkenstraße 56 in Viersen habe ich notiert.',
              'Passt, ich komme mit dem Auto und parke in der Nähe.',
            ],
            `${seed}|park`,
          ),
        ],
        allowLegacy: false,
      }
    }
    // Allergie / Pollen
    if (
      (isQuestion || /allerg|pollen/.test(foldedAct)) &&
      /allerg|pollen|unvertraeg|unverträglich/.test(foldedAct)
    ) {
      return {
        reason: 'no-allergy',
        lines: [
          pick(
            [
              'Nein, keine Allergien. Normale Schnittblumen sind für mich in Ordnung.',
              'Gegen Pollen bin ich unempfindlich. Du kannst normal binden.',
              'Keine bekannten Allergien, danke der Nachfrage.',
            ],
            `${seed}|allergy`,
          ),
        ],
        allowLegacy: false,
      }
    }
    // Sprachnachricht
    if (
      (isQuestion || /sprachnachricht|sprachmemo|voicemail|sprachmail/.test(foldedAct)) &&
      /sprachnachricht|sprachmemo|voicemail|sprachmail|schicke? dir .{0,20}sprach/.test(
        foldedAct,
      )
    ) {
      return {
        reason: 'voice-ok',
        lines: [
          pick(
            [
              'Klar, Sprachnachricht geht. Ich höre sie mir an.',
              'Gerne, schick ruhig eine Sprachnachricht.',
              'Ok, Sprachnachricht ist fein. Text geht auch.',
            ],
            `${seed}|voice`,
          ),
        ],
        allowLegacy: false,
      }
    }
    // Kerze dazu?
    if (
      (isQuestion || /soll |oder lieber/.test(foldedAct)) &&
      /kerze/.test(foldedAct)
    ) {
      return {
        reason: 'candle-decline',
        lines: [
          pick(
            [
              'Lieber ohne Kerze, nur der Strauß reicht.',
              'Ohne Kerze bitte. So ist es mir lieber.',
              'Nein danke, keine Kerze in die Mitte.',
            ],
            `${seed}|candle`,
          ),
        ],
        allowLegacy: false,
      }
    }
    // „Bist du noch da?“
    if (
      /bist du (noch )?da|noch erreichbar|horst du|hörst du|anna\??\s*$/.test(foldedAct) ||
      (isQuestion && /noch da\b/.test(foldedAct))
    ) {
      return {
        reason: 'presence-ack',
        lines: [
          pick(
            [
              'Ja, ich bin da. Schreib ruhig weiter.',
              'Ja, hier. Ich lese mit.',
              'Bin da. Was möchtest du noch klären?',
            ],
            `${seed}|here`,
          ),
        ],
        allowLegacy: false,
      }
    }
    // Falscher Vorname (Marie etc.) → korrigieren
    if (/(hallo|liebe|hi|hey)\s+(marie|julia|lisa|sarah|petra|claudia)\b/.test(foldedAct)) {
      const dayBit = /samstag/.test(foldedAct)
        ? ' Samstag nachmittag passt gut.'
        : ''
      return {
        reason: 'name-correct',
        lines: [
          pick(
            [
              `Kleine Korrektur: ich bin Anna Hartmann.${dayBit}`,
              `Ich heiße Anna, nicht der andere Name.${dayBit}`,
              `Kurz: Anna Hartmann hier.${dayBit}`,
            ],
            `${seed}|name`,
          ),
        ],
        allowLegacy: false,
      }
    }
    // Abholfenster enger (14 statt 15-16)
    if (
      (isQuestion || /geht|passt|statt|oder/.test(foldedAct)) &&
      /\d{1,2}\s*uhr/.test(foldedAct) &&
      /(statt|frueher|früher|auch \d|oder \d)/.test(foldedAct) &&
      !/unter der woche|oeffnungs|öffnungs|di\s*[-–]?\s*fr|mo\s*[-–]?\s*fr/.test(foldedAct)
    ) {
      return {
        reason: 'time-window-keep',
        lines: [
          pick(
            [
              '14 Uhr wird knapp. 15 bis 16 Uhr wäre mir lieber.',
              'Lieber zwischen 15 und 16 Uhr, 14 Uhr schaffe ich schwer.',
              'Am liebsten weiterhin 15-16 Uhr. Früher wird es eng.',
            ],
            `${seed}|twindow`,
          ),
        ],
        allowLegacy: false,
      }
    }
    // Größe doch kleiner?
    if (
      (isQuestion || /soll ich|doch|lieber/.test(foldedAct)) &&
      /kleiner|handlicher|etwas klein|zierlicher|nicht so gro/.test(foldedAct) &&
      /(machen|binden|nehmen|soll|doch|lieber|ok)/.test(foldedAct)
    ) {
      return {
        reason: 'size-smaller',
        lines: [
          pick(
            [
              'Ja bitte, etwas kleiner und handlich.',
              'Gerne etwas kleiner, nicht zu groß.',
              'Ja, lieber etwas kleiner. Danke.',
            ],
            `${seed}|sizesm`,
          ),
        ],
        allowLegacy: false,
      }
    }
    // Trinkgeld
    if (/trinkgeld|tip\b|bakschisch/.test(foldedAct)) {
      return {
        reason: 'tip-decline',
        lines: [
          pick(
            [
              'Kein Trinkgeld nötig, der Preis reicht völlig.',
              'Danke, aber ohne Trinkgeld. Das ist mir lieber.',
              'Nein danke, Trinkgeld brauche ich nicht.',
            ],
            `${seed}|tip`,
          ),
        ],
        allowLegacy: false,
      }
    }
    // Warteliste Goldring
    if (
      /warteliste|vormerken|auf die liste|vormerk/.test(foldedAct) &&
      /(goldring|hoop|blumenhoop|ring)/.test(foldedAct)
    ) {
      return {
        reason: 'waitlist-later',
        lines: [
          pick(
            [
              'Für den Goldring gerne vormerken. Den Strauß nehme ich jetzt trotzdem.',
              'Ja, setz mich gern auf die Liste. Aktuell bleibe ich beim Strauß.',
              'Warteliste für später gerne. Jetzt mache ich den Strauß fertig.',
            ],
            `${seed}|wait`,
          ),
        ],
        allowLegacy: false,
      }
    }
    // Alles klar so? / noch etwas ändern?
    if (
      isQuestion &&
      /alles klar so|noch etwas andern|noch etwas ändern|soll ich noch etwas|oder soll ich noch/.test(
        foldedAct,
      )
    ) {
      return {
        reason: 'confirm-all',
        lines: [
          pick(
            [
              'Alles klar so, nichts mehr ändern. Danke.',
              'Passt genau so. Bitte nichts mehr umstellen.',
              'So ist es gut, keine Änderung mehr nötig.',
            ],
            `${seed}|confirmall`,
          ),
        ],
        allowLegacy: false,
      }
    }
    // Kollegin übernimmt Ausgabe
    if (/kollegin|kollege|uebernimmt|übernimmt die ausgabe|uebernimmt die ausgabe/.test(foldedAct)) {
      return {
        reason: 'staff-ok',
        lines: [
          pick(
            [
              'Alles klar, wenn deine Kollegin ausgibt. Passt für mich.',
              'Ja, das ist in Ordnung. Hauptsache ich kann abholen.',
              'Passt, egal wer ausgibt. Danke fürs Bescheid.',
            ],
            `${seed}|staff`,
          ),
        ],
        allowLegacy: false,
      }
    }
    // Kartenzahlung (nicht Grußkarte)
    if (
      /kartenzahlung|karte zahlen|per karte|ec[- ]?karte|mit karte/.test(foldedAct) &&
      /ok|okay|geht|falls|wenn/.test(foldedAct)
    ) {
      return {
        reason: 'payment-card',
        lines: [
          pick(
            [
              'Kartenzahlung geht klar. Bargeld habe ich auch dabei.',
              'Beides ok. Karte oder bar, wie es bei dir leichter ist.',
              'Super, dann Karte falls nötig. Passt für mich.',
            ],
            `${seed}|paycard`,
          ),
        ],
        allowLegacy: false,
      }
    }
    // Noch etwas vergessen?
    if (
      isQuestion &&
      /vergessen|noch etwas .*wissen|sollte ich wissen|noch was offenes/.test(foldedAct)
    ) {
      return {
        reason: 'nothing-else',
        lines: [
          pick(
            [
              'Nein, mir fällt nichts mehr ein. So passt es.',
              'Nichts vergessen von meiner Seite. Danke.',
              'Alles gesagt. Mehr brauche ich nicht zu ergänzen.',
            ],
            `${seed}|nothing`,
          ),
        ],
        allowLegacy: false,
      }
    }
    // Türcode / Zugang
    if (/code|turcode|türcode|klingel|zugang/.test(foldedAct) && /samstag|schick|sende|ok/.test(foldedAct)) {
      return {
        reason: 'door-code-ok',
        lines: [
          pick(
            [
              'Alles klar, schick mir den Code Samstag früh.',
              'Passt, den Türcode brauche ich dann. Danke.',
              'Ja gerne, Code Samstag früh reicht mir.',
            ],
            `${seed}|door`,
          ),
        ],
        allowLegacy: false,
      }
    }
    // In einer Stunde / später weiterschreiben
    if (
      /in einer stunde|spaeter weiter|später weiter|gleich im termin|bin gleich|schreibe? in/.test(
        foldedAct,
      )
    ) {
      return {
        reason: 'wait-later',
        lines: [
          pick(
            [
              'Alles klar, ich warte. Kein Stress.',
              'Passt, melde dich wenn du wieder da bist.',
              'Gerne, ich bin dann erreichbar.',
            ],
            `${seed}|later`,
          ),
        ],
        allowLegacy: false,
      }
    }
    // Regen → drinnen ok
    if (/regen|drinnen|drin ubergeb|drin übergeb|nicht draussen|nicht draußen/.test(foldedAct)) {
      return {
        reason: 'indoor-ok',
        lines: [
          pick(
            [
              'Klar, bei Regen gerne drinnen im Atelier übergeben.',
              'Ja, drinnen ist völlig in Ordnung.',
              'Passt, dann hole ich ihn bei Regen drinnen ab.',
            ],
            `${seed}|indoor2`,
          ),
        ],
        allowLegacy: false,
      }
    }
    // Duft intensiv vs dezent
    if (/duften|duft|riechen|parfum/.test(foldedAct)) {
      return {
        reason: 'scent-quiet',
        lines: [
          pick(
            [
              'Eher dezent, bitte nicht zu stark duftend.',
              'Lieber wenig Duft, eher zurückhaltend.',
              'Dezent reicht. Kein intensiver Duft.',
            ],
            `${seed}|scent2`,
          ),
        ],
        allowLegacy: false,
      }
    }
    // Anderes Referenzbild anbieten
    if (
      /referenz|bild passt nicht|anderes (bild|foto)|anderes suchen|neues referenz/.test(
        foldedAct,
      ) &&
      (isQuestion || /soll ich|suchen|schau/.test(foldedAct))
    ) {
      return {
        reason: 'ref-replace',
        lines: [
          pick(
            [
              'Gerne ein anderes Bild zur Orientierung, danke.',
              'Ja bitte, such gern ein passenderes Referenzbild.',
              'Eins anderes wäre hilfreich, wenn du magst.',
            ],
            `${seed}|refrep`,
          ),
        ],
        allowLegacy: false,
      }
    }
    // Atelier schreibt morgen / braucht Zeit
    if (
      /schreib(e)? dir morgen|melde mich morgen|schau(e)? mir das|in ruhe an|bis morgen/.test(
        foldedAct,
      )
    ) {
      return {
        reason: 'wait-tomorrow',
        lines: [
          pick(
            [
              'Alles klar, ich warte bis morgen. Kein Stress.',
              'Gerne, schau in Ruhe. Bis morgen dann.',
              'Passt, ich bin morgen wieder erreichbar.',
            ],
            `${seed}|tmrw`,
          ),
        ],
        allowLegacy: false,
      }
    }
    // Umbuchung auf Sonntag (Samstag voll)
    if (
      /umbuch|sonntag/.test(foldedAct) &&
      /(sonntag|samstag.{0,24}voll|voll.{0,16}samstag)/.test(foldedAct)
    ) {
      return {
        reason: 'termin-sunday',
        lines: [
          pick(
            [
              'Schade wegen Samstag. Sonntag nachmittag geht auch.',
              'Dann Sonntag. Am besten wieder nachmittags.',
              'Ok, Sonntag passt. Lieber nachmittag als vormittag.',
            ],
            `${seed}|sund`,
          ),
        ],
        allowLegacy: false,
      }
    }
    // Öffnungszeiten unter der Woche → Anna bevorzugt Samstag Nachmittag
    if (
      (isQuestion || /oeffnungs|öffnungs|unter der woche|wochentag/.test(foldedAct)) &&
      /(\bdienstag\b|\bmittwoch\b|\bdonnerstag\b|\bfreitag\b|\bdi\b\s*[-–.]?\s*\bfr\b|\bmo\b\s*[-–.]?\s*\bfr\b)/.test(
        foldedAct,
      ) &&
      /\d/.test(foldedAct) &&
      /uhr|offen|\bda\b|erreichbar|unter der woche/.test(foldedAct)
    ) {
      return {
        reason: 'hours-weekend',
        lines: [
          pick(
            [
              'Unter der Woche wird es eng. Samstag nachmittag zwischen 15 und 16 Uhr wäre mir am liebsten.',
              'Am Wochenende passt es besser. Samstag 15-16 Uhr zur Abholung?',
              'Wochentags schaffe ich es kaum. Samstag nachmittag wäre ideal.',
            ],
            `${seed}|hours`,
          ),
        ],
        allowLegacy: false,
      }
    }
    // Geschenk einpacken (auch wenn Akt „other“)
    if (
      (isQuestion || /soll ich|einpack|verpack/.test(foldedAct)) &&
      /einpack|geschenkpapier|als geschenk|verpacken/.test(foldedAct)
    ) {
      return {
        reason: 'gift-wrap',
        lines: [
          pick(
            [
              'Ja bitte, schön als Geschenk einpacken.',
              'Gerne einpacken, es ist ein Mitbringsel.',
              'Ja, mit Geschenkpapier wäre schön. Danke.',
            ],
            `${seed}|wrap2`,
          ),
        ],
        allowLegacy: false,
      }
    }
    // Farbkorrektur (doch lieber ohne Rosa / nur Creme)
    if (
      /(doch lieber|lieber ohne|statt|nur noch|korrigier)/.test(foldedAct) &&
      /(creme|weiss|weiß|rosa|farbe|ohne rosa)/.test(foldedAct)
    ) {
      return {
        reason: 'color-revise',
        lines: [
          pick(
            [
              'Ja bitte, ohne Rosa. Nur Creme und Weiß.',
              'Genau, Creme und Weiß reicht. Rosa lasse ich weg.',
              'Passt, nur Creme und Weiß — ohne Rosa.',
            ],
            `${seed}|colorrev`,
          ),
        ],
        allowLegacy: false,
      }
    }
    // Anruf vs. WhatsApp
    if (
      isQuestion &&
      /anrufen|anruf|telefonieren|kurz anrufen|kann ich dich/.test(foldedAct)
    ) {
      return {
        reason: 'prefer-chat',
        lines: [
          pick(
            [
              'Schreib mir lieber hier auf WhatsApp, das ist für mich einfacher.',
              'Am liebsten hier im Chat, ein Anruf ist gerade unpraktisch.',
              'WhatsApp reicht mir völlig. Da bin ich gut erreichbar.',
            ],
            `${seed}|noCall`,
          ),
        ],
        allowLegacy: false,
      }
    }
    // Absage-Hinweis / Flexibilität
    if (
      /absagen|stornier|bescheid sagen|falls du .{0,24}(nicht|absag)/.test(foldedAct)
    ) {
      return {
        reason: 'cancel-ok',
        lines: [
          pick(
            [
              'Alles klar, ich melde mich rechtzeitig, falls sich etwas ändert.',
              'Passt. Wenn etwas dazwischenkommt, schreibe ich dir Bescheid.',
              'Gut, dann wissen wir Bescheid. Ich gebe rechtzeitig Bescheid, falls nötig.',
            ],
            `${seed}|cancel`,
          ),
        ],
        allowLegacy: false,
      }
    }
    // Zweite Stückzahl / Upsell Menge
    if (
      (isQuestion || /soll ich/.test(foldedAct)) &&
      /zwei|beide|noch (einen|eine|eins)|gleich zwei|doppelt/.test(foldedAct) &&
      /(strau|gesteck|kranz|hoop|girlande|stuck|stück)/.test(foldedAct)
    ) {
      const piece = belief.acceptedKindByKunde
        ? labelForKind(belief.acceptedKindByKunde)
        : labelForKind(wish)
      return {
        reason: 'qty-one',
        lines: [
          pick(
            [
              `Nein danke, einer reicht. Nur den einen ${piece}.`,
              `Lieber nur einen, danke. Mehr brauche ich nicht.`,
              `Eins reicht mir völlig. Beim ${piece} bleibe ich.`,
            ],
            `${seed}|qty`,
          ),
        ],
        allowLegacy: false,
      }
    }
    // Stil nochmal kräftiger? (foldedAct: ä→a, so kraftig nicht kraeftig)
    if (
      (isQuestion || /soll ich/.test(foldedAct)) &&
      /kraftig|kraeftig|uppig|ueppig|bunter|auffallig|auffaellig/.test(foldedAct) &&
      /(binden|machen|doch|eher|lieber)/.test(foldedAct)
    ) {
      return {
        reason: 'style-keep-quiet',
        lines: [
          pick(
            [
              'Lieber ruhig bleiben, Creme und etwas Rosa, nicht zu kräftig.',
              'Nein, bitte eher zurückhaltend. Nicht zu üppig.',
              'Am liebsten weiterhin ruhig und nicht zu kräftig.',
            ],
            `${seed}|quiet`,
          ),
        ],
        allowLegacy: false,
      }
    }
    // Adresse bestätigen
    if (
      isQuestion &&
      /finken|viersen|41749|richtig\?|korrekt\?|stimmt das/.test(foldedAct) &&
      /adresse|strasse|straße|richtig|korrekt|stimmt/.test(foldedAct)
    ) {
      return {
        reason: 'address-confirm',
        lines: [
          pick(
            [
              'Ja genau, Finkenstraße 56 in Viersen.',
              'Stimmt, Finkenstraße 56, 41749 Viersen.',
            ],
            `${seed}|addr`,
          ),
        ],
        allowLegacy: false,
      }
    }
    // Zahlungsart
    if (
      (isQuestion || /ok\b|okay|in ordnung|geht das/.test(foldedAct)) &&
      /bar oder|uberweisung oder|ueberweisung oder|paypal|bezahl|zahlung|nur uberweisung|nur ueberweisung|geht nur|kein bargeld|kein bar\b/.test(
        foldedAct,
      )
    ) {
      if (
        /nur (ueberweisung|uberweisung)|geht nur .{0,16}(ueberweisung|uberweisung)/.test(
          foldedAct,
        )
      ) {
        return {
          reason: 'payment-transfer',
          lines: [
            pick(
              [
                'Alles klar, dann Überweisung. Das geht für mich.',
                'Überweisung passt. Schick mir einfach die Daten zur Abholung.',
              ],
              `${seed}|paytr`,
            ),
          ],
          allowLegacy: false,
        }
      }
      if (
        /nur paypal|paypal.{0,24}(kein|ohne)|kein(e)? (bargeld|barzahlung)|kein bar\b/.test(
          foldedAct,
        )
      ) {
        return {
          reason: 'payment-paypal',
          lines: [
            pick(
              [
                'PayPal geht klar. Bargeld brauche ich nicht.',
                'Alles klar, dann PayPal. Das ist für mich in Ordnung.',
                'PayPal passt mir. Kein Problem ohne Bargeld.',
              ],
              `${seed}|paypal`,
            ),
          ],
          allowLegacy: false,
        }
      }
      return {
        reason: 'payment',
        lines: [
          pick(
            [
              'Beides geht für mich. Am liebsten bar bei der Abholung.',
              'Bar bei der Abholung wäre mir am liebsten, Überweisung geht auch.',
            ],
            `${seed}|pay`,
          ),
        ],
        allowLegacy: false,
      }
    }
    // Farbe nicht da, Alternative angeboten
    if (
      /(rosa|creme|weiss|weiß|gruen|grün|pink).{0,48}(nicht|keine|kein)|habe ich (gerade )?nicht/.test(
        foldedAct,
      ) &&
      /(creme|weiss|weiß|gruen|grün|rosa).{0,40}(ginge|geht|moeglich|möglich|habe)/.test(foldedAct)
    ) {
      return {
        reason: 'color-sub',
        lines: [
          pick(
            [
              'Creme und Weiß geht klar. Rosa lasse ich weg.',
              'Alles klar, dann Creme und Weiß. Das reicht mir.',
              'Passt, ohne Rosa. Creme und Weiß sind schön.',
            ],
            `${seed}|colorsub`,
          ),
        ],
        allowLegacy: false,
      }
    }
    // Pampas / Stil-Detail nachfragen
    if (
      (isQuestion || /einverstanden|ok\b|okay|passt das/.test(foldedAct)) &&
      /pampas|eukalyptus|trockenblumen|goldring/.test(foldedAct)
    ) {
      if (/pampas/.test(foldedAct)) {
        return {
          reason: 'style-pampas',
          lines: [
            pick(
              [
                'Pampas eher wenig, nur ganz sparsam. Nicht zu üppig.',
                'Ein bisschen Pampas geht, aber bitte nur sparsam.',
                'Pampas nur dezent, am liebsten kaum.',
              ],
              `${seed}|pampas`,
            ),
          ],
          allowLegacy: false,
        }
      }
      if (/eukalyptus/.test(foldedAct)) {
        // Ausverkauft / Ersatzgrün → anderes Grün ok, nicht „eher wenig Eukalyptus“
        if (
          /alle|nicht da|ausverkauft|kein euk|fehlt|anderes gruen|anderes grün|statt euk/.test(
            foldedAct,
          )
        ) {
          return {
            reason: 'green-sub',
            lines: [
              pick(
                [
                  'Anderes Grün geht klar. Ohne Eukalyptus ist auch fein.',
                  'Ja gerne, nimm anderes Grün. Eukalyptus brauche ich nicht.',
                  'Passt, anderes Grün ist völlig in Ordnung.',
                ],
                `${seed}|greensub`,
              ),
            ],
            allowLegacy: false,
          }
        }
        return {
          reason: 'style-euk',
          lines: [
            pick(
              [
                'Eukalyptus eher wenig, wenn überhaupt.',
                'Ohne Eukalyptus wäre mir lieber, oder nur ganz sparsam.',
              ],
              `${seed}|euk`,
            ),
          ],
          allowLegacy: false,
        }
      }
    }
    // Termin: früher als Samstag nicht möglich
    if (
      /frueher als samstag|früher als samstag|vor samstag|nicht vor samstag|samstag.{0,24}(nicht )?schaff|schaff.{0,24}nicht.{0,24}samstag/.test(
        foldedAct,
      ) ||
      (/schaff(e)? ich nicht/.test(foldedAct) && /samstag|frueher|früher/.test(foldedAct))
    ) {
      return {
        reason: 'termin-accept-saturday',
        lines: [
          pick(
            [
              'Alles klar, dann Samstag. Nachmittags abholen wäre mir am liebsten.',
              'Passt, Samstag geht gut. Am besten zwischen 15 und 16 Uhr.',
            ],
            `${seed}|termsat`,
          ),
        ],
        allowLegacy: false,
      }
    }
    // Extra-Foto anbieten
    if (
      isQuestion &&
      /noch (ein )?foto|weiteres foto|noch (ein )?bild|noch was zeigen|soll ich dir .+ (foto|bild)/.test(
        foldedAct,
      )
    ) {
      return {
        reason: 'extra-photo',
        lines: [
          pick(
            [
              'Gerne, wenn du noch eins hast. Zur Orientierung hilft mir das.',
              'Ja bitte, noch ein Foto wäre schön.',
              'Danke, eins reicht eigentlich. Wenn du magst, gerne noch eins.',
            ],
            `${seed}|extfoto`,
          ),
        ],
        allowLegacy: false,
      }
    }
    // Positives Feedback zum Referenzbild / Stück
    if (
      !isQuestion &&
      /(referenz|bild|foto).{0,40}(gut|passt|schoen|schön)|sieht gut|passt gut so|gefällt mir/.test(
        foldedAct,
      ) &&
      belief.hasStatedWish
    ) {
      const kept = belief.acceptedKindByKunde
        ? labelForKind(belief.acceptedKindByKunde)
        : labelForKind(wish)
      return {
        reason: 'ref-ack',
        lines: [
          pick(
            [
              `Freut mich. Dann bleiben wir bei dem ${kept}.`,
              `Schön, dann passen wir den ${kept} so an.`,
              `Gut, dann machen wir den ${kept} in der Richtung.`,
            ],
            `${seed}|refack`,
          ),
        ],
        allowLegacy: false,
      }
    }
    if (!isQuestion && !wantsMediaFollowup && !hasPriceOffer && belief.hasStatedWish) {
      const closingThanks =
        /danke|super|klasse|toll|perfekt/.test(foldedAct)
      const closingWait =
        /melde mich|ich melde|bis spaeter|bis später|schau(e)? ich|schaue mir|kucke ich|gucke ich/.test(
          foldedAct,
        )
      const kept =
        belief.acceptedKindByKunde && !isHoopKind(belief.acceptedKindByKunde)
          ? labelForKind(belief.acceptedKindByKunde)
          : undefined
      const closingLines = closingThanks
        ? kept
          ? [
              `Alles klar, beim ${kept} bleibe ich dabei. Ich warte gern auf deine Rückmeldung.`,
              `Gerne, den ${kept} behalte ich im Kopf. Melde dich einfach, wenn du soweit bist.`,
              `Super, dann warte ich kurz. Beim ${kept} bleiben wir.`,
            ]
          : [
              'Alles klar, ich warte gern auf deine Rückmeldung.',
              'Gerne, ich bin da, wenn du soweit bist.',
              'Super, dann warte ich kurz, bis du dich meldest.',
            ]
        : closingWait
          ? kept
            ? [
                `Alles klar, beim ${kept} bleibe ich dabei. Schau in Ruhe, ich warte kurz.`,
                `Gerne, den ${kept} behalte ich im Kopf. Ich warte kurz.`,
                `Gut, dann warte ich kurz. Beim ${kept} bleiben wir.`,
              ]
            : [
                'Alles klar, schau in Ruhe. Ich warte kurz.',
                'Gerne, ich warte kurz, bis du soweit bist.',
                'Gut, dann warte ich einen Moment.',
              ]
          : kept
            ? [
                `Alles klar, beim ${kept} bleibe ich dabei.`,
                `Gut, dann machen wir mit dem ${kept} weiter.`,
                `Passt so, den ${kept} behalte ich im Kopf.`,
              ]
            : [
                'Alles klar, dann machen wir so weiter.',
                'Gut, ich bleibe dabei.',
                'Passt so für mich, wir können weitermachen.',
              ]
      return {
        reason: 'soft-ack',
        lines: [pick(closingLines, `${seed}|softack`)],
        allowLegacy: false,
      }
    }
  }

  // 5) Sicherheitsnetz: Goldring fehlt / Alternative im Raum — nie Legacy-Goldring-Bestätigung
  if (
    belief.goldRingMissing ||
    (belief.alternativeOffered && !belief.canPursueWish) ||
    (act.offersAlternative && belief.goldRingMissing)
  ) {
    if (act.offeredKinds.length > 0 || belief.offeredKinds.length > 0) {
      const pool = act.offeredKinds.length > 0 ? act.offeredKinds : belief.offeredKinds
      const chosen = chooseOfferedAlternative(wish, pool) ?? pool[0]
      if (chosen && !isHoopKind(chosen)) {
        const phrase =
          chosen === 'girlande'
            ? 'eine Girlande'
            : chosen === 'gesteck'
              ? 'ein Gesteck'
              : `einen ${labelForKind(chosen)}`
        return {
          reason: 'safety-offer',
          lines: [
            pick(
              [
                `Verstehe. Dann nehme ich gern ${phrase}.`,
                `Alles klar, dann eher ${phrase}.`,
                `Gern, ${phrase} wäre für mich auch schön.`,
              ],
              `${seed}|safeoffer`,
            ),
          ],
          referenceKind: belief.hasReferenceImage ? undefined : chosen,
          allowLegacy: false,
        }
      }
    }
    return {
      reason: 'safety-alt',
      lines: [
        pick(
          [
            'Verstehe. Was hättest du denn gerade sonst da? Ein Strauß mit ruhigen Farben wäre auch schön.',
            'Alles klar. Dann zeig mir gern eine Alternative, die du jetzt da hast.',
            'Gerne etwas anderes. Mir wären Creme und etwas Rosa recht, eher locker.',
          ],
          `${seed}|safealt`,
        ),
      ],
      allowLegacy: false,
    }
  }

  // 6) Sonst: Legacy (Medien, Preis, …) nur wenn Verfolgung erlaubt
  return {
    reason: 'legacy',
    lines: [],
    allowLegacy:
      !belief.paused &&
      !belief.goldRingMissing &&
      (belief.canPursueWish || act.type === 'other' || act.type === 'invite'),
  }
}

export function decisionToPlan(decision: AnnaDecision, seed: string): AnnaPlan {
  const bubbles = textBubbles(decision.lines, seed)
  if (decision.referenceKind) {
    bubbles.push(referenceBubble(decision.referenceKind, seed, bubbles.length))
  }
  return { bubbles }
}

/**
 * Deterministischer Exzellenz-Pfad: Belief → Deliberation → Guardrails.
 * Gibt null zurück, wenn Legacy (Medien/Preis) weiterlaufen soll.
 */
export function planAnnaAgentSync(
  conversation: Conversation,
  options: AnnaPlanOptions & { seed: string } ,
): AnnaPlan | null {
  const belief = buildAnnaBelief(conversation)
  const decision = deliberateAnna(belief, options.seed)
  if (decision.allowLegacy) return null

  let plan = decisionToPlan(decision, options.seed)
  const guarded = applyAnnaGuardrails(plan, belief)
  if (!guarded.ok) {
    plan = fallbackPlanForBelief(belief)
    return applyAnnaGuardrails(plan, belief).plan
  }
  return guarded.plan
}

export function getAnnaBelief(conversation: Conversation): AnnaBelief {
  return buildAnnaBelief(conversation)
}

type LlmBubble = { text: string }
type LlmResponse = {
  lines?: string[]
  bubbles?: LlmBubble[]
  sendReference?: boolean
  referenceKind?: FloristryKind
}

/**
 * Optionaler LLM-Pfad. Endpoint muss JSON liefern:
 * { "lines": ["...", "..."], "sendReference": false, "referenceKind": "strauss" }
 */
export async function planAnnaAgentAsync(
  conversation: Conversation,
  options: AnnaPlanOptions & { seed: string } = { seed: 'live' },
): Promise<{ plan: AnnaPlan | null; source: 'llm' | 'deterministic' | 'legacy' }> {
  const belief = buildAnnaBelief(conversation)
  const deterministic = deliberateAnna(belief, options.seed)

  const endpoint =
    typeof import.meta !== 'undefined' && import.meta.env?.VITE_ANNA_AGENT_ENDPOINT
      ? String(import.meta.env.VITE_ANNA_AGENT_ENDPOINT)
      : ''

  if (endpoint && !options.entropy?.startsWith('test-')) {
    try {
      const recent = conversation.messages
        .slice(-12)
        .map((m) => ({
          from: m.from,
          text: m.text ?? m.transcript ?? '',
          kind: m.kind,
        }))
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          policy: ANNA_POLICY_FOR_LLM,
          belief,
          recent,
          seed: options.seed,
        }),
      })
      if (response.ok) {
        const data = (await response.json()) as LlmResponse
        const lines =
          data.lines ??
          data.bubbles?.map((b) => b.text).filter(Boolean) ??
          []
        if (lines.length > 0) {
          const decision: AnnaDecision = {
            reason: 'llm',
            lines: lines.slice(0, 3),
            referenceKind:
              data.sendReference && data.referenceKind && beliefAllowsMedia(belief, data.referenceKind)
                ? data.referenceKind
                : undefined,
            allowLegacy: false,
          }
          let plan = decisionToPlan(decision, options.seed)
          const guarded = applyAnnaGuardrails(plan, belief)
          if (guarded.ok) {
            return { plan: guarded.plan, source: 'llm' }
          }
        }
      }
    } catch {
      // Fallback deterministisch
    }
  }

  if (!deterministic.allowLegacy) {
    let plan = decisionToPlan(deterministic, options.seed)
    const guarded = applyAnnaGuardrails(plan, belief)
    if (!guarded.ok) {
      plan = fallbackPlanForBelief(belief)
      return { plan: applyAnnaGuardrails(plan, belief).plan, source: 'deterministic' }
    }
    return { plan: guarded.plan, source: 'deterministic' }
  }

  return { plan: null, source: 'legacy' }
}
