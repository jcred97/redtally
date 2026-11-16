import type { Worker as OcrWorker } from "tesseract.js";

const ASSET_PATH = "/receipt-ocr/v7.0.0";
const OCR_TIMEOUT_MS = 45_000;

export async function readReceiptText(image: Blob, signal: AbortSignal): Promise<string> {
  signal.throwIfAborted();

  let worker: OcrWorker | undefined;
  let finished = false;
  let interrupt: (reason: unknown) => void = () => {};
  const interrupted = new Promise<never>((_, reject) => { interrupt = reject; });
  const abort = () => interrupt(signal.reason);
  signal.addEventListener("abort", abort, { once: true });
  const timeout = window.setTimeout(() => {
    interrupt(new Error("Reading the receipt took too long. Try a smaller image."));
  }, OCR_TIMEOUT_MS);

  async function recognize() {
    const { createWorker, OEM } = await import("tesseract.js");
    if (finished) return "";

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
      return "";
    }

    worker = initializedWorker;
    const { data } = await worker.recognize(image);
    return data.text;
  }

  try {
    return await Promise.race([interrupted, recognize()]);
  } finally {
    finished = true;
    signal.removeEventListener("abort", abort);
    window.clearTimeout(timeout);
    await worker?.terminate();
  }
}
