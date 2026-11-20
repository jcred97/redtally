import { permanentRedirect } from "next/navigation";
import { creditAccountHref } from "@/app/lib/loans/credit-account-links";

export default async function LegacyCreditAccountPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  permanentRedirect(creditAccountHref(id));
}
