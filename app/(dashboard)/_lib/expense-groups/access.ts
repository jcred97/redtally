import { PaymentMethod, Prisma, type Expense, type PrismaClient } from "@/generated/prisma/client";
import { parseExpenseDay, parseExpenseMonth } from "@/app/lib/expenses/date";

// Expense-group IDs use PostgreSQL's signed INTEGER column.
const MAX_EXPENSE_GROUP_ID = 2_147_483_647;
const MAX_NAME_LENGTH = 100;
const EXPENSES_PAGE_SIZE = 25;
const GROUP_HAS_DEPENDENCIES =
  "Remove this expense group's categories and budgets before deleting it.";

type ExpensePageRow = {
  totalExpenses: bigint;
  totalCentavos: bigint;
  totalPages: bigint;
  page: bigint;
} & (
  | { id: null }
  | (Pick<Expense, "id" | "title" | "merchant" | "amountCentavos" | "date" | "timeMinutes" | "updatedAt" | "categoryId" | "paymentMethod" | "bankAssignmentId" | "legacyBankName"> & {
      categoryName: string;
      categoryIcon: string | null;
      bankName: string | null;
      dayExpenseCount: bigint | null;
      dayTotalCentavos: bigint | null;
    })
);

type ExpenseGroupSummary = {
  id: number;
  publicId: string;
  name: string;
  categoryCount: bigint;
  expenseCount: bigint;
  totalCentavos: bigint;
};

export type ExpenseHistoryFilters = {
  day?: string;
  month?: string;
  through?: string;
  categoryId?: number;
  paymentMethod?: PaymentMethod;
  bank?: { assignmentId: number } | { legacyKey: string };
  merchant?: string;
  search?: string;
};

export type ExpenseHistoryAvailability = "none" | "older" | "other";

export type ExpenseExportRow = {
  id: number;
  title: string;
  merchant: string | null;
  amountCentavos: number;
  date: Date;
  timeMinutes: number | null;
  notes: string | null;
  categoryName: string;
  paymentMethod: PaymentMethod | null;
  bankName: string | null;
};

type ExpenseHistoryBankOption = { value: string; label: string };

const merchantName = Prisma.sql`NULLIF(btrim(merchant), '')`;
// Exact merchant links identify case variants without exposing saved names.
const merchantKey = Prisma.sql`encode(sha256(convert_to(lower(${merchantName}), 'UTF8')), 'hex')`;
export { merchantName as expenseHistoryMerchantName, merchantKey as expenseHistoryMerchantKey };

export class ExpenseGroupAccessError extends Error {}

function validId(id: number) {
  return (
    Number.isSafeInteger(id) &&
    id > 0 &&
    id <= MAX_EXPENSE_GROUP_ID
  );
}

export function parseExpenseHistoryBankFilter(value: unknown): ExpenseHistoryFilters["bank"] {
  if (typeof value !== "string" || value.trim() !== value) return undefined;

  const assignment = /^assignment:([1-9]\d{0,9})$/.exec(value);
  if (assignment) {
    const assignmentId = Number(assignment[1]);
    return validId(assignmentId) ? { assignmentId } : undefined;
  }

  const legacy = /^legacy:([a-f0-9]{64})$/.exec(value);
  return legacy ? { legacyKey: legacy[1] } : undefined;
}

export function parseExpenseHistoryPaymentMethod(value: unknown): PaymentMethod | undefined {
  return typeof value === "string" && Object.hasOwn(PaymentMethod, value)
    ? PaymentMethod[value as keyof typeof PaymentMethod]
    : undefined;
}

export function parseExpenseHistoryMerchantFilter(value: unknown): string | undefined {
  return typeof value === "string" && (value === "none" || /^[a-f0-9]{64}$/.test(value))
    ? value
    : undefined;
}

export function parseExpenseHistorySearch(value: unknown): string | undefined {
  if (typeof value !== "string" || value.includes("\0")) return undefined;
  const search = value.trim();
  return search && search.length <= MAX_NAME_LENGTH ? search : undefined;
}

function parseName(name: unknown) {
  if (typeof name !== "string" || !name.trim()) {
    throw new TypeError("Name is required");
  }

  const trimmedName = name.trim();
  if (trimmedName.length > MAX_NAME_LENGTH) {
    throw new TypeError("Name must be 100 characters or fewer");
  }

  return trimmedName;
}

function ownedGroup(id: number, userId: string) {
  if (!validId(id)) {
    throw new ExpenseGroupAccessError("Expense group not found");
  }

  return { id, userId };
}

function copyName(name: string) {
  const suffix = " (copy)";
  const shortened = name.trim()
    .slice(0, MAX_NAME_LENGTH - suffix.length)
    .replace(/[\uD800-\uDBFF]$/, "")
    .trimEnd();
  return (shortened || "Expense Group") + suffix;
}

function expenseHistoryFilterSql({ day, month, through, categoryId, paymentMethod, bank, merchant, search }: ExpenseHistoryFilters) {
  const selectedDay = parseExpenseDay(day);
  const selectedMonth = parseExpenseMonth(month);
  const monthStart = selectedMonth ? `${selectedMonth}-01` : undefined;
  const selectedThrough = parseExpenseDay(through);
  const monthThrough = selectedThrough?.slice(0, 7) === selectedMonth ? selectedThrough : undefined;
  const dateFilter = selectedDay
    ? Prisma.sql`AND date >= ${selectedDay}::timestamp AND date < ${selectedDay}::timestamp + INTERVAL '1 day'`
    : monthStart
      ? Prisma.sql`AND date >= ${monthStart}::timestamp AND date < ${monthThrough
        ? Prisma.sql`${monthThrough}::timestamp + INTERVAL '1 day'`
        : Prisma.sql`${monthStart}::timestamp + INTERVAL '1 month'`}`
      : Prisma.empty;
  const categoryFilter = categoryId !== undefined && validId(categoryId)
    ? Prisma.sql`AND "categoryId" = ${categoryId}` : Prisma.empty;
  const paymentMethodFilter = paymentMethod
    ? Prisma.sql`AND "transactionType" = ${paymentMethod}::"TransactionType"` : Prisma.empty;
  let bankFilter = Prisma.empty;
  if (bank && "assignmentId" in bank) {
    bankFilter = Prisma.sql`AND "bankAssignmentId" = ${bank.assignmentId}`;
  } else if (bank) {
    bankFilter = Prisma.sql`AND "bankAssignmentId" IS NULL AND bank ~ '[^[:space:]]'
      AND encode(sha256(convert_to(bank, 'UTF8')), 'hex') = ${bank.legacyKey}`;
  }
  const selectedMerchant = parseExpenseHistoryMerchantFilter(merchant);
  const searchText = parseExpenseHistorySearch(search);
  let textFilter = Prisma.empty;
  if (searchText) {
    textFilter = Prisma.sql`AND (
      strpos(lower(title), lower(${searchText})) > 0
      OR strpos(lower(${merchantName}), lower(${searchText})) > 0
    )`;
  } else if (selectedMerchant === "none") {
    textFilter = Prisma.sql`AND ${merchantName} IS NULL`;
  } else if (selectedMerchant) {
    textFilter = Prisma.sql`AND ${merchantKey} = ${selectedMerchant}`;
  }
  return Prisma.sql`${dateFilter} ${categoryFilter} ${paymentMethodFilter} ${bankFilter} ${textFilter}`;
}

// Identity is resolved per operation, never captured at startup or supplied by a browser.
export function createExpenseGroupAccess(
  db: PrismaClient,
  requireUserId: () => Promise<string>
) {
  return {
    async list() {
      const userId = await requireUserId();

      return db.$queryRaw<ExpenseGroupSummary[]>`
        WITH owned_groups AS (
          SELECT "id", "publicId", "name", "createdAt"
          FROM "Spending"
          WHERE "userId" = ${userId}
        ),
        category_counts AS (
          SELECT c."spendingId" AS "groupId", COUNT(*) AS "categoryCount"
          FROM "Category" AS c
          JOIN owned_groups AS g ON g."id" = c."spendingId"
          GROUP BY c."spendingId"
        ),
        expense_totals AS (
          SELECT e."expenseGroupId" AS "groupId",
                 COUNT(*) AS "expenseCount",
                 SUM(e."amountCentavos") AS "totalCentavos"
          FROM "Expense" AS e
          JOIN owned_groups AS g ON g."id" = e."expenseGroupId"
          GROUP BY e."expenseGroupId"
        )
        SELECT g."id", g."publicId", g."name",
               COALESCE(c."categoryCount", 0) AS "categoryCount",
               COALESCE(e."expenseCount", 0) AS "expenseCount",
               COALESCE(e."totalCentavos", 0) AS "totalCentavos"
        FROM owned_groups AS g
        LEFT JOIN category_counts AS c ON c."groupId" = g."id"
        LEFT JOIN expense_totals AS e ON e."groupId" = g."id"
        ORDER BY g."createdAt" DESC, g."id" DESC
      `;
    },

    async listForSwitcher() {
      const userId = await requireUserId();
      return db.expenseGroup.findMany({
        where: { userId },
        select: { id: true, publicId: true, name: true },
        orderBy: { createdAt: "desc" },
      });
    },

    async resolveRoute(key: string) {
      const userId = await requireUserId();
      if (/^[1-9]\d{0,9}$/.test(key) && validId(Number(key))) {
        return db.expenseGroup.findUnique({
          where: { id: Number(key), userId },
          select: { id: true, publicId: true },
        });
      }
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(key)) {
        return null;
      }
      return db.expenseGroup.findUnique({
        where: { publicId: key.toLowerCase(), userId },
        select: { id: true, publicId: true },
      });
    },

    async getById(id: number) {
      const userId = await requireUserId();

      if (!validId(id)) {
        return null;
      }

      return db.expenseGroup.findUnique({
        where: { id, userId },
        include: {
          categories: {
            include: {
              _count: { select: { expenses: true, recurringExpenses: true } },
            },
          },
        },
      });
    },

    async listExpenseHistoryBankOptions(id: number) {
      const userId = await requireUserId();
      if (!validId(id)) return [];

      // Use a digest as the URL value so recorded labels stay out of URLs.
      return db.$queryRaw<ExpenseHistoryBankOption[]>`
        WITH owned_group AS (
          SELECT id FROM "Spending" WHERE id = ${id} AND "userId" = ${userId}
        ), legacy_banks AS (
          SELECT DISTINCT expense.bank AS name
          FROM "Expense" expense
          JOIN owned_group ON owned_group.id = expense."expenseGroupId"
          WHERE expense."bankAssignmentId" IS NULL AND expense.bank ~ '[^[:space:]]'
        )
        SELECT 'assignment:' || assignment.id AS value, bank.name AS label
        FROM "ExpenseGroupBank" assignment
        JOIN owned_group ON owned_group.id = assignment."expenseGroupId"
        JOIN "Bank" bank ON bank.id = assignment."bankId"
        UNION ALL
        SELECT 'legacy:' || encode(sha256(convert_to(name, 'UTF8')), 'hex') AS value,
          name || ' (recorded name)' AS label
        FROM legacy_banks
        ORDER BY label, value
      `;
    },

    async getExpenseHistoryMerchantLabel(id: number, merchant: string) {
      const userId = await requireUserId();
      if (!validId(id)) return null;
      const [result] = await db.$queryRaw<{ label: string | null }[]>`
        SELECT MIN(${merchantName}) AS label
        FROM "Expense" expense
        JOIN "Spending" expense_group ON expense_group.id = expense."expenseGroupId"
        WHERE expense_group.id = ${id} AND expense_group."userId" = ${userId}
          AND ${merchantKey} = ${merchant}
      `;
      return result?.label ?? null;
    },

    async getExpenseHistoryAvailability(id: number, filters: ExpenseHistoryFilters) {
      const userId = await requireUserId();
      if (!validId(id)) return null;

      const month = parseExpenseMonth(filters.month);
      const scopeStart = parseExpenseDay(filters.day) ?? (month ? `${month}-01` : undefined);
      const olderMatch = scopeStart
        ? Prisma.sql`EXISTS (
          SELECT 1 FROM "Expense"
          WHERE "expenseGroupId" = expense_group.id AND date < ${scopeStart}::timestamp
            ${expenseHistoryFilterSql({ ...filters, day: undefined, month: undefined, through: undefined })}
        )`
        : Prisma.sql`false`;
      const [result] = await db.$queryRaw<{ availability: ExpenseHistoryAvailability }[]>`
        SELECT CASE
          WHEN ${olderMatch} THEN 'older'
          WHEN EXISTS (SELECT 1 FROM "Expense" WHERE "expenseGroupId" = expense_group.id) THEN 'other'
          ELSE 'none'
        END AS availability
        FROM "Spending" expense_group
        WHERE expense_group.id = ${id} AND expense_group."userId" = ${userId}
      `;
      return result?.availability ?? null;
    },

    async getExpensePageById(
      id: number,
      requestedPage: number,
      filters: ExpenseHistoryFilters = {},
      includeDayTotals = false,
    ) {
      const userId = await requireUserId();
      if (!validId(id)) return null;

      const page = Number.isSafeInteger(requestedPage) && requestedPage >= 1 ? requestedPage : 1;
      const expenseFilters = expenseHistoryFilterSql(filters);
      // Count every matching expense on a day, including those outside the current page.
      const dayTotals = includeDayTotals
        ? Prisma.sql`COUNT(*) OVER (PARTITION BY date::date) AS "dayExpenseCount",
                     SUM("amountCentavos") OVER (PARTITION BY date::date) AS "dayTotalCentavos"`
        : Prisma.sql`NULL::bigint AS "dayExpenseCount", NULL::bigint AS "dayTotalCentavos"`;

      // Clamp the page and read its rows in the same database snapshot as the totals.
      const rows = await db.$queryRaw<ExpensePageRow[]>`
        WITH pagination AS (
          SELECT expense_group.id, totals.*,
            LEAST(totals."totalPages", ${page}::bigint) AS page
          FROM "Spending" expense_group
          CROSS JOIN LATERAL (
            SELECT COUNT(*) AS "totalExpenses",
              COALESCE(SUM("amountCentavos"), 0) AS "totalCentavos",
              GREATEST(1, (COUNT(*) + ${EXPENSES_PAGE_SIZE - 1}) / ${EXPENSES_PAGE_SIZE}) AS "totalPages"
            FROM "Expense"
            WHERE "expenseGroupId" = expense_group.id
              ${expenseFilters}
          ) totals
          WHERE expense_group.id = ${id} AND expense_group."userId" = ${userId}
        )
        SELECT pagination."totalExpenses", pagination."totalCentavos", pagination."totalPages", pagination.page,
          expense.id, expense.title, expense.merchant, expense."amountCentavos", expense.date, expense."timeMinutes", expense."updatedAt", expense."categoryId",
          expense."dayExpenseCount", expense."dayTotalCentavos",
          expense."transactionType" AS "paymentMethod", expense."bankAssignmentId", expense.bank AS "legacyBankName",
          category.name AS "categoryName", category.icon AS "categoryIcon", bank.name AS "bankName"
        FROM pagination
        LEFT JOIN LATERAL (
          SELECT id, title, merchant, "amountCentavos", date, "timeMinutes", "updatedAt", "categoryId", "transactionType", bank, "bankAssignmentId",
            ${dayTotals}
          FROM "Expense"
          WHERE "expenseGroupId" = pagination.id
            ${expenseFilters}
          ORDER BY date::date DESC, "timeMinutes" DESC NULLS LAST, date DESC, id DESC
          LIMIT ${EXPENSES_PAGE_SIZE}
          OFFSET (pagination.page - 1) * ${EXPENSES_PAGE_SIZE}
        ) expense ON true
        LEFT JOIN "Category" category
          ON category.id = expense."categoryId" AND category."spendingId" = pagination.id
        LEFT JOIN "ExpenseGroupBank" assignment
          ON assignment.id = expense."bankAssignmentId" AND assignment."expenseGroupId" = pagination.id
        LEFT JOIN "Bank" bank ON bank.id = assignment."bankId"
        ORDER BY expense.date::date DESC, expense."timeMinutes" DESC NULLS LAST, expense.date DESC, expense.id DESC
      `;

      const [summary] = rows;
      if (!summary) return null;

      return {
        totalExpenses: Number(summary.totalExpenses),
        totalCentavos: summary.totalCentavos,
        totalPages: Number(summary.totalPages),
        page: Number(summary.page),
        expenses: rows.filter((row) => row.id !== null).map((row) => ({
          id: row.id,
          title: row.title,
          merchant: row.merchant,
          amountCentavos: row.amountCentavos,
          date: row.date,
          timeMinutes: row.timeMinutes,
          daySummary: row.dayExpenseCount === null || row.dayTotalCentavos === null ? null : {
            count: Number(row.dayExpenseCount),
            totalCentavos: row.dayTotalCentavos,
          },
          updatedAt: row.updatedAt,
          categoryId: row.categoryId,
          paymentMethod: row.paymentMethod,
          bankAssignmentId: row.bankAssignmentId,
          legacyBankName: row.legacyBankName,
          category: { name: row.categoryName, icon: row.categoryIcon },
          bankAssignment: row.bankName === null ? null : { bank: { name: row.bankName } },
        })),
      };
    },

    async prepareExpenseExport(id: number, filters: ExpenseHistoryFilters = {}) {
      const userId = await requireUserId();
      if (!validId(id)) return null;
      const [group] = await db.$queryRaw<{ publicId: string; maxId: number }[]>`
        SELECT "publicId", COALESCE((
          SELECT MAX(id) FROM "Expense" WHERE "expenseGroupId" = expense_group.id
        ), 0)::int AS "maxId"
        FROM "Spending" expense_group
        WHERE id = ${id} AND "userId" = ${userId}
      `;
      if (!group) return null;
      const expenseFilters = expenseHistoryFilterSql(filters);

      return {
        publicId: group.publicId,
        async *batches() {
          let afterId = 0;
          while (afterId < group.maxId) {
            // Each batch rechecks ownership. A maximum ID excludes newer inserts;
            // concurrent edits/deletes can still affect batches not yet downloaded.
            const rows = await db.$queryRaw<ExpenseExportRow[]>`
              WITH matching AS (
                SELECT id, title, merchant, "amountCentavos", date, "timeMinutes", notes,
                  "categoryId", "bankAssignmentId", bank, "transactionType"
                FROM "Expense"
                WHERE "expenseGroupId" = ${id} AND id > ${afterId} AND id <= ${group.maxId}
                  ${expenseFilters}
                  AND EXISTS (SELECT 1 FROM "Spending" WHERE id = ${id} AND "userId" = ${userId})
                ORDER BY id LIMIT 500
              )
              SELECT matching.id, matching.title, matching.merchant, matching."amountCentavos",
                matching.date, matching."timeMinutes", matching.notes, category.name AS "categoryName",
                matching."transactionType" AS "paymentMethod", COALESCE(bank.name, matching.bank) AS "bankName"
              FROM matching
              JOIN "Category" category ON category.id = matching."categoryId" AND category."spendingId" = ${id}
              LEFT JOIN "ExpenseGroupBank" assignment ON assignment.id = matching."bankAssignmentId" AND assignment."expenseGroupId" = ${id}
              LEFT JOIN "Bank" bank ON bank.id = assignment."bankId"
              ORDER BY matching.id
            `;
            if (rows.length === 0) return;
            yield rows;
            afterId = rows[rows.length - 1].id;
          }
        },
      };
    },

    async create(name: unknown) {
      const userId = await requireUserId();

      return db.expenseGroup.create({
        data: { name: parseName(name), userId },
      });
    },

    async rename(id: number, name: unknown) {
      const userId = await requireUserId();
      const result = await db.expenseGroup.updateMany({
        where: ownedGroup(id, userId),
        data: { name: parseName(name) },
      });
      if (result.count === 0) {
        throw new ExpenseGroupAccessError("Expense group not found");
      }
    },

    async duplicate(id: number) {
      const userId = await requireUserId();
      const where = ownedGroup(id, userId);

      return db.$transaction(async (tx) => {
        const source = await tx.expenseGroup.findUnique({
          where,
          include: {
            budgets: true,
            bankAssignments: true,
            categories: { orderBy: { id: "asc" } },
          },
        });
        if (!source) {
          throw new ExpenseGroupAccessError("Expense group not found");
        }

        const copy = await tx.expenseGroup.create({
          data: {
            userId,
            name: copyName(source.name),
            budgets: {
              createMany: {
                data: source.budgets.map(({ budgetMonth, amountCentavos, description }) => ({
                  budgetMonth,
                  amountCentavos,
                  description,
                })),
              },
            },
            bankAssignments: {
              createMany: {
                data: source.bankAssignments.map((assignment) => ({
                  bankId: assignment.bankId,
                  active: assignment.active,
                  supportedDebitCard: assignment.supportedDebitCard,
                  supportedCreditCard: assignment.supportedCreditCard,
                  supportedBankTransfer: assignment.supportedBankTransfer,
                  supportedBankPayment: assignment.supportedBankPayment,
                })),
              },
            },
          },
          select: {
            id: true,
            publicId: true,
          },
        });

        for (const category of source.categories) {
          // Map by source ID so categories with identical names remain distinct.
          const copiedCategory = await tx.category.create({
            data: {
              expenseGroupId: copy.id,
              name: category.name,
              icon: category.icon,
              color: category.color,
            },
            select: { id: true },
          });

          // Keep expense rows in PostgreSQL: large nested Prisma inputs otherwise consume
          // substantial JavaScript memory and can outlive the transaction timeout.
          await tx.$executeRaw`
            INSERT INTO "Expense" (
              title, merchant, "amountCentavos", date, "timeMinutes", notes, bank,
              "transactionType", "bankAssignmentId", "expenseGroupId", "categoryId", "createdAt", "updatedAt"
            )
            SELECT expense.title, expense.merchant, expense."amountCentavos", expense.date,
              expense."timeMinutes", expense.notes, expense.bank, expense."transactionType",
              copied_assignment.id, ${copy.id}, ${copiedCategory.id},
              CURRENT_TIMESTAMP AT TIME ZONE 'UTC', CURRENT_TIMESTAMP AT TIME ZONE 'UTC'
            FROM "Expense" expense
            LEFT JOIN "ExpenseGroupBank" source_assignment
              ON source_assignment.id = expense."bankAssignmentId"
                AND source_assignment."expenseGroupId" = ${source.id}
            LEFT JOIN "ExpenseGroupBank" copied_assignment
              ON copied_assignment."bankId" = source_assignment."bankId"
                AND copied_assignment."expenseGroupId" = ${copy.id}
            WHERE expense."expenseGroupId" = ${source.id}
              AND expense."categoryId" = ${category.id}
          `;
        }
        return { id: copy.id, publicId: copy.publicId };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
    },

    async delete(id: number) {
      const userId = await requireUserId();
      const where = ownedGroup(id, userId);
      try {
        await db.$transaction(async (tx) => {
          // Lock the owned group before touching its bank settings, in the same order as bank saves.
          const [group] = await tx.$queryRaw<{ hasRecords: boolean }[]>`
            SELECT EXISTS (SELECT 1 FROM "Category" WHERE "spendingId" = g.id)
                OR EXISTS (SELECT 1 FROM "Budget" WHERE "expenseGroupId" = g.id) AS "hasRecords"
            FROM "Spending" g WHERE g.id = ${id} AND g."userId" = ${userId}
            FOR UPDATE OF g
          `;
          if (!group) throw new ExpenseGroupAccessError("Expense group not found");
          if (group.hasRecords) throw new ExpenseGroupAccessError(GROUP_HAS_DEPENDENCIES);

          await tx.bankAssignment.deleteMany({ where: { expenseGroupId: id } });
          await tx.expenseGroup.delete({ where });
        });
      } catch (error) {
        // Foreign keys protect records committed while the group lock was being acquired.
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") {
          throw new ExpenseGroupAccessError(GROUP_HAS_DEPENDENCIES);
        }
        throw error;
      }
    },
  };
}
