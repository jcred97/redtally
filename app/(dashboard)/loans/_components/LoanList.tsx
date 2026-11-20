import Link from "next/link";
import { formatExpenseDate } from "@/app/lib/expenses/date";
import { formatPesoAmount } from "@/app/lib/expenses/money";
import { loanLink, loanPanel } from "./LoanPage";

export type LoanListRow = {
  href: string;
  name: string;
  provider: string;
  outstanding: number;
  next?: { balance: number; dueDate: Date };
};

export default function LoanList({ rows, emptyMessage }: { rows: LoanListRow[]; emptyMessage: string }) {
  if (!rows.length) return <p className={`${loanPanel} text-sm text-gray-300`}>{emptyMessage}</p>;

  return (
    <div className="overflow-hidden rounded-xl border border-gray-800">
      <table className="w-full table-fixed text-sm sm:table-auto">
        <caption className="sr-only">Loans and financed purchases</caption>
        <thead className="bg-gray-900 text-left text-gray-400">
          <tr>
            <th scope="col" className="w-[36%] px-3 py-3 font-medium sm:w-auto sm:px-4">Name</th>
            <th scope="col" className="hidden px-4 py-3 font-medium sm:table-cell">Type or Provider</th>
            <th scope="col" className="px-2 py-3 text-right font-medium sm:px-4">Outstanding</th>
            <th scope="col" className="px-3 py-3 text-right font-medium sm:px-4">Next Payment</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-800">
          {rows.map(({ href, name, provider, outstanding, next }) => (
            <tr key={href}>
              <th scope="row" className="wrap-anywhere px-3 py-3 text-left font-medium sm:px-4">
                <Link href={href} className={loanLink}>{name}</Link>
                <span className="block text-xs text-gray-400 sm:hidden">{provider}</span>
              </th>
              <td className="wrap-anywhere hidden px-4 py-3 text-gray-300 sm:table-cell">{provider}</td>
              <td className="wrap-anywhere px-2 py-3 text-right tabular-nums sm:px-4">{formatPesoAmount(outstanding)}</td>
              <td className="wrap-anywhere px-3 py-3 text-right sm:px-4">
                {next ? (
                  <>
                    <span className="block tabular-nums">{formatPesoAmount(next.balance)}</span>
                    <span className="block text-xs text-gray-400">{formatExpenseDate(next.dueDate)}</span>
                  </>
                ) : <span className="text-gray-400">Paid</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
