import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import { parseExpenseDate, parseExpenseMonth } from "@/app/lib/expenses/date";
import { parsePesoAmount } from "@/app/lib/expenses/money";
import { getDashboardPeriod } from "./period";

const MAX_RECORD_ID = 2_147_483_647;
const GROUP_NOT_FOUND = "Expense group not found.";

type DashboardCategory = {
  id: number;
  name: string;
  totalCentavos: number;
  expenseCount: number;
};

type DashboardSeries = {
  month: string;
  throughDay: string;
  totalCentavos: number;
  dailyCentavos: number[];
};

export type DashboardData = DashboardSeries & {
  comparison: DashboardSeries | null;
  expenseCount: number;
  budgetCentavos: number | null;
  categories: DashboardCategory[];
};

type DailyTotal = { day: number; totalCentavos: bigint };
type DailyCategoryTotal = DailyTotal & { id: number; name: string; expenseCount: bigint };

function validId(value: number) {
  return Number.isInteger(value) && value > 0 && value <= MAX_RECORD_ID;
}

function safeNumber(value: bigint) {
  const result = Number(value);
  if (!Number.isSafeInteger(result)) throw new RangeError("The dashboard total exceeds the safe integer limit.");
  return result;
}

function summarizeDays(period: Pick<DashboardSeries, "month" | "throughDay">, rows: DailyTotal[]): DashboardSeries {
  const days = Array<bigint>(Number(period.throughDay.slice(-2))).fill(BigInt(0));
  for (const row of rows) days[row.day - 1] += row.totalCentavos;

  let cumulative = BigInt(0);
  const dailyCentavos = days.map((value) => {
    cumulative += value;
    return safeNumber(cumulative);
  });

  return { month: period.month, throughDay: period.throughDay, totalCentavos: safeNumber(cumulative), dailyCentavos };
}

function summarizeCategories(rows: DailyCategoryTotal[]) {
  const byCategory = new Map<number, Omit<DailyCategoryTotal, "day">>();
  let expenseCount = BigInt(0);
  for (const row of rows) {
    const category = byCategory.get(row.id) ?? {
      id: row.id, name: row.name, totalCentavos: BigInt(0), expenseCount: BigInt(0),
    };
    category.totalCentavos += row.totalCentavos;
    category.expenseCount += row.expenseCount;
    byCategory.set(row.id, category);
    expenseCount += row.expenseCount;
  }

  const categories = [...byCategory.values()].map((category) => ({
    ...category,
    totalCentavos: safeNumber(category.totalCentavos),
    expenseCount: safeNumber(category.expenseCount),
  })).sort((left, right) =>
    right.totalCentavos - left.totalCentavos || left.name.localeCompare(right.name, "en-PH") || left.id - right.id
  );
  return { categories, expenseCount: safeNumber(expenseCount) };
}

function requireBudgetMonth(expenseGroupId: number, month: string) {
  if (!validId(expenseGroupId)) throw new TypeError(GROUP_NOT_FOUND);
  if (!parseExpenseMonth(month)) throw new TypeError("Choose a valid budget month.");
  return `${month}-01`;
}

function parseBudgetAmount(amount: unknown) {
  if (typeof amount !== "string") throw new TypeError("Enter a budget amount.");
  try {
    return parsePesoAmount(amount);
  } catch (error) {
    if (error instanceof Error) throw new TypeError(error.message);
    throw error;
  }
}

export function createDashboardAccess(db: PrismaClient, requireUserId: () => Promise<string>) {
  return {
    async get(expenseGroupId: number, month: string, today: string): Promise<DashboardData | null> {
      const userId = await requireUserId();
      if (!validId(expenseGroupId)) return null;
      const period = getDashboardPeriod(month, today);
      if (!period) return null;

      const monthStart = `${month}-01`;
      return db.$transaction(async (tx) => {
        const group = await tx.expenseGroup.findUnique({
          where: { id: expenseGroupId, userId },
          select: {
            budgets: {
              where: { budgetMonth: parseExpenseDate(monthStart) },
              select: { amountCentavos: true },
            },
          },
        });
        if (!group) return null;

        // Group by the stored UTC calendar day, including legacy timestamps with a time.
        const currentRows = await tx.$queryRaw<DailyCategoryTotal[]>`
          SELECT EXTRACT(DAY FROM expense.date)::integer AS day, category.id, category.name,
                 SUM(expense."amountCentavos") AS "totalCentavos", COUNT(*) AS "expenseCount"
          FROM "Expense" expense
          JOIN "Category" category ON category.id = expense."categoryId"
          WHERE expense."expenseGroupId" = ${expenseGroupId}
            AND expense.date >= ${monthStart}::timestamp
            AND expense.date < ${period.throughDay}::timestamp + INTERVAL '1 day'
          GROUP BY day, category.id, category.name
        `;
        let comparison: DashboardSeries | null = null;
        if (period.comparison) {
          const comparisonStart = `${period.comparison.month}-01`;
          const previousRows = await tx.$queryRaw<DailyTotal[]>`
            SELECT EXTRACT(DAY FROM expense.date)::integer AS day, SUM(expense."amountCentavos") AS "totalCentavos"
            FROM "Expense" expense
            WHERE expense."expenseGroupId" = ${expenseGroupId}
              AND expense.date >= ${comparisonStart}::timestamp
              AND expense.date < ${period.comparison.throughDay}::timestamp + INTERVAL '1 day'
            GROUP BY day
          `;
          comparison = summarizeDays(period.comparison, previousRows);
        }

        return {
          ...summarizeDays(period, currentRows),
          ...summarizeCategories(currentRows),
          comparison,
          budgetCentavos: group.budgets[0]?.amountCentavos ?? null,
        };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
    },

    async saveBudget(expenseGroupId: number, month: string, amount: unknown): Promise<void> {
      const userId = await requireUserId();
      const monthStart = requireBudgetMonth(expenseGroupId, month);
      const amountCentavos = parseBudgetAmount(amount);

      // Keep ownership stable through the native upsert, including concurrent saves.
      const updated = await db.$executeRaw`
        INSERT INTO "Budget" ("expenseGroupId", "budgetMonth", "amountCentavos", "updatedAt")
        SELECT id, ${monthStart}::date, ${amountCentavos}::integer, CURRENT_TIMESTAMP
        FROM "Spending"
        WHERE id = ${expenseGroupId} AND "userId" = ${userId}
        FOR SHARE
        ON CONFLICT ("expenseGroupId", "budgetMonth") DO UPDATE
        SET "amountCentavos" = EXCLUDED."amountCentavos", "updatedAt" = EXCLUDED."updatedAt"
      `;
      if (updated === 0) throw new TypeError(GROUP_NOT_FOUND);
    },

    async removeBudget(expenseGroupId: number, month: string): Promise<void> {
      const userId = await requireUserId();
      const monthStart = requireBudgetMonth(expenseGroupId, month);

      const [group] = await db.$queryRaw<{ id: number }[]>`
        WITH owned_group AS (
          SELECT id FROM "Spending"
          WHERE id = ${expenseGroupId} AND "userId" = ${userId}
          FOR SHARE
        ), removed AS (
          DELETE FROM "Budget" USING owned_group
          WHERE "Budget"."expenseGroupId" = owned_group.id AND "Budget"."budgetMonth" = ${monthStart}::date
        )
        SELECT id FROM owned_group
      `;
      if (!group) throw new TypeError(GROUP_NOT_FOUND);
    },
  };
}
