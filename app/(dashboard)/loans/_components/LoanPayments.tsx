import { formatExpenseDate } from "@/app/lib/expenses/date";
import { formatPesoAmount } from "@/app/lib/expenses/money";
import { collectPayments, summarizeInstallments, type Installment } from "../_lib/display";
import { loanPanel } from "./LoanPage";

export function PaymentHistory({
  payments,
  title = "Payment History",
  amountLabel = "Amount",
}: {
  payments: ReturnType<typeof collectPayments>;
  title?: string;
  amountLabel?: string;
}) {
  return (
    <section className={loanPanel}>
      <h2 className="text-lg font-semibold">{title}</h2>
      {payments.length ? (
        <table className="mt-2 w-full table-fixed text-sm sm:table-auto">
          <thead className="text-left text-gray-400">
            <tr>
              <th scope="col" className="py-2 font-medium">Date</th>
              <th scope="col" className="px-2 py-2 font-medium">Paid From</th>
              <th scope="col" className="py-2 text-right font-medium">{amountLabel}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800 border-t border-gray-800">
            {payments.map(({ id, paidOn, fundingAccount, amountCentavos }) => (
              <tr key={id}>
                <td className="py-2">{formatExpenseDate(paidOn)}</td>
                <td className="wrap-anywhere px-2 py-2">{fundingAccount}</td>
                <td className="wrap-anywhere py-2 text-right tabular-nums">{formatPesoAmount(amountCentavos)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : <p className="mt-2 text-sm text-gray-400">No payments recorded.</p>}
    </section>
  );
}

export function InstallmentSchedule({
  installments,
  today,
  embedded = false,
}: {
  installments: Installment[];
  today: string;
  embedded?: boolean;
}) {
  const { schedule } = summarizeInstallments(installments);
  const Heading = embedded ? "h4" : "h2";
  return (
    <section className={embedded ? "border-t border-gray-800 p-4 sm:px-5" : loanPanel}>
      <Heading className={`${embedded ? "text-sm" : "text-lg"} font-semibold`}>Repayment Schedule</Heading>
      <table className="mt-2 w-full table-fixed text-sm sm:table-auto">
        <thead className="text-left text-gray-400">
          <tr>
            <th scope="col" className="py-2 font-medium">Due Date</th>
            <th scope="col" className="px-2 py-2 text-right font-medium">Scheduled</th>
            <th scope="col" className="py-2 text-right font-medium">Remaining</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-800 border-t border-gray-800">
          {schedule.map(({ id, dueDate, amountCentavos, balance }) => {
            const overdue = balance > 0 && dueDate.toISOString().slice(0, 10) < today;
            return (
              <tr key={id}>
                <td className="py-2">
                  {formatExpenseDate(dueDate)}
                  {overdue && <span className="block text-xs text-red-300">Overdue</span>}
                </td>
                <td className="wrap-anywhere px-2 py-2 text-right tabular-nums">{formatPesoAmount(amountCentavos)}</td>
                <td className="wrap-anywhere py-2 text-right tabular-nums">{balance > 0 ? formatPesoAmount(balance) : "Paid"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}
