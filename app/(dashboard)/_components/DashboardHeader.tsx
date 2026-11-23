"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ComponentProps } from "react";
import AccountMenu from "@/app/components/auth/AccountMenu";
import redTallyLogo from "@/public/branding/redtally-logo.png";
import MobileNavigation from "./MobileNavigation";

export default function DashboardHeader(account: ComponentProps<typeof AccountMenu>) {
  const pathname = usePathname();
  const viewingExpenseGroups = pathname === "/expense-groups" || pathname.startsWith("/expense-groups/");
  const frame = pathname === "/" || viewingExpenseGroups ? "dashboard-frame" : "mx-auto max-w-6xl px-4 sm:px-6";
  const tabs = [
    { label: "Dashboard", href: "/", current: pathname === "/" },
    {
      label: "Expense Groups",
      href: "/expense-groups",
      current: viewingExpenseGroups,
    },
  ];
  const links: ComponentProps<typeof MobileNavigation>["links"] = tabs.map(({ label, href, current }) => ({
    label,
    href,
    ariaCurrent: current ? (pathname === href ? "page" : "location") : undefined,
  }));

  return (
    <header className="border-b border-gray-800 bg-background text-white">
      <div className={`${frame} grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 py-2 sm:grid-cols-[auto_1fr_auto] sm:gap-x-4 md:gap-x-8`}>
        <MobileNavigation links={links} pathname={pathname} />
        <Link
          href="/"
          className="flex h-8 w-32 shrink-0 items-center justify-center justify-self-center overflow-hidden rounded-sm focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-red-400 sm:h-9 sm:w-40 sm:justify-self-start"
        >
          <Image
            src={redTallyLogo}
            alt="RedTally home"
            sizes="(min-width: 640px) 215px, 172px"
            loading="eager"
            className="h-auto w-[134%] max-w-none shrink-0"
          />
        </Link>
        <nav aria-label="Main navigation" className="hidden gap-3 sm:flex md:gap-5">
          {links.map(({ label, href, ariaCurrent }) => (
            <Link
              key={href}
              href={href}
              aria-current={ariaCurrent}
              className={`-mb-px inline-flex min-h-11 items-center whitespace-nowrap rounded-t-sm border-b-2 px-1 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-red-400 ${ariaCurrent ? "border-red-500 text-white" : "border-transparent text-gray-300 hover:text-white"}`}
            >
              {label}
            </Link>
          ))}
        </nav>
        <AccountMenu {...account} />
      </div>
    </header>
  );
}
