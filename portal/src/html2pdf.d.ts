declare module 'html2pdf.js' {
  interface Html2PdfWorker {
    set: (opts: Record<string, unknown>) => Html2PdfWorker
    from: (el: HTMLElement | string) => Html2PdfWorker
    save: () => Promise<void>
    outputPdf: (type?: string, options?: unknown) => Promise<Blob | string | ArrayBuffer>
  }

  const html2pdf: () => Html2PdfWorker
  export default html2pdf
}
