import Link from "next/link";
import type { ReactNode } from "react";
import { loanListHref } from "../_lib/display";

export const primaryAction = "inline-flex min-h-10 items-center justify-center rounded-lg bg-red-500 px-4 text-sm font-medium text-white transition-colors enabled:hover:bg-red-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-400 disabled:cursor-not-allowed disabled:opacity-50";
export const secondaryAction = "button-secondary inline-flex min-h-10 items-center justify-center rounded-lg px-4 text-sm font-medium";
export const loanLink = "rounded-sm text-red-300 underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-400";
export const loanPanel = "rounded-xl border border-gray-800 bg-gray-900/45 p-4 sm:p-5";

export default function LoanPage({
  title,
  children,
  back,
  action,
}: {
  title: string;
  children: ReactNode;
  back?: { href: string; label: string };
  action?: ReactNode;
}) {
  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 text-white sm:px-6 sm:py-8">
      {back && <Link href={back.href} className={`${loanLink} mb-2 inline-block text-sm`}>{back.label}</Link>}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="wrap-anywhere min-w-0 text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h1>
        {action}
      </div>
      {children}
    </main>
  );
}

export const backToLoanList = { href: loanListHref, label: "Back to Loans" };

export function LoanFacts({ facts }: { facts: { label: string; value: ReactNode }[] }) {
  return (
    <dl className={`${loanPanel} grid grid-cols-2 gap-4 sm:grid-cols-3`}>
      {facts.map(({ label, value }) => (
        <div key={label} className="min-w-0">
          <dt className="text-sm text-gray-400">{label}</dt>
          <dd className="wrap-anywhere mt-1 font-semibold">{value}</dd>
        </div>
      ))}
    </dl>
  );
}
