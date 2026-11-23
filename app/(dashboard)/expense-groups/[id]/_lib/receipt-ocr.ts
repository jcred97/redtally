import type { Worker as OcrWorker } from "tesseract.js";

const ASSET_PATH = "/receipt-ocr/v7.0.0";
const OCR_TIMEOUT_MS = 45_000;

type ReceiptText = { text: string; shopFooter?: string };

export async function readReceiptText(
  image: Blob, { width, height }: { width: number; height: number }, signal: AbortSignal,
): Promise<ReceiptText> {
  signal.throwIfAborted();

  let worker: OcrWorker | undefined;
  let primary: ReceiptText | undefined;
  let finished = false;
  let interrupt: (reason: unknown) => void = () => {};
  const interrupted = new Promise<never>((_, reject) => { interrupt = reject; });
  const abort = () => interrupt(signal.reason);
  signal.addEventListener("abort", abort, { once: true });
  const timeout = window.setTimeout(() => {
    interrupt(new Error("Reading the receipt took too long. Try a smaller image."));
  }, OCR_TIMEOUT_MS);

  async function recognize() {
    const { createWorker, OEM, PSM } = await import("tesseract.js");
    if (finished) return { text: "" };

    const assetPath = new URL(ASSET_PATH, window.location.origin).href;
    const initializedWorker = await createWorker("eng", OEM.LSTM_ONLY, {
      workerPath: `${assetPath}/worker.min.js`,
      corePath: assetPath,
      langPath: assetPath,
      workerBlobURL: false,
      errorHandler: () => interrupt(new Error("The receipt reader could not process this image.")),
    });

    // Tesseract exposes its worker once initialization completes, which can outlast the dialog.
    if (finished) {
      await initializedWorker.terminate();
      return { text: "" };
    }

    worker = initializedWorker;
    const { data } = await worker.recognize(image, {}, { text: true, blocks: true });
    primary = { text: data.text };
    if (finished || !/\border total\b/i.test(data.text) || !/\bmerchandise subtotal\b/i.test(data.text)) return primary;

    const shopLine = data.blocks?.flatMap((block) => block.paragraphs.flatMap((paragraph) => paragraph.lines))
      .find((line) => /\bview shop\b/i.test(line.text));
    if (!shopLine) return primary;

    // Read the shop and checkout rows separately from the dense tracking timeline.
    const { y0, y1 } = shopLine.bbox;
    const top = Math.max(0, y0 - (y1 - y0));
    if (top >= height) return primary;
    await worker.setParameters({ tessedit_pageseg_mode: PSM.SPARSE_TEXT });
    if (finished) return primary;
    const footer = await worker.recognize(image, { rectangle: { left: 0, top, width, height: height - top } });
    return { text: data.text, shopFooter: footer.data.text };
  }

  try {
    return await Promise.race([interrupted, recognize()]);
  } catch (error) {
    if (primary && !signal.aborted) return primary;
    throw error;
  } finally {
    finished = true;
    signal.removeEventListener("abort", abort);
    window.clearTimeout(timeout);
    await worker?.terminate();
  }
}
