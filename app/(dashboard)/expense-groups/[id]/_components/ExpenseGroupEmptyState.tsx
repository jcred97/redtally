import type { ReactNode } from "react";

export default function ExpenseGroupEmptyState({ icon, title, children }: {
  icon: string;
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-32 text-center">
      <div aria-hidden="true" className="mb-4 flex size-16 items-center justify-center rounded-full border border-gray-800 bg-gray-900">
        <span className="text-2xl">{icon}</span>
      </div>
      <p className="font-medium text-gray-300">{title}</p>
      {children}
    </div>
  );
}
