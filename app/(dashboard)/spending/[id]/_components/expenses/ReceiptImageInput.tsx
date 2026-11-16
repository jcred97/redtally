import Image from "next/image";
import { useCallback, useEffect, useId, useRef, useState, type ChangeEvent } from "react";
import { formatExpenseDate, parseExpenseDate } from "@/app/lib/expenses/date";
import { formatPesoAmount, parsePesoAmount } from "@/app/lib/expenses/money";
import type { ReceiptSuggestions } from "../../_lib/receipt-fields";

const imageTypes = ["image/png", "image/jpeg", "image/webp"];
const maxImageBytes = 8 * 1024 * 1024;
const maxImagePixels = 16_000_000;
const fields = [
  { field: "title", label: "merchant", format: (value: string) => value },
  { field: "amount", label: "amount", format: (value: string) => formatPesoAmount(parsePesoAmount(value)) },
  { field: "date", label: "date", format: (value: string) => formatExpenseDate(parseExpenseDate(value)) },
] as const;

const buttonClass = "cursor-pointer rounded-lg border border-gray-700 px-3 py-1.5 text-sm text-gray-200 transition-colors hover:border-gray-500 hover:text-white focus-visible:outline-2 focus-visible:outline-red-400 disabled:cursor-not-allowed disabled:opacity-60";

type Preview = { url: string; width: number; height: number };

async function readClipboardImage(): Promise<Blob> {
  if (!navigator.clipboard?.read) {
    throw new Error("Clipboard access is unavailable here. Choose a saved image.");
  }

  let items: ClipboardItems;
  try {
    items = await navigator.clipboard.read();
  } catch {
    throw new Error("Clipboard access was blocked. Choose a saved image.");
  }

  for (const item of items) {
    const type = imageTypes.find((format) => item.types.includes(format));
    if (type) return item.getType(type);
  }
  throw new Error("Copy a PNG, JPEG, or WebP image first, or choose a saved image.");
}

function pastedImage(data: DataTransfer): File | undefined {
  for (const item of data.items) {
    if (item.kind === "file" && imageTypes.includes(item.type)) {
      const image = item.getAsFile();
      if (image) return image;
    }
  }
  return Array.from(data.files).find(({ type }) => imageTypes.includes(type));
}

function toPng(image: HTMLImageElement, width: number, height: number): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Image conversion is unavailable.");
  context.fillStyle = "white";
  context.fillRect(0, 0, width, height);
  context.drawImage(image, 0, 0);
  return new Promise((resolve, reject) => {
    canvas.toBlob((result) => {
      canvas.width = 0;
      canvas.height = 0;
      if (result) resolve(result);
      else reject(new Error("The image could not be converted."));
    }, "image/png");
  });
}

export default function ReceiptImageInput({
  onApply,
}: {
  onApply: (field: keyof ReceiptSuggestions, value: string) => void;
}) {
  const headingId = useId();
  const section = useRef<HTMLElement>(null);
  const picker = useRef<HTMLInputElement>(null);
  const operation = useRef<AbortController | null>(null);
  const imageUrl = useRef<string | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [suggestions, setSuggestions] = useState<ReceiptSuggestions | null>(null);
  const [status, setStatus] = useState<"clipboard" | "reading" | null>(null);
  const [error, setError] = useState("");
  const [applied, setApplied] = useState("");

  const releaseImage = useCallback(() => {
    operation.current?.abort();
    operation.current = null;
    if (imageUrl.current) {
      URL.revokeObjectURL(imageUrl.current);
      imageUrl.current = null;
    }
  }, []);

  const reset = useCallback(() => {
    releaseImage();
    setPreview(null);
    setSuggestions(null);
    setStatus(null);
    setError("");
    setApplied("");
  }, [releaseImage]);

  const scanImage = useCallback(async (getImage: () => Blob | Promise<Blob>, fromClipboard = false) => {
    reset();
    const controller = new AbortController();
    operation.current = controller;
    const { signal } = controller;
    setStatus(fromClipboard ? "clipboard" : "reading");

    try {
      const blob = await getImage();
      if (signal.aborted) return;
      if (!imageTypes.includes(blob.type) || blob.size === 0) {
        throw new Error("Choose a PNG, JPEG, or WebP image.");
      }
      if (blob.size > maxImageBytes) throw new Error("Choose an image up to 8 MB.");

      setStatus("reading");
      const url = URL.createObjectURL(blob);
      imageUrl.current = url;
      const image = new window.Image();
      image.src = url;
      await image.decode().catch(() => { throw new Error("This image could not be opened. Try another image."); });
      if (signal.aborted) return;

      const { naturalWidth: width, naturalHeight: height } = image;
      if (!width || !height || width * height > maxImagePixels) {
        throw new Error("Choose an image up to 16 megapixels, or crop it to the receipt.");
      }
      setPreview({ url, width, height });

      try {
        const [{ readReceiptText }, { suggestReceiptFields }] = await Promise.all([
          import("../../_lib/receipt-ocr"),
          import("../../_lib/receipt-fields"),
        ]);
        if (signal.aborted) return;
        // Scan a browser-decoded PNG so WebP variants use the same OCR input.
        const ocrImage = blob.type === "image/webp" ? await toPng(image, width, height) : blob;
        if (signal.aborted) return;
        const text = await readReceiptText(ocrImage, signal);
        if (!signal.aborted) setSuggestions(suggestReceiptFields(text));
      } catch {
        if (!signal.aborted) setError("The receipt could not be read. Enter the expense details below or try another image.");
      }
    } catch (cause) {
      if (signal.aborted) return;
      releaseImage();
      setError(cause instanceof Error ? cause.message : "The image could not be opened.");
      setStatus(null);
    } finally {
      if (!signal.aborted) setStatus(null);
    }
  }, [releaseImage, reset]);

  useEffect(() => {
    const fieldset = section.current?.closest("fieldset");
    const dialog = section.current?.closest("dialog");
    function handlePaste(event: ClipboardEvent) {
      if (!dialog?.open || fieldset?.disabled || !event.clipboardData) return;
      const image = pastedImage(event.clipboardData);
      if (!image) return;
      event.preventDefault();
      void scanImage(() => image);
    }
    dialog?.addEventListener("paste", handlePaste);
    return () => {
      dialog?.removeEventListener("paste", handlePaste);
      releaseImage();
    };
  }, [releaseImage, scanImage]);

  function chooseImage(event: ChangeEvent<HTMLInputElement>) {
    const image = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (image) void scanImage(() => image);
  }

  const hasSuggestions = suggestions !== null && fields.some(({ field }) => Boolean(suggestions[field]));

  return (
    <section ref={section} aria-labelledby={headingId} className="space-y-2 rounded-lg border border-gray-800 p-3">
      <h3 id={headingId} className="text-sm font-medium text-gray-200">
        Receipt image <span className="text-xs font-normal text-gray-400">(optional)</span>
      </h3>
      <div className="flex flex-wrap gap-2">
        <button type="button" className={buttonClass} disabled={status === "clipboard"} onClick={() => void scanImage(readClipboardImage, true)}>
          Paste receipt image
        </button>
        <button type="button" className={buttonClass} onClick={() => picker.current?.click()}>
          Choose image
        </button>
        <input ref={picker} type="file" accept={imageTypes.join(",")} hidden onChange={chooseImage} />
      </div>
      <p className="text-xs text-gray-400">RedTally reads the image on this device. PNG, JPEG, or WebP up to 8 MB.</p>
      {preview && (
        <div className="space-y-2">
          <Image src={preview.url} alt="Receipt image preview" width={preview.width} height={preview.height} unoptimized className="h-auto max-h-48 w-full rounded-lg bg-gray-950 object-contain" />
          <button type="button" className="cursor-pointer text-xs text-gray-300 underline hover:text-white" onClick={reset}>
            Remove image
          </button>
        </div>
      )}
      {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
      {status && (
        <p role="status" className="text-sm text-gray-300">{status === "clipboard" ? "Waiting for clipboard…" : "Reading receipt…"}</p>
      )}
      {suggestions && (
        hasSuggestions ? (
          <div className="space-y-2">
            <p className="text-sm text-gray-300">Compare these suggestions with the image before applying them.</p>
            <dl className="space-y-1.5 text-sm">
              {fields.map(({ field, label, format }) => {
                const value = suggestions[field];
                if (!value) return null;
                return (
                  <div key={field}>
                    <dt className="text-xs text-gray-400 capitalize">{label}</dt>
                    <dd className="flex flex-wrap items-center justify-between gap-2">
                      <span className="min-w-0 wrap-anywhere text-white">{format(value)}</span>
                      <button type="button" className={buttonClass} onClick={() => {
                        onApply(field, value);
                        setApplied(`Applied suggested ${label}.`);
                      }}>
                        Use {label}
                      </button>
                    </dd>
                  </div>
                );
              })}
            </dl>
            <p role="status" className="sr-only">{applied}</p>
          </div>
        ) : (
          <p role="status" className="text-sm text-gray-300">No clear merchant, amount, or date was found. Enter the details below or try another image.</p>
        )
      )}
    </section>
  );
}
