import assert from 'node:assert/strict'
import { findDisallowedLandingCopy, landingCopy, landingLinks, VISIBLE_COPY_KEYS } from './landingCopy'

assert.deepEqual(findDisallowedLandingCopy(), [])

// Claim und freigegebene CTA-Liste (CV-V1): nur „Pilot anfragen“ und „Demo ansehen“.
assert.equal(landingCopy.title, 'Aus WhatsApp\u2011Nachrichten werden klare Aufträge.')
assert.equal(landingCopy.subtitle, 'Ihre Kunden schreiben wie bisher.')
assert.equal(landingCopy.primaryCta, 'Pilot anfragen')
assert.equal(landingCopy.secondaryCta, 'Demo ansehen')
assert.equal(landingCopy.navPilot, landingCopy.primaryCta, 'Derselbe Zweck heißt überall gleich')
assert.equal(landingCopy.navDemo, landingCopy.secondaryCta, 'Derselbe Zweck heißt überall gleich')
assert.ok(!('audience' in landingCopy), 'Zielgruppenzeile „Für Floristik“ ist entfernt')
assert.ok(!('exampleCaption' in landingCopy), 'Bildunterschrift „Beispiel“ ist entfernt')
assert.match(landingLinks.pilot, /^mailto:info@kundenzettel\.de/)

// Zugriffsnamen der Steuerung und des Scroll-Cues.
assert.equal(landingCopy.nextAria, 'Weiter zum nächsten Abschnitt')
assert.equal(landingCopy.playLabel, 'Ablauf abspielen')
assert.equal(landingCopy.replayLabel, 'Nochmal ansehen')
assert.equal(landingCopy.pauseLabel, 'Pause')
assert.equal(landingCopy.resumeLabel, 'Fortsetzen')
assert.equal(landingCopy.skipLabel, 'Überspringen')

// Trust: szenengebunden. Der gesperrte Wortlaut (X-08, CV-V2) darf nicht zurückkehren.
assert.doesNotMatch(landingCopy.trustTitle, /Sie sehen, was gilt/)
assert.equal(landingCopy.trustTitle, 'Was vereinbart wurde, bleibt nachvollziehbar.')
assert.doesNotMatch(landingCopy.trustTitle, /^Hier sehen Sie,/)
for (const key of ['trustStepBudget', 'trustStepPrice', 'trustStepConfirm'] as const) {
  assert.ok(landingCopy[key].length > 0 && landingCopy[key].length <= 50, `${key} ≤ 50 Zeichen`)
}
assert.ok(landingCopy.trustTitle.length <= 45, 'Trust-Überschrift ≤ 45 Zeichen')

// Schreibweise: sichtbar „65 €“/„75 €“ mit geschütztem Leerzeichen, Live- und Screenreader-Texte mit „Euro“.
for (const key of ['trustTitle', 'trustStepBudget', 'trustStepPrice', 'trustStepConfirm'] as const) {
  assert.doesNotMatch(landingCopy[key], /\d €/, `${key}: geschütztes Leerzeichen vor €`)
}
for (const key of ['storySummary', 'liveExtraction', 'liveConfirmed'] as const) {
  assert.match(landingCopy[key], /Euro/, key)
  assert.doesNotMatch(landingCopy[key], /€/, key)
}
// Live-Ansagen ≤ 120 Zeichen; die Zustimmung sagt „vereinbart“ erst für die Pointe (PT-V1).
for (const key of ['liveExtraction', 'liveConfirmed', 'liveTransportPaused', 'liveTransportResumed'] as const) {
  assert.ok(landingCopy[key].length <= 120, key)
}
assert.doesNotMatch(landingCopy.liveExtraction, /vereinbart/)

// Sichtbar-Budget (Brief §6.1): Gesamtdeckel 450 Zeichen (jede Bildunterschrift konservativ mitgezählt).
const visible = VISIBLE_COPY_KEYS.reduce((sum, key) => sum + landingCopy[key].length, 0)
assert.ok(visible <= 450, `Sichtbarer Text ${visible} ≤ 450`)
assert.ok(landingCopy.title.length <= 55 && landingCopy.subtitle.length <= 45)

// Keine Hover-Anleitung, keine Prozentzahlen, keine Marketing-Claims.
for (const [key, value] of Object.entries(landingCopy)) {
  assert.doesNotMatch(value, /\bMaus\b|Fahren Sie|\d+\s*%|Betrieb|Floristik|Beispiel für/, `${key}: ${value}`)
}

console.log('landing copy tests passed')
