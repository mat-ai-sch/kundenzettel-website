import html2canvas from 'html2canvas'
import { jsPDF } from 'jspdf'

function assertPdfMagic(bytes: ArrayBuffer | Uint8Array) {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  const head = String.fromCharCode(u8[0], u8[1], u8[2], u8[3], u8[4])
  if (!head.startsWith('%PDF')) {
    throw new Error('Erzeugte Datei ist kein gültiges PDF')
  }
}

type WritableFileStream = {
  write: (data: BufferSource) => Promise<void>
  close: () => Promise<void>
}

type SaveFileHandle = {
  createWritable: () => Promise<WritableFileStream>
}

export type PdfSaveTarget =
  | { kind: 'handle'; handle: SaveFileHandle }
  | { kind: 'download' }
  | { kind: 'cancelled' }

/**
 * Sofort im Klick-Handler aufrufen (vor PDF-Rendering),
 * sonst verliert der Browser die Schreibrechte.
 */
export async function choosePdfSaveTarget(filename: string): Promise<PdfSaveTarget> {
  const w = window as Window & {
    showSaveFilePicker?: (options: {
      suggestedName?: string
      types?: Array<{ description?: string; accept: Record<string, string[]> }>
    }) => Promise<SaveFileHandle>
  }

  if (typeof w.showSaveFilePicker !== 'function') {
    return { kind: 'download' }
  }

  try {
    const handle = await w.showSaveFilePicker({
      suggestedName: filename.endsWith('.pdf') ? filename : `${filename}.pdf`,
      types: [
        {
          description: 'PDF-Dokument',
          accept: { 'application/pdf': ['.pdf'] },
        },
      ],
    })
    return { kind: 'handle', handle }
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      return { kind: 'cancelled' }
    }
    return { kind: 'download' }
  }
}

/** Eine A4-Seite als Bild → jsPDF, mehrere Seiten nacheinander. */
export async function buildOfferPdfBlob(root: HTMLElement): Promise<Blob> {
  const pages = [...root.querySelectorAll<HTMLElement>('.offer-pdf-page')]
  const targets = pages.length > 0 ? pages : [root]

  const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true })
  const pageW = pdf.internal.pageSize.getWidth()
  const pageH = pdf.internal.pageSize.getHeight()

  for (let i = 0; i < targets.length; i++) {
    const page = targets[i]
    page.style.boxShadow = 'none'
    page.style.transform = 'none'
    page.style.width = '210mm'
    page.style.height = '297mm'
    page.style.maxHeight = '297mm'
    page.style.minHeight = '297mm'
    page.style.overflow = 'hidden'

    const captureW = page.offsetWidth
    const captureH = page.offsetHeight

    const canvas = await html2canvas(page, {
      scale: 2,
      useCORS: true,
      allowTaint: true,
      backgroundColor: '#ffffff',
      logging: false,
      scrollX: 0,
      scrollY: 0,
      width: captureW,
      height: captureH,
      windowWidth: captureW,
      windowHeight: captureH,
    })

    if (canvas.width < 100 || canvas.height < 100) {
      throw new Error(`Seiten-Capture zu klein (${canvas.width}×${canvas.height})`)
    }

    const img = canvas.toDataURL('image/jpeg', 0.92)
    if (!img.startsWith('data:image/jpeg')) {
      throw new Error('JPEG-Capture fehlgeschlagen')
    }
    if (i > 0) pdf.addPage()

    // Seitenrahmen sind exakt A4 — Bild proportional einpassen, nie hochstauchen
    const imgH = pageW * (canvas.height / canvas.width)
    const drawH = Math.min(imgH, pageH)
    const drawW = drawH === imgH ? pageW : pageH * (canvas.width / canvas.height)
    const offsetX = (pageW - drawW) / 2
    pdf.addImage(img, 'JPEG', offsetX, 0, drawW, drawH, undefined, 'FAST')
  }

  const blob = pdf.output('blob')
  const bytes = new Uint8Array(await blob.arrayBuffer())
  assertPdfMagic(bytes)
  if (bytes.byteLength < 10_000) {
    throw new Error(`PDF verdächtig klein (${bytes.byteLength} Bytes)`)
  }
  return new Blob([bytes], { type: 'application/pdf' })
}

/** Schreibt fertige PDF-Bytes an das vorher gewählte Ziel. */
export async function writePdfToTarget(
  blob: Blob,
  target: Exclude<PdfSaveTarget, { kind: 'cancelled' }>,
  filename: string,
): Promise<{ bytes: number; method: 'file' | 'download' }> {
  const raw = new Uint8Array(await blob.arrayBuffer())
  assertPdfMagic(raw)
  if (raw.byteLength < 10_000) {
    throw new Error(`PDF verdächtig klein (${raw.byteLength} Bytes)`)
  }

  const safeName = filename.endsWith('.pdf') ? filename : `${filename}.pdf`

  if (target.kind === 'handle') {
    const writable = await target.handle.createWritable()
    await writable.write(raw)
    await writable.close()
    return { bytes: raw.byteLength, method: 'file' }
  }

  const nav = window.navigator as Navigator & {
    msSaveOrOpenBlob?: (blob: Blob, name: string) => boolean
  }
  if (typeof nav.msSaveOrOpenBlob === 'function') {
    nav.msSaveOrOpenBlob(new Blob([raw], { type: 'application/pdf' }), safeName)
    return { bytes: raw.byteLength, method: 'download' }
  }

  const file = new File([raw], safeName, { type: 'application/pdf', lastModified: Date.now() })
  const url = URL.createObjectURL(file)
  const a = document.createElement('a')
  a.href = url
  a.download = safeName
  a.rel = 'noopener'
  a.style.display = 'none'
  document.body.appendChild(a)
  a.click()
  window.setTimeout(() => a.remove(), 2500)
  window.setTimeout(() => URL.revokeObjectURL(url), 300_000)
  return { bytes: raw.byteLength, method: 'download' }
}

export function mountOfferExportClone(source: HTMLElement): {
  host: HTMLDivElement
  clone: HTMLElement
} {
  const host = document.createElement('div')
  host.setAttribute('data-offer-export-host', '1')
  host.style.cssText =
    'position:fixed;left:0;top:0;width:210mm;max-width:210mm;background:#fff;z-index:2147483000;opacity:1;pointer-events:none;'

  const clone = source.cloneNode(true) as HTMLElement
  clone.removeAttribute('id')
  clone.classList.add('offer-pdf-root')
  clone.style.cssText =
    'width:210mm;transform:none !important;margin:0;box-shadow:none;gap:0;display:flex;flex-direction:column;'

  clone.querySelectorAll<HTMLElement>('.offer-pdf-page').forEach((page) => {
    page.style.boxShadow = 'none'
    page.style.height = '297mm'
    page.style.minHeight = '297mm'
    page.style.maxHeight = '297mm'
    page.style.width = '210mm'
    page.style.overflow = 'hidden'
    page.style.pageBreakAfter = 'auto'
    page.style.breakAfter = 'auto'
  })

  host.appendChild(clone)
  document.body.appendChild(host)
  return { host, clone }
}
