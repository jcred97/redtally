import { permanentRedirect } from "next/navigation";
import { creditAccountsHref } from "@/app/lib/loans/credit-account-links";

export default function LegacyCreditAccountsPage() {
  permanentRedirect(creditAccountsHref);
}
