import Link from "next/link";
import type { ReactNode } from "react";
import { loanListHref } from "../_lib/display";

const views = [
  { id: "dashboard", label: "Dashboard", href: "/loans" },
  { id: "list", label: "Loan List", href: loanListHref },
  { id: "accounts", label: "Credit Accounts", href: "/loans/accounts" },
] as const;

export default function LoanTabs({ current, action }: {
  current: (typeof views)[number]["id"];
  action?: ReactNode;
}) {
  return (
    <div className="mt-4 flex flex-wrap items-end justify-between gap-2 border-b border-gray-800">
      <nav aria-label="Loans views" className="flex flex-wrap">
        {views.map(({ id, href, label }) => (
          <Link key={id} href={href} aria-current={current === id ? "page" : undefined} className={`-mb-px border-b-2 px-3 py-3 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-red-400 sm:px-4 ${current === id ? "border-red-500 text-white" : "border-transparent text-gray-400 hover:text-white"}`}>
            {label}
          </Link>
        ))}
      </nav>
      {action && <div className="pb-2">{action}</div>}
    </div>
  );
}
