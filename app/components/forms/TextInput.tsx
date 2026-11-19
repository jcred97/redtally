import type { ComponentPropsWithRef } from "react";
import { fieldClass } from "./field-styles";

type TextInputProps = Omit<ComponentPropsWithRef<"input">, "type"> & {
  type?: "text" | "search" | "email" | "password" | "tel" | "url" | "number";
};

export default function TextInput({ type = "text", className = "", ...props }: TextInputProps) {
  return <input {...props} type={type} className={`${fieldClass} ${className}`} />;
}
