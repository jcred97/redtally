import Link from "next/link";
import type { ReactNode } from "react";

export default function ExpenseGroupEmptyState({ icon, title, compact = false, action, children }: {
  icon: string;
  title: string;
  compact?: boolean;
  action?: { href: string; label: string };
  children?: ReactNode;
}) {
  return (
    <div className={`flex flex-col items-center justify-center text-center ${compact ? "py-8" : "py-32"}`}>
      <div aria-hidden="true" className="mb-4 flex size-16 items-center justify-center rounded-full border border-gray-800 bg-gray-900">
        <span className="text-2xl">{icon}</span>
      </div>
      <p className="font-medium text-gray-300">{title}</p>
      {children}
      {action && (
        <Link href={action.href} className="button-secondary mt-3 inline-flex min-h-10 items-center rounded-lg px-4 text-sm font-medium">
          {action.label}
        </Link>
      )}
    </div>
  );
}
