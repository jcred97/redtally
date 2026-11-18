import { requireUser } from "@/app/lib/auth/session";
import ExpenseGroups from "./_components/ExpenseGroups";

export default async function ExpenseGroupsPage() {
  await requireUser();

  return <ExpenseGroups />;
}
