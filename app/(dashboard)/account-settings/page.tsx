import Link from "next/link";
import { requireUser } from "@/app/lib/auth/session";
import { isProfilePhoto } from "@/app/lib/auth/profile-photo";
import { getReceiptConnection } from "@/app/lib/receipt-scanning/credentials";
import ProfileSettings from "./_components/ProfileSettings";
import ReceiptScannerSettings from "./_components/ReceiptScannerSettings";

const sections = [
  { id: "profile", label: "Profile", href: "/account-settings" },
  { id: "receipt-scanning", label: "Receipt scanning", href: "/account-settings?section=receipt-scanning" },
];

export default async function AccountSettingsPage({ searchParams }: PageProps<"/account-settings">) {
  const [user, { section }] = await Promise.all([requireUser(), searchParams]);
  const scanning = section === "receipt-scanning";
  const selected = scanning ? sections[1] : sections[0];

  return (
    <main className="dashboard-frame py-6 text-white">
      <h1 className="mb-6 text-2xl font-semibold">Account settings</h1>
      <div className="grid items-start gap-4 sm:grid-cols-[11rem_minmax(0,1fr)] sm:gap-6">
        <nav aria-label="Account settings sections" className="flex gap-2 sm:flex-col">
          {sections.map(({ id, label, href }) => (
            <Link key={id} href={href} aria-current={id === selected.id ? "page" : undefined}
              className="flex min-h-10 items-center rounded-lg px-3 text-sm text-gray-300 hover:bg-gray-800 focus-visible:outline-2 focus-visible:outline-red-400 aria-[current=page]:bg-red-950 aria-[current=page]:text-red-300">
              {label}
            </Link>
          ))}
        </nav>
        <section aria-labelledby="account-settings-section" className="grid min-w-0 gap-4 rounded-xl border border-gray-800 bg-gray-900 p-4 sm:p-6">
          <h2 id="account-settings-section" className="text-lg font-semibold">{selected.label}</h2>
          {scanning
            ? <ReceiptScannerSettings initialConnection={await getReceiptConnection(user.id)} />
            : <ProfileSettings name={user.name} email={user.email} image={isProfilePhoto(user.image) ? user.image : null} />}
        </section>
      </div>
    </main>
  );
}
