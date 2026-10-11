/**
 * Auto-Quellenbeweis der Trust-Ebene (Marie): 65-Quelle → 75-Quelle → Zustimmung.
 * Reine Daten, damit Dauer und Inhalte testbar bleiben. Die Texte stehen in den Demo-Nachrichten.
 */
export type ProofStep = {
  readonly id: 'budget' | 'price' | 'confirm'
  /** Auftragsfeld, dessen Herkunft gezeigt wird. */
  readonly field: 'budget' | 'preisVereinbart'
  /** Nachricht mit der Quelle. */
  readonly messageId: 'mk12' | 'mk13' | 'mk14'
  /** Markierter Teilstring der echten Nachricht. */
  readonly mark: string
  readonly durationMs: number
}

export const PROOF_STEPS: readonly ProofStep[] = [
  { id: 'budget', field: 'budget', messageId: 'mk12', mark: '65€', durationMs: 1000 },
  { id: 'price', field: 'preisVereinbart', messageId: 'mk13', mark: '75€', durationMs: 1000 },
  { id: 'confirm', field: 'preisVereinbart', messageId: 'mk14', mark: 'Das ist es mir wert', durationMs: 1000 },
]

/** Wartezeit nach dem Einblenden, bevor der Beweis beginnt (Eintrittsbewegung 500–700 ms). */
export const PROOF_ENTER_MS = 650

export function proofTotalMs(): number {
  return PROOF_STEPS.reduce((sum, step) => sum + step.durationMs, 0)
}

/** Markierte Textstellen je Nachricht in der Trust-Ebene. */
export const PROOF_MARKS: Readonly<Record<string, readonly string[]>> = {
  mk12: ['65€'],
  mk13: ['75€'],
  mk14: ['Das ist es mir wert'],
}
