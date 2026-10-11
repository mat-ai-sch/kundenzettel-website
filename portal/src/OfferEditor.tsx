import { useEffect, useMemo, useRef, useState } from 'react'
import type { Conversation } from './data'
import { upsertCustomerFromOffer } from './customerStore'
import { dossierFromConversation, OfferPdfLayout } from './OfferPdfLayout'
import {
  loadOfferRecord,
  restoreOfferVersion,
  saveOffer,
  updateOfferDraft,
} from './offerStore'
import {
  buildOfferPdfBlob,
  choosePdfSaveTarget,
  mountOfferExportClone,
  writePdfToTarget,
} from './offerPdfExport'
import {
  defaultGueltigBis,
  formatEuro,
  lineTotal,
  newLine,
  offerSubtotal,
  offerTotal,
  resolveLieferdatum,
  type OfferDocument,
  type OfferLine,
  type OfferRecord,
} from './offerTypes'

interface OfferEditorProps {
  conversation: Conversation
  onToast: (msg: string) => void
}

function patchLine(lines: OfferLine[], id: string, patch: Partial<OfferLine>) {
  return lines.map((l) => (l.id === id ? { ...l, ...patch } : l))
}

export function OfferEditor({ conversation, onToast }: OfferEditorProps) {
  const [record, setRecord] = useState<OfferRecord>(() => loadOfferRecord(conversation))
  const [showHistory, setShowHistory] = useState(false)
  const [showPreview, setShowPreview] = useState(true)
  const [exporting, setExporting] = useState(false)
  const previewRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setRecord(loadOfferRecord(conversation))
    setShowHistory(false)
  }, [conversation.id])

  const doc = record.current
  const subtotal = useMemo(() => offerSubtotal(doc), [doc])
  const total = useMemo(() => offerTotal(doc), [doc])
  const dossier = useMemo(() => dossierFromConversation(conversation), [conversation])

  function setDoc(next: OfferDocument) {
    const updated = updateOfferDraft(conversation.id, next)
    setRecord(updated)
  }

  function update<K extends keyof OfferDocument>(key: K, value: OfferDocument[K]) {
    setDoc({ ...doc, [key]: value })
  }

  function updateKunde<K extends keyof OfferDocument['kunde']>(
    key: K,
    value: OfferDocument['kunde'][K],
  ) {
    setDoc({ ...doc, kunde: { ...doc.kunde, [key]: value } })
  }

  function updateAuftragsdatum(value: string) {
    setDoc({
      ...doc,
      auftragsdatum: value,
      datum: value,
      lieferdatum: resolveLieferdatum(value, conversation.structured.termin),
      gueltigBis: defaultGueltigBis(value),
      einleitung: doc.einleitung.includes('{gueltigBis}')
        ? doc.einleitung
        : 'Vielen Dank für Ihren Auftrag. Dieses Angebot ist gültig bis zum {gueltigBis}.',
    })
  }

  function syncCustomer(source: OfferDocument) {
    upsertCustomerFromOffer({
      kundenNr: source.kundenNr || '00001',
      conversationId: conversation.id,
      anrede: source.kunde.anrede,
      name: source.kunde.name,
      strasse: source.kunde.strasse,
      plzOrt: source.kunde.plzOrt,
      telefon: conversation.telefon,
    })
  }

  function handleSave() {
    syncCustomer(doc)
    const saved = saveOffer(conversation.id, doc)
    setRecord(saved)
    onToast(`Angebot ${saved.current.auftragsNr || saved.current.nr} gespeichert`)
  }

  function handleRestore(versionId: string) {
    const restored = restoreOfferVersion(conversation.id, versionId)
    if (!restored) return
    setRecord(restored)
    onToast('Version wiederhergestellt')
  }

  function handlePrint() {
    if (!showPreview) setShowPreview(true)
    window.setTimeout(() => {
      document.body.classList.add('printing-offer')
      window.print()
      window.setTimeout(() => document.body.classList.remove('printing-offer'), 400)
    }, showPreview ? 0 : 80)
  }

  async function handleDownloadPdf() {
    if (exporting) return

    const fileBase = (doc.auftragsNr || doc.nr || 'Angebot').replace(/[^\w.-]+/g, '_')
    const filename = `Angebot_${fileBase}.pdf`

    // Wichtig: Speicherort SOFORT wählen (User-Geste), sonst schreibt der Browser nichts
    const target = await choosePdfSaveTarget(filename)
    if (target.kind === 'cancelled') {
      onToast('PDF-Speichern abgebrochen')
      return
    }

    if (!showPreview) {
      setShowPreview(true)
    }

    let source: HTMLElement | null = null
    for (let i = 0; i < 40; i++) {
      source =
        (previewRef.current?.querySelector('#offer-print-root') as HTMLElement | null) ??
        (document.getElementById('offer-print-root') as HTMLElement | null)
      if (source) break
      await new Promise((r) => window.setTimeout(r, 50))
    }

    if (!source) {
      onToast('PDF-Vorschau nicht bereit – bitte Vorschau einschalten und erneut versuchen')
      return
    }

    setExporting(true)
    let host: HTMLDivElement | null = null
    try {
      onToast('PDF wird erzeugt…')
      const mounted = mountOfferExportClone(source)
      host = mounted.host
      await new Promise((r) => window.requestAnimationFrame(() => window.requestAnimationFrame(r)))

      const blob = await buildOfferPdfBlob(mounted.clone)
      host.remove()
      host = null

      const written = await writePdfToTarget(blob, target, filename)
      const kb = Math.round(written.bytes / 1024)
      onToast(
        written.method === 'file'
          ? `${filename} gespeichert (${kb} KB)`
          : `${filename} Download gestartet (${kb} KB)`,
      )
    } catch (err) {
      console.error('PDF-Export', err)
      const detail = err instanceof Error ? err.message : 'unbekannt'
      onToast(`PDF-Export fehlgeschlagen (${detail}) – bitte Drucken als PDF nutzen`)
    } finally {
      host?.remove()
      setExporting(false)
    }
  }

  return (
    <section className="offer-editor" aria-label="Angebot">
      <div className="offer-editor-head">
        <div>
          <h3>Angebot</h3>
          <span className={`offer-status-pill ${doc.status}`}>
            {doc.status === 'entwurf' ? 'Entwurf' : 'Gespeichert'}
          </span>
        </div>
        <div className="offer-editor-actions">
          <button className="btn btn-line" type="button" onClick={() => setShowHistory((v) => !v)}>
            Historie ({record.history.length})
          </button>
          <button className="btn btn-line" type="button" onClick={() => setShowPreview((v) => !v)}>
            {showPreview ? 'Vorschau aus' : 'Vorschau an'}
          </button>
          <button className="btn btn-line" type="button" onClick={handlePrint}>
            Drucken
          </button>
          <button
            className="btn btn-line"
            type="button"
            disabled={exporting}
            onClick={() => void handleDownloadPdf()}
          >
            {exporting ? 'Export…' : 'PDF herunterladen'}
          </button>
          <button className="btn btn-sage" type="button" onClick={handleSave}>
            Speichern
          </button>
        </div>
      </div>

      {showHistory && (
        <div className="offer-history">
          <h4>Versionshistorie</h4>
          {record.history.length === 0 ? (
            <p className="offer-history-empty">Noch keine gespeicherten Versionen.</p>
          ) : (
            <ul>
              {record.history.map((v) => (
                <li key={v.id}>
                  <div>
                    <strong>{new Date(v.savedAt).toLocaleString('de-DE')}</strong>
                    <span>
                      {v.snapshot.auftragsNr || v.snapshot.nr} · {formatEuro(offerTotal(v.snapshot))}
                      {v.note ? ` · ${v.note}` : ''}
                    </span>
                  </div>
                  <button className="btn btn-line" type="button" onClick={() => handleRestore(v.id)}>
                    Wiederherstellen
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="offer-editor-grid">
        <div className="offer-form">
          <fieldset className="offer-mask">
            <legend>Empfänger</legend>
            <div className="offer-form-row">
              <label>
                Anrede
                <input
                  value={doc.kunde.anrede}
                  onChange={(e) => updateKunde('anrede', e.target.value)}
                  placeholder="Frau / Herr / Familie"
                />
              </label>
              <label className="grow">
                Name
                <input
                  value={doc.kunde.name}
                  onChange={(e) => updateKunde('name', e.target.value)}
                  placeholder="Name"
                />
              </label>
            </div>
            <div className="offer-form-row">
              <label className="grow">
                Straße
                <input
                  value={doc.kunde.strasse}
                  onChange={(e) => updateKunde('strasse', e.target.value)}
                />
              </label>
              <label className="grow">
                PLZ / Ort
                <input
                  value={doc.kunde.plzOrt}
                  onChange={(e) => updateKunde('plzOrt', e.target.value)}
                />
              </label>
            </div>
          </fieldset>

          <fieldset className="offer-mask">
            <legend>Vorgang</legend>
            <div className="offer-meta-block">
              <label>
                Auftrags-Nr.
                <input
                  value={doc.auftragsNr}
                  onChange={(e) => update('auftragsNr', e.target.value)}
                />
              </label>
              <label>
                Kunden-Nr.
                <input value={doc.kundenNr} onChange={(e) => update('kundenNr', e.target.value)} />
              </label>
              <label>
                Auftragsdatum
                <input
                  value={doc.auftragsdatum}
                  onChange={(e) => updateAuftragsdatum(e.target.value)}
                />
              </label>
              <label>
                Lieferdatum
                <input
                  value={doc.lieferdatum}
                  onChange={(e) => update('lieferdatum', e.target.value)}
                />
              </label>
              <label>
                Gültig bis
                <input value={doc.gueltigBis} onChange={(e) => update('gueltigBis', e.target.value)} />
              </label>
              <label>
                Vorgangstitel
                <input value={doc.titel} onChange={(e) => update('titel', e.target.value)} />
              </label>
            </div>
          </fieldset>

          <fieldset className="offer-mask">
            <legend>Positionen</legend>
            <div className="offer-lines-head">
              <span>Pos.</span>
              <span>Artikel / Leistung</span>
              <span>Menge</span>
              <span>Einheit</span>
              <span>Preis</span>
              <span>Gesamt</span>
              <span />
            </div>

            {doc.lines.map((line, index) => (
              <div className="offer-line" key={line.id}>
                <span className="offer-pos">{index + 1}.</span>
                <div className="offer-line-main">
                  <input
                    value={line.artikel}
                    placeholder="Artikel / Leistung"
                    onChange={(e) =>
                      update('lines', patchLine(doc.lines, line.id, { artikel: e.target.value }))
                    }
                  />
                  <input
                    value={line.beschreibung}
                    placeholder="Beschreibung (optional)"
                    onChange={(e) =>
                      update(
                        'lines',
                        patchLine(doc.lines, line.id, { beschreibung: e.target.value }),
                      )
                    }
                  />
                </div>
                <input
                  type="number"
                  min={0}
                  step={0.01}
                  value={line.menge}
                  onChange={(e) =>
                    update(
                      'lines',
                      patchLine(doc.lines, line.id, { menge: Number(e.target.value) || 0 }),
                    )
                  }
                />
                <input
                  value={line.einheit}
                  onChange={(e) =>
                    update('lines', patchLine(doc.lines, line.id, { einheit: e.target.value }))
                  }
                />
                <input
                  type="number"
                  min={0}
                  step={0.01}
                  value={line.preis}
                  onChange={(e) =>
                    update(
                      'lines',
                      patchLine(doc.lines, line.id, { preis: Number(e.target.value) || 0 }),
                    )
                  }
                />
                <span className="offer-line-total" title="Menge × Preis">
                  {formatEuro(lineTotal(line))}
                </span>
                <button
                  className="btn btn-line"
                  type="button"
                  aria-label="Position entfernen"
                  disabled={doc.lines.length <= 1}
                  onClick={() => update('lines', doc.lines.filter((l) => l.id !== line.id))}
                >
                  −
                </button>
              </div>
            ))}

            <button
              className="btn btn-sage offer-add-line"
              type="button"
              onClick={() => update('lines', [...doc.lines, newLine()])}
            >
              Position hinzufügen
            </button>

            <div className="offer-sum-block">
              <label>
                Gesamtrabatt (€)
                <input
                  type="number"
                  min={0}
                  step={0.01}
                  value={doc.discount}
                  onChange={(e) => update('discount', Number(e.target.value) || 0)}
                />
              </label>
              <div className="offer-sum-readout">
                <div>
                  <span>Zwischensumme</span>
                  <strong>{formatEuro(subtotal)}</strong>
                </div>
                <div className="is-total">
                  <span>Gesamt</span>
                  <strong>{formatEuro(total)}</strong>
                </div>
              </div>
            </div>
          </fieldset>

          <fieldset className="offer-mask">
            <legend>Konditionen</legend>
            <label className="block">
              Einleitung
              <textarea
                rows={2}
                value={doc.einleitung}
                onChange={(e) => update('einleitung', e.target.value)}
              />
            </label>
            <label className="block">
              Zahlungsbedingung
              <textarea
                rows={2}
                value={doc.zahlungsbedingung}
                onChange={(e) => update('zahlungsbedingung', e.target.value)}
              />
            </label>
            <label className="block">
              Lieferbedingung
              <textarea
                rows={2}
                value={doc.lieferbedingung}
                onChange={(e) => update('lieferbedingung', e.target.value)}
              />
            </label>
            <label className="block">
              Anmerkungen (§19 etc.)
              <textarea
                rows={2}
                value={doc.anmerkungen}
                onChange={(e) => update('anmerkungen', e.target.value)}
              />
            </label>
            <label className="block">
              Schlusstext
              <textarea
                rows={2}
                value={doc.schlusstext}
                onChange={(e) => update('schlusstext', e.target.value)}
              />
            </label>
          </fieldset>
        </div>

        <div
          className={`offer-preview-pane${showPreview ? '' : ' is-export-only'}`}
          ref={previewRef}
          aria-hidden={!showPreview}
        >
          {showPreview && <p className="offer-preview-label">Dokumentvorschau (A4)</p>}
          <div className="offer-preview-scale-wrap offer-preview-scale-wrap-multi">
            <div className="offer-preview-scale" data-offer-scale>
              <OfferPdfLayout doc={doc} dossier={dossier} printId="offer-print-root" />
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
