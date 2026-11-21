import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import ReceiptScannerSettings from "@/app/(dashboard)/account-settings/_components/ReceiptScannerSettings";
import { loadReceiptConnection } from "@/app/(dashboard)/account-settings/_lib/actions";
import { maxAiImageBytes, providers, type ReceiptConnection, type ReceiptProvider, type ReceiptSuggestions } from "@/app/lib/receipt-scanning/config";

type Settings =
  | { status: "loading" }
  | { status: "ready"; connection: ReceiptConnection | null }
  | { status: "error"; message: string };

async function prepareUpload(image: Blob) {
  if (image.size <= maxAiImageBytes) return image;
  const bitmap = await createImageBitmap(image);
  try {
    const scale = Math.min(1, 2400 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Image conversion is unavailable.");
    context.fillStyle = "white";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob && blob.size <= maxAiImageBytes) resolve(blob);
        else reject(new Error("Could not resize receipt."));
      }, "image/jpeg", 0.86);
    });
  } finally {
    bitmap.close();
  }
}

export default function ReceiptAiControls({ image, onSuggestions }: {
  image: Blob;
  onSuggestions: (provider: ReceiptProvider, suggestions: ReceiptSuggestions) => void;
}) {
  const id = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const saving = useRef(false);
  const scanRequest = useRef<AbortController | null>(null);
  const [settings, setSettings] = useState<Settings>({ status: "loading" });
  const [retry, setRetry] = useState(0);
  const [setupOpen, setSetupOpen] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState("");

  useEffect(() => {
    let active = true;
    void loadReceiptConnection().then((result) => {
      if (!active) return;
      setSettings("error" in result
        ? { status: "error", message: result.error }
        : { status: "ready", connection: result.connection });
    }).catch(() => {
      if (active) setSettings({ status: "error", message: "Could not load receipt scanning settings. Try again." });
    });
    return () => { active = false; };
  }, [retry]);

  useEffect(() => () => scanRequest.current?.abort(), []);

  useEffect(() => {
    if (setupOpen) dialog.current?.showModal();
  }, [setupOpen]);

  function reloadSettings() {
    setSettings({ status: "loading" });
    setRetry((count) => count + 1);
  }

  async function scan(provider: ReceiptProvider) {
    if (scanRequest.current) return;
    const controller = new AbortController();
    scanRequest.current = controller;
    const { signal } = controller;
    setScanning(true);
    setScanError("");
    try {
      const upload = await prepareUpload(image).catch(() => {
        throw new Error("Could not prepare this image for AI scanning. Try cropping it to the receipt.");
      });
      if (signal.aborted) return;
      const response = await fetch("/api/receipt-scan", {
        method: "POST",
        headers: { "Content-Type": upload.type, "X-Receipt-Provider": provider },
        body: upload,
        signal,
      });
      if (signal.aborted) return;
      if (response.status === 409) reloadSettings();
      const result: { suggestions?: ReceiptSuggestions; error?: string } = await response.json();
      if (signal.aborted) return;
      if (response.ok && result.suggestions) {
        onSuggestions(provider, result.suggestions);
      } else {
        setScanError(result.error ?? "Could not scan this receipt. Try again.");
      }
    } catch (cause) {
      if (!signal.aborted) setScanError(cause instanceof Error && cause.message.startsWith("Could not prepare")
        ? cause.message : "Could not scan this receipt. Try again.");
    } finally {
      scanRequest.current = null;
      if (!signal.aborted) setScanning(false);
    }
  }

  const connection = settings.status === "ready" ? settings.connection : null;
  const providerName = connection ? providers[connection.provider] : null;
  const error = settings.status === "error" ? settings.message : scanError;
  return (
    <div className="grid justify-items-start gap-2 border-t border-gray-800 pt-3">
      {settings.status === "ready" ? (
        <>
          <button type="button" className="button-secondary min-h-10 rounded-lg px-2.5 text-sm font-medium"
            disabled={scanning} aria-haspopup={connection ? undefined : "dialog"}
            aria-describedby={connection ? `${id}-consent` : undefined}
            onClick={() => {
              if (connection) void scan(connection.provider);
              else setSetupOpen(true);
            }}>
            {scanning ? `Scanning with ${providerName}…` : providerName ? `Scan with ${providerName}` : "Set up AI scanning"}
          </button>
          {providerName && (
            <p id={`${id}-consent`} className="text-xs text-gray-400">
              Scanning sends this receipt image to {providerName} and uses your quota or balance.
            </p>
          )}
          {scanning && <span role="status" className="sr-only">Scanning receipt with {providerName}.</span>}
        </>
      ) : settings.status === "error" ? (
        <button type="button" className="button-secondary min-h-10 rounded-lg px-4 text-sm font-medium" onClick={reloadSettings}>
          Retry loading AI scanning
        </button>
      ) : <p role="status" className="text-xs text-gray-400">Loading AI scanning options…</p>}
      {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
      {setupOpen && createPortal(
        <dialog ref={dialog} aria-labelledby={`${id}-setup`}
          onCancel={(event) => {
            event.stopPropagation();
            if (saving.current) event.preventDefault();
          }}
          onClose={(event) => {
            event.stopPropagation();
            setSetupOpen(false);
          }}
          className="m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-md overflow-y-auto rounded-xl border border-gray-800 bg-gray-900 p-4 text-white backdrop:bg-black/70 sm:p-6">
          <h3 id={`${id}-setup`} className="mb-4 text-lg font-semibold">Receipt scanning settings</h3>
          <ReceiptScannerSettings initialConnection={null}
            onPendingChange={(pending) => { saving.current = pending; }}
            onConnected={(connected) => {
              dialog.current?.close();
              setSettings({ status: "ready", connection: connected });
              setScanError("");
            }}
            onCancel={() => dialog.current?.close()} />
        </dialog>,
        document.body,
      )}
    </div>
  );
}
