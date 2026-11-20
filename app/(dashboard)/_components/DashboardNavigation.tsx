"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function DashboardNavigation() {
  const pathname = usePathname();
  const tabs = [
    { label: "Dashboard", href: "/", current: pathname === "/" },
    {
      label: "Expense Groups",
      href: "/expense-groups",
      current: pathname === "/expense-groups" || pathname.startsWith("/spending/"),
    },
    { label: "Loans", href: "/loans", current: pathname === "/loans" || pathname.startsWith("/loans/") },
  ];

  return (
    <nav aria-label="Main navigation" className="order-last col-span-2 mt-2 flex gap-5 sm:order-none sm:col-span-1 sm:mt-0">
      {tabs.map(({ label, href, current }) => (
        <Link
          key={href}
          href={href}
          aria-current={current ? (pathname === href ? "page" : "location") : undefined}
          className={`-mb-px inline-flex min-h-11 items-center whitespace-nowrap rounded-t-sm border-b-2 px-1 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-red-400 ${current ? "border-red-500 text-white" : "border-transparent text-gray-300 hover:text-white"}`}
        >
          {label}
        </Link>
      ))}
    </nav>
  );
}
