import { type ReactNode } from 'react'
import { orderFieldLabels, type Conversation, type StructuredOrder } from './data'
import {
  buildPaginatedPages,
  type OfferDossierView,
  type PaginatedPage,
} from './offerPdfPagination'
import {
  formatEuro,
  lineTotal,
  offerSubtotal,
  offerTotal,
  PORTAL_PRIVACY_NOTICE,
  resolveEinleitung,
  type OfferDocument,
  type OfferLine,
} from './offerTypes'

export type { OfferDossierView } from './offerPdfPagination'

interface OfferPdfLayoutProps {
  doc: OfferDocument
  dossier: OfferDossierView
  printId?: string
}

function SellerFooter({ doc }: { doc: OfferDocument }) {
  const s = doc.seller
  return (
    <footer className="offer-pdf-col-footer">
      <div>
        <strong>
          {s.firma} - {s.inhaber}
        </strong>
        <p>
          {s.strasse}
          <br />
          {s.plzOrt}
          <br />
          {s.land}
        </p>
      </div>
      <div>
        <p>
          {s.rolle}:
          <br />
          {s.inhaber}
        </p>
        <p className="offer-pdf-mail">{s.email}</p>
        <p>
          Steuernummer: {s.steuernummer}
          <br />
          USt.-ID Nr.: {s.ustId}
        </p>
      </div>
      <div>
        <strong>Bankverbindung</strong>
        <p>
          {s.bank}
          <br />
          IBAN: {s.iban}
          <br />
          BIC/Swift: {s.bic}
        </p>
      </div>
    </footer>
  )
}

function MetaBlock({
  doc,
  page,
  totalPages,
}: {
  doc: OfferDocument
  page: number
  totalPages: number
}) {
  return (
    <dl className="offer-pdf-meta">
      <div>
        <dt>Auftrags-Nr.</dt>
        <dd>{doc.auftragsNr || doc.nr || '—'}</dd>
      </div>
      <div>
        <dt>Kunden-Nr.</dt>
        <dd>{doc.kundenNr || '—'}</dd>
      </div>
      <div>
        <dt>Auftragsdatum</dt>
        <dd>{doc.auftragsdatum}</dd>
      </div>
      <div>
        <dt>Lieferdatum</dt>
        <dd>{doc.lieferdatum}</dd>
      </div>
      <div>
        <dt>Seite</dt>
        <dd>
          {page} von {totalPages}
        </dd>
      </div>
    </dl>
  )
}

function OfferHeaderFirst({
  doc,
  page,
  totalPages,
}: {
  doc: OfferDocument
  page: number
  totalPages: number
}) {
  return (
    <header className="offer-pdf-header offer-pdf-header-first">
      <img src="/brand/briefkopf.png" alt="" className="offer-pdf-mark" />
      <p className="offer-pdf-absenderzeile">
        {doc.seller.firma} - {doc.seller.inhaber} - {doc.seller.strasse} - {doc.seller.plzOrt}
      </p>
      <div className="offer-pdf-grid">
        <address className="offer-pdf-customer">
          {doc.kunde.anrede && <span>{doc.kunde.anrede}</span>}
          <strong>{doc.kunde.name || '—'}</strong>
          {doc.kunde.strasse && <span>{doc.kunde.strasse}</span>}
          {doc.kunde.plzOrt && <span>{doc.kunde.plzOrt}</span>}
        </address>
        <MetaBlock doc={doc} page={page} totalPages={totalPages} />
      </div>
    </header>
  )
}

function OfferHeaderContinue({
  doc,
  page,
  totalPages,
}: {
  doc: OfferDocument
  page: number
  totalPages: number
}) {
  return (
    <header className="offer-pdf-header offer-pdf-header-continue">
      <p className="offer-pdf-absenderzeile">
        {doc.seller.firma} - {doc.seller.inhaber} - {doc.seller.strasse} - {doc.seller.plzOrt}
      </p>
      <div className="offer-pdf-continue-meta">
        <MetaBlock doc={doc} page={page} totalPages={totalPages} />
      </div>
    </header>
  )
}

function TranscriptHeader({
  doc,
  page,
  totalPages,
  showTitle,
}: {
  doc: OfferDocument
  page: number
  totalPages: number
  showTitle: boolean
}) {
  return (
    <header className="offer-pdf-header offer-pdf-header-transcript">
      <div className="offer-pdf-page2-head">
        <h1 className="offer-pdf-title">{doc.titel || 'Angebot'}</h1>
        <MetaBlock doc={doc} page={page} totalPages={totalPages} />
      </div>
      {showTitle && (
        <h2 className="offer-pdf-transcript-title">Transkript vom {doc.auftragsdatum}:</h2>
      )}
    </header>
  )
}

function OfferTable({
  lines,
  indexes,
  showHead,
}: {
  lines: OfferLine[]
  indexes: number[]
  showHead: boolean
}) {
  if (indexes.length === 0 && !showHead) return null
  return (
    <table className="offer-pdf-table">
      {showHead && (
        <thead>
          <tr>
            <th>Pos.</th>
            <th>Artikel / Leistung</th>
            <th>Menge</th>
            <th>Einheit</th>
            <th>Preis</th>
            <th>Gesamt</th>
          </tr>
        </thead>
      )}
      <tbody>
        {indexes.map((i) => {
          const line = lines[i]
          return (
            <tr key={line.id}>
              <td>{i + 1}.</td>
              <td>
                <strong>{line.artikel || '—'}</strong>
                {line.beschreibung && <div className="offer-pdf-desc">{line.beschreibung}</div>}
              </td>
              <td>{line.menge.toLocaleString('de-DE', { minimumFractionDigits: 2 })}</td>
              <td>{line.einheit}</td>
              <td>{formatEuro(line.preis)}</td>
              <td>{formatEuro(lineTotal(line))}</td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

function OfferTotals({ doc }: { doc: OfferDocument }) {
  const sub = offerSubtotal(doc)
  const total = offerTotal(doc)
  return (
    <div className="offer-pdf-totals">
      <div>
        <span>Zwischensumme</span>
        <strong>{formatEuro(sub)}</strong>
      </div>
      <div>
        <span>Gesamtrabatt</span>
        <strong>{formatEuro(doc.discount || 0)}</strong>
      </div>
      <div className="is-total">
        <span>Gesamt</span>
        <strong>{formatEuro(total)}</strong>
      </div>
    </div>
  )
}

function TranscriptRows({
  doc,
  dossier,
  rowKeys,
}: {
  doc: OfferDocument
  dossier: OfferDossierView
  rowKeys: string[]
}) {
  const kundeLines = [
    doc.kunde.anrede,
    doc.kunde.name,
    doc.kunde.strasse,
    doc.kunde.plzOrt,
    dossier.telefon,
  ].filter(Boolean)

  return (
    <dl className="offer-pdf-transcript">
      {rowKeys.map((key) => {
        if (key === '__kunde__') {
          return (
            <div className="offer-pdf-transcript-row" key={key}>
              <dt>Kunde</dt>
              <dd>
                {kundeLines.map((line) => (
                  <span key={line}>{line}</span>
                ))}
              </dd>
            </div>
          )
        }
        const value = dossier.structured[key as keyof StructuredOrder]
        if (value === undefined || value === '') return null
        return (
          <div className="offer-pdf-transcript-row" key={key}>
            <dt>{orderFieldLabels[key] || key}</dt>
            <dd>{String(value)}</dd>
          </div>
        )
      })}
    </dl>
  )
}

function OfferPageShell({
  children,
  footer,
  className,
}: {
  children: ReactNode
  footer: ReactNode
  className?: string
}) {
  return (
    <article className={`offer-pdf-page ${className ?? ''}`.trim()}>
      <div className="offer-pdf-page-body">{children}</div>
      {footer}
    </article>
  )
}

function renderPage(
  page: PaginatedPage,
  doc: OfferDocument,
  dossier: OfferDossierView,
  totalPages: number,
) {
  const footer = <SellerFooter doc={doc} />
  const intro = resolveEinleitung(doc)

  if (page.kind === 'offer') {
    return (
      <OfferPageShell key={`offer-${page.pageIndex}`} footer={footer} className="offer-pdf-page-offer">
        {page.isFirstOfferPage ? (
          <OfferHeaderFirst doc={doc} page={page.pageIndex} totalPages={totalPages} />
        ) : (
          <OfferHeaderContinue doc={doc} page={page.pageIndex} totalPages={totalPages} />
        )}
        <div className="offer-pdf-content-band">
          {page.body.showIntro && page.isFirstOfferPage && (
            <>
              <h1 className="offer-pdf-title">{doc.titel || 'Angebot'}</h1>
              {intro && <p className="offer-pdf-intro">{intro}</p>}
            </>
          )}
          <OfferTable
            lines={doc.lines}
            indexes={page.body.lineIndexes}
            showHead={page.body.showTableHead && page.body.lineIndexes.length > 0}
          />
          {page.body.showTotals && <OfferTotals doc={doc} />}
        </div>
      </OfferPageShell>
    )
  }

  return (
    <OfferPageShell
      key={`transcript-${page.pageIndex}`}
      footer={footer}
      className="offer-pdf-page-transcript"
    >
      <TranscriptHeader
        doc={doc}
        page={page.pageIndex}
        totalPages={totalPages}
        showTitle={page.body.showTitle}
      />
      <div className="offer-pdf-content-band">
        <TranscriptRows doc={doc} dossier={dossier} rowKeys={page.body.rowKeys} />
        {page.body.showPrivacy && <p className="offer-pdf-privacy">{PORTAL_PRIVACY_NOTICE}</p>}
      </div>
    </OfferPageShell>
  )
}

export function OfferPdfLayout({ doc, dossier, printId = 'offer-print-root' }: OfferPdfLayoutProps) {
  const pages = buildPaginatedPages(doc, dossier)
  const totalPages = pages.length

  return (
    <div
      className="offer-pdf-root"
      id={printId}
      aria-label={`Angebot ${doc.auftragsNr || doc.nr}`}
      data-total-pages={totalPages}
    >
      {pages.map((page) => renderPage(page, doc, dossier, totalPages))}
    </div>
  )
}

export function dossierFromConversation(conversation: Conversation): OfferDossierView {
  return {
    kundeLabel: conversation.kunde,
    telefon: conversation.telefon,
    structured: conversation.structured,
  }
}