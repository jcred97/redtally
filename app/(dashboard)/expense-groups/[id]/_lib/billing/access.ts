import type { PrismaClient } from "@/generated/prisma/client";

type BillingInstallment = {
  id: number;
  installmentNumber: number;
  amountCentavos: number;
  expense: { title: string; spayLaterMonths: number | null };
};

type Bill = {
  id: number;
  periodStart: Date;
  periodEnd: Date;
  dueDate: Date;
  totalCentavos: bigint;
  installments: BillingInstallment[];
};

export type BillingCycle = { dueDay: number; bills: Bill[] };

export function createBillingAccess(db: PrismaClient, requireUserId: () => Promise<string>) {
  return {
    async get(expenseGroupId: number): Promise<BillingCycle[] | null> {
      const userId = await requireUserId();
      if (!Number.isInteger(expenseGroupId) || expenseGroupId < 1 || expenseGroupId > 2_147_483_647) {
        return null;
      }

      const group = await db.expenseGroup.findUnique({
        where: { id: expenseGroupId, userId },
        select: {
          billings: {
            where: { installments: { some: {} } },
            orderBy: [{ dueDay: "asc" }, { dueDate: "asc" }, { id: "asc" }],
            select: {
              id: true,
              dueDay: true,
              periodStart: true,
              periodEnd: true,
              dueDate: true,
              installments: {
                orderBy: { id: "asc" },
                select: {
                  id: true,
                  installmentNumber: true,
                  amountCentavos: true,
                  expense: { select: { title: true, spayLaterMonths: true } },
                },
              },
            },
          },
        },
      });
      if (!group) return null;

      const cycles = new Map<number, BillingCycle>();
      for (const { dueDay, ...bill } of group.billings) {
        if (bill.installments.length === 0) continue;
        let cycle = cycles.get(dueDay);
        if (!cycle) {
          cycle = { dueDay, bills: [] };
          cycles.set(dueDay, cycle);
        }
        const totalCentavos = bill.installments.reduce(
          (total, { amountCentavos }) => total + BigInt(amountCentavos),
          BigInt(0),
        );
        cycle.bills.push({ ...bill, totalCentavos });
      }
      return [...cycles.values()];
    },
  };
}
