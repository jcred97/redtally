import type { ComponentPropsWithRef } from "react";
import styles from "./fields.module.css";

type SelectProps = ComponentPropsWithRef<"select"> & {
  /** Wrap a long selected label; className then styles the visible field wrapper. */
  displayValue?: string;
};

export default function Select({ className = "", displayValue, ...props }: SelectProps) {
  if (displayValue !== undefined) {
    return (
      <div className={`${styles.wrappingSelect} ${className}`}>
        <span aria-hidden="true" className={styles.displayValue}>{displayValue}</span>
        <select {...props} className={`${styles.select} ${styles.overlaySelect}`} />
      </div>
    );
  }

  return <select {...props} className={`${styles.select} ${className}`} />;
}
