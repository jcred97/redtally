import { permanentRedirect } from "next/navigation";

export default function LegacyCreditAccountPage() {
  permanentRedirect("/expense-groups");
}
