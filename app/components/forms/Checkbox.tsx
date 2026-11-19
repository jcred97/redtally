import type { ComponentPropsWithRef } from "react";
import { choiceClass } from "./field-styles";

export default function Checkbox({ className = "", ...props }: Omit<ComponentPropsWithRef<"input">, "type">) {
  return <input {...props} type="checkbox" className={`${choiceClass} ${className}`} />;
}
