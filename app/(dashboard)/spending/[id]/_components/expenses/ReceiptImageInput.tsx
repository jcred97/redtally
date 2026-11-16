import Image from "next/image";
import { useCallback, useEffect, useId, useRef, useState, type ChangeEvent } from "react";
import { formatExpenseDate, formatExpenseTime, parseExpenseDate, parseExpenseTime } from "@/app/lib/expenses/date";
import { formatPesoAmount, parsePesoAmount } from "@/app/lib/expenses/money";
import type { ReceiptSuggestions } from "../../_lib/receipt-fields";

const imageTypes = ["image/png", "image/jpeg", "image/webp"];
const maxImageBytes = 8 * 1024 * 1024;
const maxImagePixels = 16_000_000;
const fields = [
  { field: "title", label: "title", format: (value: string) => value },
  { field: "amount", label: "amount", format: (value: string) => formatPesoAmount(parsePesoAmount(value)) },
  { field: "date", label: "date", format: (value: string) => formatExpenseDate(parseExpenseDate(value)) },
  {
    field: "time",
    label: "time",
    format: (value: string) => {
      const minutes = parseExpenseTime(value);
      return minutes === null ? value : formatExpenseTime(minutes);
    },
  },
] as const;

const buttonClass = "shrink-0 cursor-pointer rounded-lg border border-gray-700 px-2.5 text-sm text-gray-200 transition-colors hover:border-gray-500 hover:text-white focus-visible:outline-2 focus-visible:outline-red-400 disabled:cursor-not-allowed disabled:opacity-60";

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
    <section ref={section} aria-labelledby={headingId} className="@container min-w-0 space-y-2 rounded-lg border border-gray-800 p-2.5">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
        <h3 id={headingId} className="text-sm font-medium text-gray-200">
          Receipt image <span className="text-xs font-normal text-gray-400">(optional)</span>
        </h3>
        <div className="flex flex-wrap gap-1.5">
          <button type="button" className={`${buttonClass} min-h-9`} disabled={status === "clipboard"} onClick={() => void scanImage(readClipboardImage, true)}>
            Paste receipt image
          </button>
          <button type="button" className={`${buttonClass} min-h-9`} onClick={() => picker.current?.click()}>
            Choose image
          </button>
          <input ref={picker} type="file" accept={imageTypes.join(",")} hidden onChange={chooseImage} />
        </div>
      </div>
      <p className="text-xs text-gray-400">PNG, JPEG, or WebP up to 8 MB. Read on this device.</p>
      {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
      {status && (
        <p role="status" className="text-sm text-gray-300">{status === "clipboard" ? "Waiting for clipboard…" : "Reading receipt…"}</p>
      )}
      {preview && (
        <div className={`grid gap-2 ${hasSuggestions ? "@min-[17rem]:grid-cols-[5rem_minmax(0,1fr)]" : ""}`}>
          <div className={hasSuggestions ? "min-w-0" : "flex items-start gap-2"}>
            <a href={preview.url} target="_blank" rel="noreferrer" className="block w-fit max-w-full rounded-lg focus-visible:outline-2 focus-visible:outline-red-400" aria-label="Open full-size receipt image in a new tab" title="Open full-size receipt image">
              <Image src={preview.url} alt="Receipt image preview" width={preview.width} height={preview.height} unoptimized className={`h-auto rounded-lg bg-gray-950 object-contain ${hasSuggestions ? "max-h-28 w-full" : "max-h-28 max-w-36"}`} />
            </a>
            <button type="button" aria-label="Remove image" className="min-h-7 cursor-pointer text-xs text-gray-300 underline hover:text-white" onClick={reset}>
              Remove
            </button>
          </div>
          {suggestions && (
            hasSuggestions ? (
              <div className="min-w-0 space-y-1">
                <p className="text-xs text-gray-300">Check suggestions against the image.</p>
                <ul className="space-y-1 text-sm">
                  {fields.map(({ field, label, format }) => {
                    const value = suggestions[field];
                    if (!value) return null;
                    return (
                      <li key={field} className="flex items-center justify-between gap-1.5">
                        <div className="min-w-0 wrap-anywhere leading-tight">
                          <span className="block text-xs text-gray-400 capitalize">{label}</span>
                          <span className="text-white">{format(value)}</span>
                        </div>
                        <button type="button" className={`${buttonClass} min-h-8 shrink-0`} onClick={() => {
                          onApply(field, value);
                          setApplied(`Applied suggested ${label}.`);
                        }}>
                          Use {label}
                        </button>
                      </li>
                    );
                  })}
                </ul>
                <p role="status" className="sr-only">{applied}</p>
              </div>
            ) : (
              <p role="status" className="text-sm text-gray-300">No clear title, amount, date, or time was found. Enter the details manually or try another image.</p>
            )
          )}
        </div>
      )}
    </section>
  );
}
