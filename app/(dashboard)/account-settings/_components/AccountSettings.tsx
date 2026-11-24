"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { ComponentProps } from "react";
import type { ReceiptConnection } from "@/app/lib/receipt-scanning/config";
import ProfileSettings from "./ProfileSettings";
import ReceiptScannerSettings from "./ReceiptScannerSettings";

const sections = [
  { id: "profile", label: "Profile", href: "/account-settings" },
  { id: "receipt-scanning", label: "Receipt scanning", href: "/account-settings?section=receipt-scanning" },
];

type AccountSettingsProps = {
  profile: ComponentProps<typeof ProfileSettings>;
  receiptConnection: ReceiptConnection | null;
};

export default function AccountSettings({ profile, receiptConnection }: AccountSettingsProps) {
  const section = useSearchParams().getAll("section");
  const scanning = section.length === 1 && section[0] === "receipt-scanning";
  const selected = scanning ? sections[1] : sections[0];

  return (
    <main className="dashboard-frame py-6 text-white">
      <div className="grid items-start gap-4 sm:grid-cols-[11rem_minmax(0,1fr)] sm:gap-6">
        <nav aria-label="Account settings sections" className="flex flex-wrap gap-x-2 gap-y-1 sm:flex-col sm:gap-y-0">
          {sections.map(({ id, label, href }) => (
            <Link
              key={id}
              href={href}
              prefetch={false}
              aria-current={id === selected.id ? "page" : undefined}
              onNavigate={(event) => {
                event.preventDefault();
                const { pathname, search, hash } = window.location;
                // Both panels can render from the data already loaded for settings.
                if (href !== pathname + search + hash) window.history.pushState(null, "", href);
              }}
              className="relative flex min-h-10 items-center rounded-md px-3 text-sm font-medium text-gray-300 transition-colors focus-visible:outline-2 focus-visible:outline-red-400
                max-sm:border-b-2 max-sm:border-transparent max-sm:hover:bg-gray-800 max-sm:aria-[current=page]:border-red-500 max-sm:aria-[current=page]:bg-red-950/40 max-sm:aria-[current=page]:text-red-300
                sm:min-h-8 sm:pl-4 sm:hover:text-white sm:aria-[current=page]:font-semibold sm:aria-[current=page]:text-white sm:aria-[current=page]:before:absolute sm:aria-[current=page]:before:inset-y-2 sm:aria-[current=page]:before:left-0 sm:aria-[current=page]:before:w-0.5 sm:aria-[current=page]:before:rounded-full sm:aria-[current=page]:before:bg-red-500">
              {label}
            </Link>
          ))}
        </nav>
        <div className="w-full min-w-0 max-w-3xl">
          <h1 id="account-settings-section" className="mb-4 text-2xl font-bold tracking-tight sm:mb-5 sm:text-3xl">{selected.label}</h1>
          <section aria-labelledby="account-settings-section" className="rounded-xl border border-gray-800 bg-gray-900 p-4 sm:p-6">
            {scanning
              ? <ReceiptScannerSettings initialConnection={receiptConnection} />
              : <ProfileSettings {...profile} />}
          </section>
        </div>
      </div>
    </main>
  );
}
