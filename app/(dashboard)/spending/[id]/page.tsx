import { notFound, redirect } from "next/navigation";
import { resolveExpenseGroupRoute } from "@/app/(dashboard)/_lib/expense-groups/queries";
import { legacyExpenseGroupHref, type ExpenseGroupQuery } from "../../expense-groups/[id]/_lib/navigation";

export default async function LegacyExpenseGroupPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<ExpenseGroupQuery>;
}) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const group = await resolveExpenseGroupRoute(id);
  if (!group) notFound();
  redirect(legacyExpenseGroupHref(group.publicId, query));
}
