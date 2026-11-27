import type { PrismaClient } from "@/generated/prisma/client";
import { editableExpenseSelect } from "../expenses/editable";

type BillingInstallment = {
  id: number;
  installmentNumber: number;
  amountCentavos: number;
  expense: { id: number; title: string; spayLaterMonths: number | null };
};

export type Bill = {
  id: number;
  periodStart: Date;
  periodEnd: Date;
  dueDate: Date;
  totalCentavos: bigint;
  installments: BillingInstallment[];
};

export function createBillingAccess(db: PrismaClient, requireUserId: () => Promise<string>) {
  return {
    async getUnscheduledPurchases(expenseGroupId: number) {
      const userId = await requireUserId();
      return db.expense.findMany({
        where: {
          expenseGroupId,
          category: { expenseGroup: { userId } },
          paymentMethod: "PAY_LATER",
          payLaterProviderKey: "shopee",
          spayLaterDueDay: null,
        },
        select: editableExpenseSelect,
        orderBy: [{ date: "desc" }, { id: "desc" }],
      });
    },

    async get(expenseGroupId: number): Promise<Bill[] | null> {
      const userId = await requireUserId();
      if (!Number.isInteger(expenseGroupId) || expenseGroupId < 1 || expenseGroupId > 2_147_483_647) {
        return null;
      }

      const group = await db.expenseGroup.findUnique({
        where: { id: expenseGroupId, userId },
        select: {
          billings: {
            where: { installments: { some: {} } },
            orderBy: [{ dueDate: "asc" }, { id: "asc" }],
            select: {
              id: true,
              periodStart: true,
              periodEnd: true,
              dueDate: true,
              installments: {
                orderBy: { id: "asc" },
                select: {
                  id: true,
                  installmentNumber: true,
                  amountCentavos: true,
                  expense: { select: { id: true, title: true, spayLaterMonths: true } },
                },
              },
            },
          },
        },
      });
      if (!group) return null;

      return group.billings.map((bill) => ({
        ...bill,
        totalCentavos: bill.installments.reduce(
          (total, { amountCentavos }) => total + BigInt(amountCentavos),
          BigInt(0),
        ),
      }));
    },
  };
}
