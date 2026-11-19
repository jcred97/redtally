import Image from "next/image";
import { useCallback, useEffect, useId, useRef, useState, type ChangeEvent } from "react";
import FileInput from "@/app/components/forms/FileInput";
import { formatExpenseDate, formatExpenseTime, parseExpenseDate, parseExpenseTime } from "@/app/lib/expenses/date";
import { formatPesoAmount, parsePesoAmount } from "@/app/lib/expenses/money";
import { maxReceiptImagePixels, providers, receiptImageTypes, type ReceiptProvider, type ReceiptSuggestions } from "@/app/lib/receipt-scanning/config";
import ReceiptAiControls from "./ReceiptAiControls";

const maxImageBytes = 8 * 1024 * 1024;
const fields = [
  { field: "title", label: "title", format: (value: string) => value },
  { field: "merchant", label: "merchant", format: (value: string) => value },
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

const buttonClass = "button-secondary shrink-0 rounded-lg px-2.5 text-sm font-medium";

type Preview = { url: string; width: number; height: number; image: Blob };

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
    const type = receiptImageTypes.find((format) => item.types.includes(format));
    if (type) return item.getType(type);
  }
  throw new Error("Copy a PNG, JPEG, or WebP image first, or choose a saved image.");
}

function pastedImage(data: DataTransfer): File | undefined {
  for (const item of data.items) {
    if (item.kind === "file" && receiptImageTypes.includes(item.type)) {
      const image = item.getAsFile();
      if (image) return image;
    }
  }
  return Array.from(data.files).find(({ type }) => receiptImageTypes.includes(type));
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
  const [localSuggestions, setLocalSuggestions] = useState<ReceiptSuggestions | null>(null);
  const [aiResult, setAiResult] = useState<{ provider: ReceiptProvider; suggestions: ReceiptSuggestions } | null>(null);
  const [showAi, setShowAi] = useState(false);
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
    setLocalSuggestions(null);
    setAiResult(null);
    setShowAi(false);
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
      if (!receiptImageTypes.includes(blob.type) || blob.size === 0) {
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
      if (!width || !height || width * height > maxReceiptImagePixels) {
        throw new Error("Choose an image up to 16 megapixels, or crop it to the receipt.");
      }
      setPreview({ url, width, height, image: blob });

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
        if (!signal.aborted) setLocalSuggestions(suggestReceiptFields(text));
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

  const currentAiResult = showAi ? aiResult : null;
  const suggestions = currentAiResult ? currentAiResult.suggestions : localSuggestions;
  const hasSuggestions = suggestions !== null && fields.some(({ field }) => Boolean(suggestions[field]));
  const imageButtonClass = `${buttonClass} min-h-10`;

  return (
    <section ref={section} aria-labelledby={headingId} className="flex min-w-0 flex-col gap-2 rounded-lg border border-gray-800 p-2 sm:gap-3 sm:p-3">
      <h3 id={headingId} className="text-sm font-medium text-gray-200">
        Receipt image{!preview && <span className="text-xs font-normal text-gray-400"> (optional)</span>}
      </h3>
      <div className="flex flex-wrap items-center gap-2">
        {preview && (
          <a href={preview.url} target="_blank" rel="noreferrer" className="grid size-10 shrink-0 place-items-center overflow-hidden rounded-lg bg-gray-950 focus-visible:outline-2 focus-visible:outline-red-400" aria-label="Open full-size receipt image in a new tab" title="Open full-size receipt image">
            <Image src={preview.url} alt="Receipt image preview" width={preview.width} height={preview.height} unoptimized className="size-full object-contain" />
          </a>
        )}
        <button type="button" className={imageButtonClass} disabled={status === "clipboard"} onClick={() => void scanImage(readClipboardImage, true)}>
          Paste Image
        </button>
        <button type="button" className={imageButtonClass} onClick={() => picker.current?.click()}>
          Choose Image
        </button>
        <FileInput ref={picker} accept={receiptImageTypes.join(",")} hidden onChange={chooseImage} />
        {preview && (
          <button type="button" aria-label="Remove image" className="min-h-10 cursor-pointer rounded px-1 text-sm text-gray-300 underline hover:text-white focus-visible:outline-2 focus-visible:outline-red-400" onClick={reset}>
            Remove
          </button>
        )}
      </div>
      {!preview && <p className="text-xs text-gray-400">PNG, JPEG, or WebP up to 8 MB. Read on this device.</p>}
      {error && !currentAiResult && <p role="alert" className="text-sm text-red-400">{error}</p>}
      {status && (
        <p role="status" className="text-sm text-gray-300">{status === "clipboard" ? "Waiting for clipboard…" : "Reading receipt…"}</p>
      )}
      {(hasSuggestions || aiResult) && (
        <div className="flex flex-wrap items-baseline justify-between gap-x-2">
          <p role="status" className="text-xs font-medium text-gray-300">
            {currentAiResult ? `Suggestions from ${providers[currentAiResult.provider]}` : "On-device suggestions"}
          </p>
          {aiResult && localSuggestions && fields.some(({ field }) => Boolean(localSuggestions[field])) && (
            <button type="button" className="min-h-8 cursor-pointer rounded px-1 text-xs text-gray-300 underline focus-visible:outline-2 focus-visible:outline-red-400"
              onClick={() => { setShowAi(!showAi); setApplied(""); }}>
              {showAi ? "Show on-device suggestions" : `Show ${providers[aiResult.provider]} suggestions`}
            </button>
          )}
        </div>
      )}
      {suggestions && (hasSuggestions ? (
        <>
          <ul className="grid grid-cols-2 gap-2">
            {fields.map(({ field, label, format }) => {
              const value = suggestions[field];
              if (!value) return null;
              const valueId = `${headingId}-${field}`;
              return (
                <li key={field} className="min-w-0 last:odd:col-span-full">
                  <button type="button" aria-label={`Use ${label}`} aria-describedby={valueId} className={`${buttonClass} grid h-full min-h-11 w-full grid-cols-[minmax(0,1fr)_auto] content-start gap-x-2 py-2 text-left leading-tight`} onClick={() => {
                    onApply(field, value);
                    setApplied(`Applied suggested ${label}.`);
                  }}>
                    <span className="text-xs capitalize text-gray-400">{label}</span>
                    <span className="text-xs text-gray-200">Use</span>
                    <span id={valueId} className="col-span-full wrap-anywhere text-white">{format(value)}</span>
                  </button>
                </li>
              );
            })}
          </ul>
          <p role="status" className="sr-only">{applied}</p>
        </>
      ) : (
        <p role="status" className="text-sm text-gray-300">No clear expense details were found. Enter them manually or try another image.</p>
      ))}
      {preview && (
        <ReceiptAiControls key={preview.url} image={preview.image} onSuggestions={(provider, result) => {
          setAiResult({ provider, suggestions: result });
          setShowAi(true);
          setApplied("");
        }} />
      )}
    </section>
  );
}
