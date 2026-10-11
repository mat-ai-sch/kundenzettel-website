import { orderFieldLabels, type StructuredOrder } from '../../data'

/** Felder, die im WhatsApp-Auftragspanel editierbar sind (Reihenfolge = Anzeige). */
export const whatsappEditableFields: (keyof StructuredOrder)[] = [
  'produkt',
  'ursprungswunsch',
  'groesse',
  'rohling',
  'stil',
  'farben',
  'abgelehnt',
  'blumenauswahl',
  'referenz',
  'anlass',
  'termin',
  'abholung',
  'lieferung',
  'adresse',
  'budget',
  'preisVereinbart',
  'preisBegruendung',
  'medien',
]

/** Reihenfolge für Dossier/Archiv-Ansichten. */
export const orderFieldOrder: (keyof StructuredOrder)[] = [
  'produkt',
  'ursprungswunsch',
  'sku',
  'groesse',
  'rohling',
  'stil',
  'farben',
  'abgelehnt',
  'referenz',
  'blumenauswahl',
  'anlass',
  'termin',
  'abholung',
  'lieferung',
  'adresse',
  'budget',
  'preisVereinbart',
  'preisBegruendung',
  'medien',
  'kanal',
  'notizen',
]

export type OrderFieldsProps = {
  structured: StructuredOrder
  /** Felder, die gerade live aus dem Chat übernommen wurden (`.is-live`). */
  liveFields?: ReadonlySet<string>
  liveTick?: number
  /** Gesetzt = editierbar (App); fehlt = schreibgeschützt (Landing-Story). */
  onChange?: <K extends keyof StructuredOrder>(key: K, value: StructuredOrder[K]) => void
  /** Nur diese Felder rendern (Reihenfolge bleibt die der Demo). Fehlt = alle. */
  fieldKeys?: ReadonlySet<string>
  /** Notizen-Feld ausblenden (Landing-Story). */
  hideNotes?: boolean
  /**
   * Landing-Story: Werte brechen um statt abgeschnitten zu werden (wachsende, schreibgeschützte Textfelder).
   * Nur mit schreibgeschütztem Panel; die App rendert weiterhin einzeilige Eingabefelder.
   */
  wrapValues?: boolean
  /** Landing-Story: durch eine spätere Einigung ersetzte Werte (z. B. Wunschbudget). */
  supersededFields?: ReadonlySet<string>
  /** Landing-Story: Felder mit Quellenansicht (Hover, Fokus, Tap). */
  sourceFields?: ReadonlySet<string>
  onSourceActive?: (key: string | null, via: 'hover' | 'focus' | 'tap') => void
}

/** Feldzeilen des Auftragspanels (identisches Markup wie zuvor in App.tsx). */
export function OrderFields({
  structured,
  liveFields = EMPTY_SET,
  liveTick = 0,
  onChange,
  fieldKeys,
  hideNotes = false,
  wrapValues = false,
  supersededFields = EMPTY_SET,
  sourceFields = EMPTY_SET,
  onSourceActive,
}: OrderFieldsProps) {
  const readOnly = !onChange
  const keys = fieldKeys
    ? whatsappEditableFields.filter((key) => fieldKeys.has(key))
    : whatsappEditableFields
  return (
    <div className="fields">
      {keys.map((key) => {
        const hasSource = sourceFields.has(key)
        return (
          <div
            className={`field${liveFields.has(key) ? ' is-live' : ''}${supersededFields.has(key) ? ' is-superseded' : ''}`}
            key={key}
            data-order-field={key}
            data-live-tick={liveFields.has(key) ? liveTick : undefined}
            data-has-source={hasSource ? '' : undefined}
            onPointerEnter={hasSource ? (e) => e.pointerType === 'mouse' && onSourceActive?.(key, 'hover') : undefined}
            onPointerLeave={hasSource ? (e) => e.pointerType === 'mouse' && onSourceActive?.(null, 'hover') : undefined}
            onClick={hasSource ? () => onSourceActive?.(key, 'tap') : undefined}
            onFocus={hasSource ? () => onSourceActive?.(key, 'focus') : undefined}
            onBlur={hasSource ? () => onSourceActive?.(null, 'focus') : undefined}
          >
            <label>{orderFieldLabels[key]}</label>
            {wrapValues && readOnly ? (
              // Unsichtbarer Spiegel (::after) gibt dem Textfeld die Höhe des umgebrochenen Textes.
              <div className="field-grow" data-value={`${structured[key] ?? ''} `}>
                <textarea
                  rows={1}
                  value={structured[key] ?? ''}
                  readOnly
                  tabIndex={hasSource ? undefined : -1}
                  aria-label={hasSource ? `${orderFieldLabels[key]}: Quelle anzeigen` : undefined}
                />
              </div>
            ) : (
              <input
                value={structured[key] ?? ''}
                readOnly={readOnly}
                tabIndex={readOnly && !hasSource ? -1 : undefined}
                aria-label={hasSource ? `${orderFieldLabels[key]}: Quelle anzeigen` : undefined}
                onChange={onChange ? (e) => onChange(key, e.target.value) : undefined}
              />
            )}
          </div>
        )
      })}
      {!hideNotes && (
        <div
          className={`field${liveFields.has('notizen') ? ' is-live' : ''}`}
          data-order-field="notizen"
          data-live-tick={liveFields.has('notizen') ? liveTick : undefined}
        >
          <label>Notizen</label>
          <textarea
            value={structured.notizen}
            readOnly={readOnly}
            tabIndex={readOnly ? -1 : undefined}
            onChange={onChange ? (e) => onChange('notizen', e.target.value) : undefined}
          />
        </div>
      )}
    </div>
  )
}

const EMPTY_SET: ReadonlySet<string> = new Set()
