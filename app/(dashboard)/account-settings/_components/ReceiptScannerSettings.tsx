"use client";

import { useId, useState, type FormEvent } from "react";
import Select from "@/app/components/forms/Select";
import TextInput from "@/app/components/forms/TextInput";
import { fieldLabelClass } from "@/app/components/forms/field-styles";
import { providers, type ReceiptConnection } from "@/app/lib/receipt-scanning/config";
import { disconnectReceiptScanner, saveReceiptConnection } from "../_lib/actions";

const providerOptions = [
  { value: "", label: "Choose a provider", disabled: true },
  ...Object.entries(providers).map(([value, label]) => ({ value, label })),
];

export default function ReceiptScannerSettings({ initialConnection, onConnected, onCancel, onPendingChange }: {
  initialConnection: ReceiptConnection | null;
  onConnected?: (connection: ReceiptConnection) => void;
  onCancel?: () => void;
  onPendingChange?: (pending: boolean) => void;
}) {
  const id = useId();
  const [connection, setConnection] = useState(initialConnection);
  const [provider, setProvider] = useState(initialConnection?.provider ?? "");
  const [replacing, setReplacing] = useState(false);
  const [pending, setPending] = useState<"save" | "disconnect" | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function updateConnection(action: () => ReturnType<typeof saveReceiptConnection>, operation: "save" | "disconnect") {
    if (pending) return;
    setPending(operation);
    onPendingChange?.(true);
    setError("");
    setNotice("");
    try {
      const result = await action();
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setConnection(result.connection);
      setProvider(result.connection?.provider ?? "");
      setReplacing(false);
      setNotice(result.connection ? "Receipt scanner connected." : "Provider disconnected.");
      if (result.connection) onConnected?.(result.connection);
    } catch {
      setError("Could not update your receipt scanning settings. Try again.");
    } finally {
      setPending(null);
      onPendingChange?.(false);
    }
  }

  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // The setup dialog can be opened from inside a separate expense form.
    event.stopPropagation();
    const data = new FormData(event.currentTarget);
    void updateConnection(() => saveReceiptConnection(data), "save");
  }

  return (
    <div className="grid gap-4">
      <p className="text-sm text-gray-300">
        Connect a provider to scan a receipt when you choose. Receipts are read on your device by default.
      </p>
      {connection && !replacing ? (
        <div className="grid gap-4">
          <dl className="grid gap-1">
            <div className="flex gap-3"><dt className="text-gray-400">Provider</dt><dd>{providers[connection.provider]}</dd></div>
            <div className="flex gap-3"><dt className="text-gray-400">API key</dt><dd className="font-mono">••••{connection.keySuffix}</dd></div>
          </dl>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="button-secondary min-h-10 rounded-lg px-4 text-sm" disabled={Boolean(pending)} onClick={() => {
              setError("");
              setNotice("");
              setReplacing(true);
            }}>Replace key</button>
            <button type="button" className="button-secondary min-h-10 rounded-lg px-4 text-sm" disabled={Boolean(pending)} onClick={() => {
              void updateConnection(disconnectReceiptScanner, "disconnect");
            }}>{pending === "disconnect" ? "Disconnecting…" : "Disconnect"}</button>
          </div>
        </div>
      ) : (
        <form onSubmit={save}>
          <fieldset disabled={Boolean(pending)} className="grid gap-4">
            <div>
              <label htmlFor={`${id}-provider`} className={fieldLabelClass}>Provider</label>
              <Select id={`${id}-provider`} name="provider" value={provider} onChange={setProvider} options={providerOptions} required />
            </div>
            {provider && (
              <div>
                <label htmlFor={`${id}-key`} className={fieldLabelClass}>API key</label>
                <TextInput id={`${id}-key`} name="apiKey" type="password" autoComplete="off" maxLength={512} required />
                <p className="mt-2 text-xs text-gray-400">Testing the connection makes a small request using your provider quota.</p>
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              <button
                type="submit"
                className="min-h-10 cursor-pointer rounded-lg bg-red-500 px-4 text-sm font-medium text-white transition-colors enabled:hover:bg-red-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-400 disabled:cursor-not-allowed disabled:opacity-50"
                disabled={!provider}
              >
                {pending === "save" ? "Testing…" : "Test & Save"}
              </button>
              {(onCancel || replacing) && (
                <button type="button" className="button-secondary min-h-10 rounded-lg px-4 text-sm" onClick={() => {
                  setError("");
                  setReplacing(false);
                  setProvider(connection?.provider ?? "");
                  onCancel?.();
                }}>Cancel</button>
              )}
            </div>
          </fieldset>
        </form>
      )}
      {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
      {notice && <p role="status" className="text-sm text-gray-300">{notice}</p>}
    </div>
  );
}
