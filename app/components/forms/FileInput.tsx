import type { ComponentPropsWithRef } from "react";
import { fieldClass } from "./field-styles";

const fileButtonClass = "file:me-3 file:cursor-pointer file:rounded-md file:border-0 file:bg-gray-700 file:px-2 file:py-0.5 file:text-sm file:font-medium file:text-white";

export default function FileInput({ hidden, className = "", ...props }: Omit<ComponentPropsWithRef<"input">, "type">) {
  return (
    <input
      {...props}
      type="file"
      hidden={hidden}
      className={hidden ? className : `${fieldClass} ${fileButtonClass} ${className}`}
    />
  );
}
