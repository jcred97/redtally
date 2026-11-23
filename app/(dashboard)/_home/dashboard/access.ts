import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import { parseExpenseDate } from "@/app/lib/expenses/date";
import { expenseHistoryMerchantKey, expenseHistoryMerchantName } from "../../_lib/expense-groups/access";
import { getDashboardPeriod } from "../../expense-groups/[id]/_lib/dashboard/period";

const PUBLIC_ID = /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i;
const SUMMARY_LIMIT = 10;
const ZERO = BigInt(0);

type Group = { id: number; publicId: string; name: string };
type ScopedGroup = Group & { totalCentavos: bigint; budgetCentavos: number | null };
type ScopedRow = { expenseGroupId: number };
type Range = { month: string; throughDay: string };
type Series = Range & { totalCentavos: bigint; dailyCentavos: bigint[] };
type DailyTotal = { day: number; totalCentavos: bigint };
type Totals = { totalCentavos: bigint; expenseCount: bigint };
type CategoryRow = ScopedRow & Totals & { id: number; name: string };
type MerchantRow = ScopedRow & Totals & { name: string; filter: string };
type RecentRow = ScopedRow & {
  id: number;
  title: string;
  merchant: string | null;
  date: Date;
  timeMinutes: number | null;
  amountCentavos: number;
  categoryId: number;
  categoryName: string;
};
type ScheduleRow = ScopedRow & { id: number; title: string; amountCentavos: number; nextDueDate: Date };
type AttentionReason = "blocked" | "overdue";

export type HomeDashboard = Series & {
  comparison: Series | null;
  expenseCount: number;
  groups: ScopedGroup[];
  budget: { groupCount: number; targetCentavos: bigint; spentCentavos: bigint; unbudgetedCentavos: bigint };
  categories: { id: number; name: string; group: Group; totalCentavos: bigint; expenseCount: number }[];
  merchants: { name: string; filter: string; group: Group; totalCentavos: bigint; expenseCount: number }[];
  recentExpenses: (Omit<RecentRow, keyof ScopedRow | "categoryId" | "categoryName"> & {
    group: Group;
    category: { id: number; name: string };
  })[];
  upcoming: (Omit<ScheduleRow, keyof ScopedRow> & { group: Group })[];
  attention: (Omit<ScheduleRow, keyof ScopedRow> & { group: Group; reason: AttentionReason })[];
};

function buildSeries(period: Range, rows: DailyTotal[] = []): Series {
  const days = Array<bigint>(Number(period.throughDay.slice(-2))).fill(ZERO);
  for (const { day, totalCentavos } of rows) days[day - 1] += totalCentavos;

  let totalCentavos = ZERO;
  const dailyCentavos = days.map((amount) => {
    totalCentavos += amount;
    return totalCentavos;
  });
  return { ...period, totalCentavos, dailyCentavos };
}

function dates(period: Range) {
  return Prisma.sql`expense.date >= ${`${period.month}-01`}::timestamp
    AND expense.date < ${period.throughDay}::timestamp + INTERVAL '1 day'`;
}

function budgetSummary(groups: ScopedGroup[]): HomeDashboard["budget"] {
  let groupCount = 0;
  let targetCentavos = ZERO;
  let spentCentavos = ZERO;
  let unbudgetedCentavos = ZERO;
  for (const group of groups) {
    if (group.budgetCentavos === null) {
      unbudgetedCentavos += group.totalCentavos;
    } else {
      groupCount++;
      targetCentavos += BigInt(group.budgetCentavos);
      spentCentavos += group.totalCentavos;
    }
  }
  return { groupCount, targetCentavos, spentCentavos, unbudgetedCentavos };
}

export function createHomeDashboardAccess(db: PrismaClient, requireUserId: () => Promise<string>) {
  return {
    async get(groupPublicIds: string[], month: string, today: string): Promise<HomeDashboard | null> {
      const userId = await requireUserId();
      const period = getDashboardPeriod(month, today);
      if (!period) return null;

      const { comparison, ...current } = period;
      const publicIds = [...new Set(groupPublicIds.filter((id) => PUBLIC_ID.test(id)).map((id) => id.toLowerCase()))];
      const empty: HomeDashboard = {
        ...buildSeries(current), comparison: comparison ? buildSeries(comparison) : null, expenseCount: 0,
        groups: [], budget: budgetSummary([]), categories: [], merchants: [], recentExpenses: [], upcoming: [], attention: [],
      };
      if (publicIds.length === 0) return empty;

      return db.$transaction(async (tx) => {
        // Resolve public IDs against the current owner once, then use that immutable snapshot for every section.
        const owned = await tx.expenseGroup.findMany({
          where: { userId, publicId: { in: publicIds } },
          select: {
            id: true, publicId: true, name: true,
            budgets: { where: { budgetMonth: parseExpenseDate(`${month}-01`) }, select: { amountCentavos: true } },
          },
          orderBy: [{ name: "asc" }, { id: "asc" }],
        });
        if (owned.length === 0) return empty;

        const groupsById = new Map(owned.map(({ id, publicId, name }) => [id, { id, publicId, name }]));
        const groupIds = Prisma.join([...groupsById.keys()]);
        const inScope = Prisma.sql`expense."expenseGroupId" IN (${groupIds}) AND ${dates(current)}`;
        const currentRows = await tx.$queryRaw<(ScopedRow & DailyTotal & Totals)[]>`
          SELECT expense."expenseGroupId", EXTRACT(DAY FROM expense.date)::integer AS day,
            SUM(expense."amountCentavos") AS "totalCentavos", COUNT(*) AS "expenseCount"
          FROM "Expense" expense
          WHERE ${inScope}
          GROUP BY expense."expenseGroupId", day
        `;
        const comparisonRows = comparison ? await tx.$queryRaw<DailyTotal[]>`
          SELECT EXTRACT(DAY FROM expense.date)::integer AS day, SUM(expense."amountCentavos") AS "totalCentavos"
          FROM "Expense" expense
          WHERE expense."expenseGroupId" IN (${groupIds}) AND ${dates(comparison)}
          GROUP BY day
        ` : [];
        const categories = await tx.$queryRaw<CategoryRow[]>`
          SELECT expense."expenseGroupId", category.id, category.name,
            SUM(expense."amountCentavos") AS "totalCentavos", COUNT(*) AS "expenseCount"
          FROM "Expense" expense
          JOIN "Category" category ON category.id = expense."categoryId" AND category."spendingId" = expense."expenseGroupId"
          WHERE ${inScope}
          GROUP BY expense."expenseGroupId", category.id, category.name
          ORDER BY "totalCentavos" DESC, category.name, category.id
          LIMIT ${SUMMARY_LIMIT}
        `;
        const merchants = await tx.$queryRaw<MerchantRow[]>`
          SELECT expense."expenseGroupId", MIN(${expenseHistoryMerchantName}) AS name,
            ${expenseHistoryMerchantKey} AS filter, SUM(expense."amountCentavos") AS "totalCentavos", COUNT(*) AS "expenseCount"
          FROM "Expense" expense
          WHERE ${inScope} AND ${expenseHistoryMerchantName} IS NOT NULL
          GROUP BY expense."expenseGroupId", filter
          ORDER BY "totalCentavos" DESC, name, expense."expenseGroupId", filter
          LIMIT ${SUMMARY_LIMIT}
        `;
        const recent = await tx.$queryRaw<RecentRow[]>`
          SELECT expense.id, expense.title, expense.merchant, expense.date, expense."timeMinutes", expense."amountCentavos",
            expense."expenseGroupId", category.id AS "categoryId", category.name AS "categoryName"
          FROM "Expense" expense
          JOIN "Category" category ON category.id = expense."categoryId" AND category."spendingId" = expense."expenseGroupId"
          WHERE ${inScope}
          ORDER BY expense.date::date DESC, expense."timeMinutes" DESC NULLS LAST, expense.date DESC, expense.id DESC
          LIMIT ${SUMMARY_LIMIT}
        `;

        // This is the next scheduled occurrence per active rule, assessed against today independently of the reporting month.
        const activeSchedule = Prisma.sql`FROM "RecurringExpense"
          WHERE "expenseGroupId" IN (${groupIds}) AND ("endDate" IS NULL OR "nextDueDate" <= "endDate")`;
        const upcoming = await tx.$queryRaw<ScheduleRow[]>`
          SELECT id, title, "amountCentavos", "nextDueDate", "expenseGroupId" ${activeSchedule}
          AND status = 'ACTIVE' AND "nextDueDate" >= ${today}::date
          ORDER BY "nextDueDate", id
          LIMIT ${SUMMARY_LIMIT}
        `;
        const attention = await tx.$queryRaw<(ScheduleRow & { reason: AttentionReason })[]>`
          SELECT id, title, "amountCentavos", "nextDueDate", "expenseGroupId",
            CASE WHEN status = 'NEEDS_ATTENTION' THEN 'blocked' ELSE 'overdue' END AS reason
          ${activeSchedule}
          AND (status = 'NEEDS_ATTENTION' OR (status = 'ACTIVE' AND "nextDueDate" < ${today}::date))
          ORDER BY (status = 'NEEDS_ATTENTION') DESC, "nextDueDate", id
          LIMIT ${SUMMARY_LIMIT}
        `;

        let expenseCount = ZERO;
        const groupTotals = new Map<number, bigint>();
        for (const row of currentRows) {
          expenseCount += row.expenseCount;
          groupTotals.set(row.expenseGroupId, (groupTotals.get(row.expenseGroupId) ?? ZERO) + row.totalCentavos);
        }
        const withGroup = <T extends ScopedRow>({ expenseGroupId, ...row }: T) => ({
          ...row, group: groupsById.get(expenseGroupId)!,
        });
        const groups = owned.map(({ budgets, ...group }) => ({
          ...group, totalCentavos: groupTotals.get(group.id) ?? ZERO, budgetCentavos: budgets[0]?.amountCentavos ?? null,
        }));

        return {
          ...buildSeries(current, currentRows),
          comparison: comparison ? buildSeries(comparison, comparisonRows) : null,
          expenseCount: Number(expenseCount),
          groups,
          budget: budgetSummary(groups),
          categories: categories.map((row) => ({ ...withGroup(row), expenseCount: Number(row.expenseCount) })),
          merchants: merchants.map((row) => ({ ...withGroup(row), expenseCount: Number(row.expenseCount) })),
          recentExpenses: recent.map(({ categoryId, categoryName, ...row }) => ({
            ...withGroup(row), category: { id: categoryId, name: categoryName },
          })),
          upcoming: upcoming.map(withGroup),
          attention: attention.map(withGroup),
        };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
    },
  };
}
