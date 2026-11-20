"use client";

import { useId, useState, type FormEvent } from "react";
import AccountAvatar from "@/app/components/auth/AccountAvatar";
import FileInput from "@/app/components/forms/FileInput";
import { fieldLabelClass } from "@/app/components/forms/field-styles";
import { maxReceiptImagePixels, receiptImageTypes } from "@/app/lib/receipt-scanning/config";
import { saveProfilePhoto } from "../_lib/actions";

async function preparePhoto(file: File) {
  if (!receiptImageTypes.includes(file.type) || file.size > 8 * 1024 * 1024) {
    throw new Error("Choose a PNG, JPEG, or WebP image up to 8 MB.");
  }
  const bitmap = await createImageBitmap(file).catch(() => { throw new Error("This image could not be opened."); });
  try {
    if (bitmap.width * bitmap.height > maxReceiptImagePixels) throw new Error("Choose a photo up to 16 megapixels.");
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 192;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Could not prepare this photo.");
    const side = Math.min(bitmap.width, bitmap.height);
    context.fillStyle = "white";
    context.fillRect(0, 0, 192, 192);
    context.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, 192, 192);
    return canvas.toDataURL("image/jpeg", 0.85);
  } finally {
    bitmap.close();
  }
}

export default function ProfileSettings({ name, email, image }: { name: string; email: string; image: string | null }) {
  const id = useId();
  const [photo, setPhoto] = useState(image);
  const [pending, setPending] = useState(false);
  const [file, setFile] = useState<File>();
  const [fileVersion, setFileVersion] = useState(0);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function save(file: File | null) {
    if (pending) return;
    setPending(true);
    setError("");
    setNotice("");
    try {
      const nextPhoto = file ? await preparePhoto(file) : null;
      const result = await saveProfilePhoto(nextPhoto);
      if (result.error) {
        setError(result.error);
        return;
      }
      setPhoto(nextPhoto);
      setFile(undefined);
      setFileVersion((version) => version + 1);
      setNotice(nextPhoto ? "Profile photo saved." : "Your avatar now shows your initials.");
    } catch (error) {
      setError(error instanceof Error && file ? error.message : "Could not save your profile photo. Try again.");
    } finally {
      setPending(false);
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (file) void save(file);
  }

  return (
    <div className="grid gap-4">
      <div className="flex min-w-0 items-center gap-4">
        <div className="grid size-16 shrink-0 place-items-center overflow-hidden rounded-full bg-red-600 text-lg font-semibold">
          <AccountAvatar name={name} email={email} image={photo} />
        </div>
        <div className="min-w-0 wrap-anywhere">
          <p className="font-medium">{name}</p>
          <p className="text-sm text-gray-400">{email}</p>
        </div>
      </div>
      <form onSubmit={submit}>
        <fieldset className="grid gap-4" disabled={pending}>
          <div>
            <label htmlFor={id} className={fieldLabelClass}>Profile photo</label>
            <FileInput key={fileVersion} id={id} accept={receiptImageTypes.join(",")} onChange={(event) => {
              setFile(event.currentTarget.files?.[0]);
              setError("");
              setNotice("");
            }} />
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="submit" disabled={!file} className="min-h-10 rounded-lg bg-red-500 px-4 text-sm font-medium text-white transition-colors enabled:hover:bg-red-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-400 disabled:cursor-not-allowed disabled:opacity-50">
              {pending ? "Saving…" : "Save photo"}
            </button>
            {photo && (
              <button type="button" className="button-secondary min-h-10 rounded-lg px-4 text-sm" onClick={() => void save(null)}>
                Use initials
              </button>
            )}
          </div>
        </fieldset>
      </form>
      {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
      {notice && <p role="status" className="text-sm text-gray-300">{notice}</p>}
    </div>
  );
}
