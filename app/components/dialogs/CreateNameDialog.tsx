"use client";

import { useId, useState, type ReactNode } from "react";
import FormDialog from "@/app/components/dialogs/FormDialog";
import TextInput from "@/app/components/forms/TextInput";
import { fieldLabelClass } from "@/app/components/forms/field-styles";

type CreateNameDialogProps = {
  triggerLabel: ReactNode;
  triggerVariant?: "primary" | "menu";
  successFocusId?: string;
  title: string;
  description: string;
  placeholder: string;
  pendingMessage?: string;
  failureMessage: string;
  createAction: (
    formData: FormData
  ) => Promise<{ error: string } | { success: true } | null>;
};

export default function CreateNameDialog({
  placeholder,
  createAction,
  ...dialogProps
}: CreateNameDialogProps) {
  const inputId = useId();
  const [name, setName] = useState("");

  return (
    <FormDialog
      {...dialogProps}
      submitAction={createAction}
      onOpenAction={() => setName("")}
    >
      <div>
        <label htmlFor={inputId} className={fieldLabelClass}>
          Name
        </label>
        <TextInput
          id={inputId}
          name="name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          required
          maxLength={100}
          placeholder={placeholder}
        />
      </div>
    </FormDialog>
  );
}
