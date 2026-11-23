import type { TextContent } from "pdfjs-dist/types/src/display/api";

export type PdfTextPage = {
  pageNumber: number;
  items: Array<{ text: string; x: number; y: number; width: number; height: number }>;
};

const MAX_PDF_PAGES = 30;
const MAX_PDF_TEXT_ITEMS = 30_000;
const MAX_PDF_TEXT_CHARACTERS = 1_000_000;

class StatementPdfLimitError extends Error {}

export async function readStatementPdfText(file: File): Promise<PdfTextPage[]> {
  const [data, pdf] = await Promise.all([file.arrayBuffer(), import("pdfjs-dist/legacy/build/pdf.mjs")]);
  // Next.js emits this pinned worker as a same-origin static asset.
  pdf.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/legacy/build/pdf.worker.min.mjs", import.meta.url).toString();

  const loading = pdf.getDocument({
    data,
    stopAtErrors: true,
    useWasm: false,
    disableFontFace: true,
    verbosity: pdf.VerbosityLevel.ERRORS,
  });

  try {
    const document = await loading.promise;
    if (document.numPages > MAX_PDF_PAGES) {
      throw new StatementPdfLimitError(`Choose a PDF with up to ${MAX_PDF_PAGES} pages.`);
    }

    const pages: PdfTextPage[] = [];
    let itemCount = 0;
    let characterCount = 0;

    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const viewport = page.getViewport({ scale: 1 });
      const scale = viewport.scale * viewport.userUnit;
      const items: PdfTextPage["items"] = [];
      const content: ReadableStream<TextContent> = page.streamTextContent();
      const reader = content.getReader();
      try {
        while (true) {
          const chunk = await reader.read();
          if (chunk.done) break;

          for (const item of chunk.value.items) {
            itemCount += 1;
            if ("str" in item) characterCount += item.str.length;
            if (itemCount > MAX_PDF_TEXT_ITEMS || characterCount > MAX_PDF_TEXT_CHARACTERS) {
              throw new StatementPdfLimitError("This PDF contains too much text. Try importing fewer pages at a time.");
            }
            if (!("str" in item) || !item.str.trim()) continue;

            // The viewport accounts for the crop box, page rotation, and PDF's upward y axis.
            const [a, b, , , x, y] = pdf.Util.transform(viewport.transform, item.transform);
            if (a <= 0 || Math.abs(b) > a / 5) continue;
            const width = item.width * scale;
            const height = item.height * scale;
            if (![x, y, width, height].every(Number.isFinite)) continue;
            items.push({ text: item.str, x, y, width, height });
          }
        }
      } finally {
        reader.releaseLock();
      }
      page.cleanup();
      pages.push({ pageNumber, items });
    }

    return pages;
  } catch (error) {
    if (error instanceof StatementPdfLimitError) throw error;
    if (error instanceof pdf.PasswordException) {
      throw new Error("This PDF is password protected. Save an unlocked copy and try again.");
    }
    throw new Error("This PDF could not be read. Choose a valid bank statement PDF with selectable text.");
  } finally {
    await loading.destroy().catch(() => {});
  }
}
