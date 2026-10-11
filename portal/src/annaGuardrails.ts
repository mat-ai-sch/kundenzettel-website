/**
 * Guardrails — jede Anna-Antwort (deterministisch oder LLM) muss hier durch.
 */

import type { AnnaBubble, AnnaPlan } from './annaBot'
import { familyKeyFor, type AnnaBelief } from './annaBelief'
import { isHoopKind, labelForKind, type FloristryKind } from './floristryLexicon'
import { chooseOfferedAlternative, isKranzFamily as kranzFamily } from './annaDialogRules'

const BANNED =
  /\u2014|\u2013|soll ich warten|worum es geht|kurz gesagt|zusammengefasst|dar[uü]ber hinaus|des weiteren|nicht nur .{0,40}sondern auch|mir schwebt|schreib,? wenn du|falls du m[oö]chtest|hier ist ein|anbei|ich verstehe,? dass|wie kann ich helfen|als ki|sprachmodell|was k[oö]nntest du mir jetzt sonst|was hast du gerade da\?|was k[oö]nntest du mir jetzt sonst anbieten|ich bin da\.?$|hi,? ich bin da|hallo\.? ich bin da|melde dich einfach|einzigartig|atemberaubend|spektakul[aä]r|spannend(e|er|es)? (deko|st[uü]ck|idee)/i

/** Abgehackte KI-Punchlines als alleinige Blase. */
function isOrphanFragment(text: string): boolean {
  const t = text.trim()
  if (!t) return false
  return /^(gut|schön|klar|ok|okay|kein problem|alles gut|alles klar|kein video nötig|foto oder größe|hand und tisch)\.?$/i.test(
    t,
  )
}

/** Rückfrage nach Alternativen, obwohl das Atelier schon welche genannt hat. */
function asksAgainDespiteOffers(text: string, belief: AnnaBelief): boolean {
  // Nur wenn konkrete Produktalternativen schon genannt wurden
  const offered =
    (belief.offeredKinds?.length ?? 0) > 0 || (belief.lastAct.offeredKinds?.length ?? 0) > 0
  if (!offered) return false
  return (
    /was k[oö]nntest du mir jetzt sonst/i.test(text) ||
    /was hast du gerade da/i.test(text) ||
    /hast du (jetzt |bis .+ )?etwas anderes/i.test(text) ||
    /hast du jetzt eine alternative/i.test(text) ||
    /was .+ sonst (machen|anbieten)/i.test(text)
  )
}

export type GuardrailResult = {
  ok: boolean
  plan: AnnaPlan
  violations: string[]
}

function spoken(plan: AnnaPlan): string {
  return plan.bubbles.map((b) => b.text ?? '').join('\n')
}

function pursuesBlockedMedia(plan: AnnaPlan, belief: AnnaBelief): boolean {
  if (belief.canPursueWish) return false
  for (const bubble of plan.bubbles) {
    if (bubble.kind === 'video' || bubble.video) {
      if (belief.blocks.some((b) => b.family === 'hoop') || isHoopKind(belief.wishedKind)) {
        return true
      }
    }
    if (bubble.referenceSearch) {
      const kind = bubble.referenceSearch.kind
      const fam = familyKeyFor(kind)
      if (belief.blocks.some((b) => b.family === fam)) return true
      if (!belief.canPursueWish && fam === familyKeyFor(belief.wishedKind)) return true
    }
  }
  return false
}

/**
 * Prüft und ggf. bereinigt einen Plan. Bei harten Verstößen: ok=false.
 */
export function applyAnnaGuardrails(plan: AnnaPlan, belief: AnnaBelief): GuardrailResult {
  const violations: string[] = []

  if (!plan.bubbles.length) {
    return { ok: false, plan, violations: ['leer'] }
  }

  // Gedankenstriche zuerst normalisieren — sonst scheitern gültige Zeiten wie „15-16“
  const cleaned: AnnaBubble[] = plan.bubbles.map((bubble) => {
    if (!bubble.text) return bubble
    return {
      ...bubble,
      text: bubble.text
        .replace(/\u2014/g, ',')
        .replace(/\u2013/g, '-')
        .replace(/\s+,/g, ',')
        .replace(/\s+-\s+/g, '-')
        .replace(/(\d)-(\d)/g, '$1-$2'),
    }
  })
  const next = { ...plan, bubbles: cleaned }
  const text = spoken(next)

  if (BANNED.test(text)) {
    violations.push('verbotene Floskel / Gedankenstrich / Soll-ich-warten')
  }

  for (const bubble of next.bubbles) {
    if (bubble.text && isOrphanFragment(bubble.text)) {
      violations.push('Satzfragment als alleinige Blase')
      break
    }
  }

  if (asksAgainDespiteOffers(text, belief)) {
    violations.push('fragt erneut nach Alternativen trotz Angebotsliste')
  }

  if (belief.paused && /meinst du (ein )?foto|foto oder|etwas am goldring/i.test(text)) {
    violations.push('fragt während Soft-Pause weiter')
  }

  if (/was ist dir wichtig/i.test(text)) {
    violations.push('fragt Atelier nach Wünschen (Rollenbruch)')
  }

  if (pursuesBlockedMedia(next, belief)) {
    violations.push('Medien für gesperrtes Produkt')
  }

  const hard = violations.length > 0

  return { ok: !hard, plan: next, violations }
}

export function fallbackPlanForBelief(belief: AnnaBelief, seedLine?: string): AnnaPlan {
  const until =
    belief.blocks.find((b) => b.family === familyKeyFor(belief.wishedKind))?.untilLabel ??
    belief.lastAct.untilLabel
  const label = labelForKind(belief.wishedKind)
  const offered =
    belief.offeredKinds.length > 0
      ? belief.offeredKinds
      : (belief.lastAct.offeredKinds ?? [])
  const chosen = chooseOfferedAlternative(belief.wishedKind, offered)
  const accepted = belief.acceptedKindByKunde
  const safeSeed =
    seedLine &&
    !asksAgainDespiteOffers(seedLine, belief) &&
    !BANNED.test(seedLine)
      ? seedLine
      : undefined

  // Schon gewähltes Produkt: bestätigen, nicht nach Alternativen fragen
  if (
    !safeSeed &&
    accepted &&
    !isHoopKind(accepted) &&
    (belief.canPursueWish || accepted === belief.wishedKind)
  ) {
    const kept = labelForKind(accepted)
    return {
      bubbles: [
        {
          kind: 'text',
          text: `Alles klar, beim ${kept} bleibe ich dabei.`,
          typingMs: 900,
          gapMs: 0,
        },
      ],
    }
  }

  const text =
    safeSeed ||
    (chosen && until
      ? `Verstehe. Wegen dem ${label} komme ich später nochmal auf dich zu. Bis dahin nehme ich gern ${indefiniteFor(chosen)}.`
      : until
        ? `Verstehe. Wegen dem ${label} melde ich mich bis ${until} nochmal. Ein Strauß in ruhigen Farben wäre bis dahin auch schön.`
        : chosen
          ? `Verstehe. Dann nehme ich gern ${indefiniteFor(chosen)}, eher ruhig in Creme und Rosa.`
          : belief.canPursueWish && !isHoopKind(belief.wishedKind)
            ? `Alles klar, beim ${label} bleibe ich dabei.`
            : `Verstehe. Ein Strauß in ruhigen Farben wäre für mich jetzt auch schön.`)

  return {
    bubbles: [
      {
        kind: 'text',
        text,
        typingMs: Math.min(2800, 40 * text.length),
        gapMs: 0,
      },
    ],
  }
}

function indefiniteFor(kind: FloristryKind): string {
  const name = labelForKind(kind)
  if (kind === 'girlande') return `eine ${name}`
  if (kind === 'gesteck') return `ein ${name}`
  return `einen ${name}`
}

/** Ob eine Referenz-/Clip-Absicht für kind gegen Belief verstößt. */
export function beliefAllowsMedia(belief: AnnaBelief, kind: FloristryKind): boolean {
  if (!belief.canPursueWish && familyKeyFor(kind) === familyKeyFor(belief.wishedKind)) {
    return false
  }
  const fam = familyKeyFor(kind)
  if (belief.blocks.some((b) => b.family === fam)) return false
  if (kranzFamily(kind) && belief.blocks.some((b) => b.family === 'kranz')) return false
  if (isHoopKind(kind) && belief.blocks.some((b) => b.family === 'hoop')) return false
  return true
}
