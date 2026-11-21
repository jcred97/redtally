import { permanentRedirect } from "next/navigation";

export default function LegacyCreditAccountsPage() {
  permanentRedirect("/expense-groups");
}
