import Link from "next/link";
import { getBankAssignmentOptions } from "@/app/(dashboard)/_lib/banks/queries";
import { getExpenseGroupPayLater } from "@/app/lib/pay-later/queries";
import { formatExpenseDate } from "@/app/lib/expenses/date";
import { formatPesoAmount } from "@/app/lib/expenses/money";
import { getUnscheduledPurchases } from "../../_lib/billing/queries";
import { toEditableExpense } from "../../_lib/expenses/editable";
import NewCategoryButton from "../categories/NewCategoryButton";
import ExpenseFormDialog from "../expenses/ExpenseFormDialog";
import ExpenseGroupEmptyState from "../ExpenseGroupEmptyState";

export default async function BillingEmptyState({ expenseGroupId, categories, payLaterHref }: {
  expenseGroupId: number;
  categories: { id: number; name: string }[];
  payLaterHref: string;
}) {
  if (categories.length === 0) {
    return (
      <ExpenseGroupEmptyState icon="🧾" title="No bills yet">
        <p className="mt-1 text-sm text-gray-400">Create a category for your first SPayLater purchase.</p>
        <div className="mt-3"><NewCategoryButton expenseGroupId={expenseGroupId} successFocusId="billing-title" /></div>
      </ExpenseGroupEmptyState>
    );
  }

  const [unscheduled, bankOptions, { providers }] = await Promise.all([
    getUnscheduledPurchases(expenseGroupId),
    getBankAssignmentOptions(expenseGroupId),
    getExpenseGroupPayLater(expenseGroupId),
  ]);
  const payLaterProviders = providers.filter(({ active, productEnabled }) => active && productEnabled);
  const canAddPurchase = payLaterProviders.some(({ providerKey }) => providerKey === "shopee");
  const formOptions = { expenseGroupId, categories, bankOptions, payLaterProviders };

  return (
    <ExpenseGroupEmptyState icon="🧾" title="No bills yet">
      {unscheduled.length > 0 && (
        <>
          <p className="mt-1 text-sm text-gray-400">Choose a due day and payment term for an existing SPayLater purchase.</p>
          <ul aria-label="Purchases without a billing schedule" className="mt-3 w-full max-w-xl divide-y divide-gray-800 rounded-xl border border-gray-800 bg-gray-900 px-4 text-left">
            {unscheduled.map((purchase) => (
              <li key={purchase.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="wrap-anywhere text-sm font-medium">{purchase.title}</p>
                  <p className="mt-1 text-sm text-gray-400">{formatExpenseDate(purchase.date)} · {formatPesoAmount(purchase.amountCentavos)}</p>
                </div>
                <ExpenseFormDialog {...formOptions} expense={toEditableExpense(purchase)} billingAction="setup" />
              </li>
            ))}
          </ul>
        </>
      )}
      {canAddPurchase ? (
        <>
          {unscheduled.length === 0 && <p className="mt-1 text-sm text-gray-400">Add an SPayLater purchase to start its billing schedule.</p>}
          <div className="mt-3"><ExpenseFormDialog {...formOptions} billingAction="add" /></div>
        </>
      ) : (
        <>
          <p className="mt-3 text-sm text-gray-400">Enable SPayLater under Shopee to add a new purchase.</p>
          <Link href={payLaterHref} className="button-secondary mt-3 inline-flex min-h-10 items-center rounded-lg px-4 text-sm font-medium">
            Manage Pay Later providers
          </Link>
        </>
      )}
    </ExpenseGroupEmptyState>
  );
}
