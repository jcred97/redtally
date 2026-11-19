import styles from "./fields.module.css";

export const fieldLabelClass = "min-w-0 text-sm text-gray-300";
export const fieldClass = `${styles.field} mt-1 block min-h-10 w-full min-w-0 rounded-lg border border-gray-700 bg-gray-800 px-3 py-1.5 text-base text-white [color-scheme:dark] placeholder:text-gray-400 disabled:cursor-not-allowed disabled:opacity-60 sm:text-sm`;
export const choiceClass = `${styles.choice} size-4 shrink-0 accent-red-500 disabled:cursor-not-allowed disabled:opacity-60`;
