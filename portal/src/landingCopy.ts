/**
 * Sichtbare Texte der öffentlichen Landingpage. Nachrichten und Auftragsfelder kommen aus dem Landing-Fixture
 * (wörtlich aus der Demo-Konversation). Stand: Copy PASS (docs/landing/08-copy.md, Phase 12).
 *
 * Schreibweise: sichtbar „65 €“ / „75 €“ mit geschütztem Leerzeichen; Screenreader- und Live-Texte „Euro“.
 * Die Seite spricht Sie, der Chat bleibt du (Szene).
 */
const NBSP = '\u00a0'
/** Non-breaking hyphen so „WhatsApp-Nachrichten“ does not break after the hyphen (H1). */
const NBH = '\u2011'

export const landingCopy = {
  // Claim (Was). Das Woher steht nur in der Trust-Ebene und nur szenengebunden (X-08).
  title: `Aus WhatsApp${NBH}Nachrichten werden klare Aufträge.`,
  subtitle: 'Ihre Kunden schreiben wie bisher.',
  navDemo: 'Demo ansehen',
  navPilot: 'Pilot anfragen',
  primaryCta: 'Pilot anfragen',
  secondaryCta: 'Demo ansehen',

  // Trust: was gilt, ohne Anleitung und ohne an den Betrag gebundenen Satz.
  trustTitle: 'Was vereinbart wurde, bleibt nachvollziehbar.',
  trustStepBudget: `Das Wunschbudget 65${NBSP}€ steht in Maries Anfrage.`,
  trustStepPrice: `Das Atelier nennt 75${NBSP}€.`,
  trustStepConfirm: `Marie stimmt zu. Damit gilt 75${NBSP}€.`,

  // Nicht sichtbar: Zugriffsnamen und Live-Ansagen (je ≤ 120 Zeichen).
  storyLabel: 'Aus dem Chat mit Marie entsteht ein Auftrag',
  storySummary:
    'Marie schreibt, dass sie den Kranz bis Mittwoch braucht und sich einen Preis bis 65 Euro vorgestellt hat. Das Atelier nennt 75 Euro, Marie stimmt zu. Der Auftrag hält 75 Euro als vereinbarten Preis fest.',
  liveExtraction: 'Termin Mittwoch und Wunschbudget 65 Euro stehen jetzt im Auftrag.',
  liveConfirmed: 'Marie stimmt zu. Der Preis 75 Euro ist vereinbart.',
  liveTransportPaused: 'Ablauf angehalten.',
  liveTransportResumed: 'Ablauf läuft weiter.',
  nextAria: 'Weiter zum nächsten Abschnitt',
  pauseLabel: 'Pause',
  resumeLabel: 'Fortsetzen',
  skipLabel: 'Überspringen',
  playLabel: 'Ablauf abspielen',
  replayLabel: 'Nochmal ansehen',

  footerImprint: 'Impressum',
  footerPrivacy: 'Datenschutz',
  footerMail: 'info@kundenzettel.de',
} as const

export const landingLinks = {
  demo: 'https://demo.kundenzettel.de',
  pilot: 'mailto:info@kundenzettel.de?subject=Pilot%20anfragen',
  mail: 'mailto:info@kundenzettel.de',
} as const

const disallowedPatterns = [
  /[–—]/u,
  /\b(nicht nur|sondern auch|mehr als nur)\b/iu,
  /\b(intelligent|nahtlos|maßgeschneidert|revolutionär|einzigartig|leistungsstark|mehrwert|zukunft|lösung|erlebnis)\b/iu,
  /\b(natürlich|gerne|möchtest du|lass es mich wissen|ich hoffe, das hilft)\b/iu,
  /\b(überblick|zusammenfassung|fazit|ausblick)\b/iu,
  // Copy PASS: Branchenversprechen ohne Demo-Beleg, KI, Prozentzahlen, Selbstbedienungs-CTA.
  /\b(hochzeit\w*|event\w*|ki|künstliche intelligenz)\b/iu,
  /\d\s*%/u,
  /eigenen betrieb/iu,
  // Das Produkt zeigt nicht „immer“ die Quelle (X-08): keine Zusage als Produktfunktion.
  /\b(immer|zu jedem wert)\b/iu,
]

export function findDisallowedLandingCopy(): string[] {
  return Object.values(landingCopy).flatMap((value) =>
    disallowedPatterns.filter((pattern) => pattern.test(value)).map((pattern) => `${pattern}: ${value}`),
  )
}

/** Sichtbare Zeichen der Landing-Texte außerhalb von Demo-Chat und Produktlabels (Brief §6.1, Gesamtdeckel 450). */
export const VISIBLE_COPY_KEYS = [
  'title',
  'subtitle',
  'navDemo',
  'navPilot',
  'primaryCta',
  'secondaryCta',
  'trustTitle',
  'trustStepBudget',
  'trustStepPrice',
  'trustStepConfirm',
  'playLabel',
  'replayLabel',
  'footerImprint',
  'footerPrivacy',
  'footerMail',
] as const satisfies readonly (keyof typeof landingCopy)[]
