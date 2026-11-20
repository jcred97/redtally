import { formatExpenseDate, parseExpenseDate } from "@/app/lib/expenses/date";
import { formatPesoAmount, sumCentavos } from "@/app/lib/expenses/money";

export const loanListHref = "/loans?view=list";
export const paymentFormId = "record-payment";

export type Installment = {
  id: string;
  dueDate: Date;
  amountCentavos: number;
  allocations: {
    amountCentavos: number;
    payment: { id: string; paidOn: Date; fundingAccount: string };
  }[];
};

export function summarizeInstallments(installments: readonly Installment[]) {
  const schedule = installments
    .map((installment) => ({
      ...installment,
      balance: installment.amountCentavos - sumCentavos(installment.allocations.map(({ amountCentavos }) => amountCentavos)),
    }))
    .sort((first, second) => first.dueDate.getTime() - second.dueDate.getTime());
  const unpaid = schedule.filter(({ balance }) => balance > 0);

  return {
    schedule,
    unpaid,
    next: unpaid[0],
    outstanding: sumCentavos(unpaid.map(({ balance }) => balance)),
  };
}

export function collectPayments(installments: readonly Installment[]) {
  const payments = new Map<string, Installment["allocations"][number]["payment"] & { amountCentavos: number }>();
  for (const { allocations } of installments) {
    for (const { amountCentavos, payment } of allocations) {
      const prior = payments.get(payment.id);
      payments.set(payment.id, { ...payment, amountCentavos: (prior?.amountCentavos ?? 0) + amountCentavos });
    }
  }
  return [...payments.values()].sort((a, b) => b.paidOn.getTime() - a.paidOn.getTime());
}

export function manilaDueWindow(today: string) {
  const start = parseExpenseDate(today);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 7);
  return { start, end };
}

export function paymentLabel(next: { balance: number; dueDate: Date } | undefined) {
  return next ? `${formatPesoAmount(next.balance)} on ${formatExpenseDate(next.dueDate)}` : "Paid in full";
}
