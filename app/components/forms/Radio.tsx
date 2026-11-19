import type { ComponentPropsWithRef } from "react";
import { choiceClass } from "./field-styles";

export default function Radio({ className = "", ...props }: Omit<ComponentPropsWithRef<"input">, "type">) {
  return <input {...props} type="radio" className={`${choiceClass} ${className}`} />;
}
