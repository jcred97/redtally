import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import AccountMenu from "@/app/components/auth/AccountMenu";
import SessionRefresh from "@/app/components/auth/SessionRefresh";
import { requireUser } from "@/app/lib/auth/session";
import redTallyLogo from "@/public/branding/redtally-logo.png";
import DashboardNavigation from "./_components/DashboardNavigation";

export default async function DashboardLayout({
  children,
}: {
  children: ReactNode;
}) {
  const user = await requireUser();

  return (
    <SessionRefresh userId={user.id}>
      <header className="border-b border-gray-800 bg-background text-white">
        <div className="mx-auto grid max-w-6xl grid-cols-[1fr_auto] items-center gap-x-4 px-4 pt-3 sm:grid-cols-[auto_1fr_auto] sm:gap-x-8 sm:px-6 sm:py-2">
          <Link
            href="/"
            className="flex h-8 w-32 shrink-0 items-center justify-center overflow-hidden rounded-sm focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-red-400 sm:h-9 sm:w-40"
          >
            <Image
              src={redTallyLogo}
              alt="RedTally home"
              sizes="(min-width: 640px) 215px, 172px"
              loading="eager"
              className="h-auto w-[134%] max-w-none shrink-0"
            />
          </Link>
          <DashboardNavigation />
          <AccountMenu name={user.name} email={user.email} />
        </div>
      </header>
      {children}
    </SessionRefresh>
  );
}
