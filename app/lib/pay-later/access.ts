import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { customPayLaterProviderKey, getPayLaterProviderName, payLaterProviders } from "./credit-products";

type PayLaterProvider = { key: string; name: string; active: boolean };
const groupUnavailable = "Choose one of your expense groups.";

function validExpenseGroupId(id: number) {
  return Number.isInteger(id) && id > 0 && id <= 2_147_483_647;
}

function validProviderKey(key: unknown): key is string {
  return typeof key === "string" && key.length > 0 && key.length <= 127;
}

function readExpenseGroupId(formData: FormData) {
  const [value, extra] = formData.getAll("expenseGroupId");
  const id = Number(value);
  if (typeof value !== "string" || !/^[1-9]\d{0,9}$/.test(value) || !validExpenseGroupId(id) || extra !== undefined) {
    throw new TypeError(groupUnavailable);
  }
  return id;
}

async function lockOwnedExpenseGroup(tx: Prisma.TransactionClient, expenseGroupId: number, userId: string) {
  const [group] = await tx.$queryRaw<{ id: number }[]>`
    SELECT id FROM "Spending" WHERE id = ${expenseGroupId} AND "userId" = ${userId} FOR SHARE
  `;
  if (!group) throw new TypeError(groupUnavailable);
}

export async function requireEnabledPayLaterProvider(
  tx: Prisma.TransactionClient, userId: string, expenseGroupId: number, providerKey: unknown,
) {
  if (!validProviderKey(providerKey)) throw new TypeError("Choose a credit provider.");

  // Hold the setting until the expense transaction commits so a save and a disable cannot race.
  const [provider] = await tx.$queryRaw<{ providerKey: string; providerName: string | null }[]>`
    SELECT "providerKey", "providerName" FROM "ExpenseGroupPayLaterProvider"
    WHERE "expenseGroupId" = ${expenseGroupId} AND "userId" = ${userId}
      AND "providerKey" = ${providerKey} AND active
    FOR SHARE
  `;
  if (!provider) {
    throw new TypeError("This credit provider is unavailable for new purchases in this expense group. Review Pay Later in the Payment Provider tab.");
  }
  return provider;
}

export function createPayLaterAccess(db: PrismaClient) {
  return {
    async getExpenseGroupPayLater(userId: string, expenseGroupId: number): Promise<{ providers: PayLaterProvider[] }> {
      if (!validExpenseGroupId(expenseGroupId)) return { providers: [] };
      const group = await db.expenseGroup.findUnique({
        where: { id: expenseGroupId, userId },
        select: { payLaterProviders: { select: { providerKey: true, providerName: true, active: true } } },
      });
      if (!group) return { providers: [] };

      const providers = new Map<string, PayLaterProvider>(
        payLaterProviders.map((provider) => [provider.key, { ...provider, active: false }]),
      );
      for (const { providerKey, providerName, active } of group.payLaterProviders) {
        providers.set(providerKey, { key: providerKey, name: getPayLaterProviderName(providerKey, providerName), active });
      }
      return { providers: [...providers.values()] };
    },

    async setGroupPayLaterProvider(userId: string, formData: FormData) {
      const expenseGroupId = readExpenseGroupId(formData);
      const [providerKey, extraKey] = formData.getAll("providerKey");
      const [activeValue, extraActive] = formData.getAll("active");
      const active = activeValue === "on";
      if (!validProviderKey(providerKey) || extraKey !== undefined || extraActive !== undefined ||
        (activeValue !== undefined && !active)) {
        throw new TypeError("Choose a valid credit provider and setting.");
      }

      return db.$transaction(async (tx) => {
        await lockOwnedExpenseGroup(tx, expenseGroupId, userId);
        const key = { expenseGroupId, providerKey };
        const where = { expenseGroupId_providerKey: key };
        if (payLaterProviders.some((provider) => provider.key === providerKey)) {
          return tx.expenseGroupPayLaterProvider.upsert({ where, create: { ...key, userId, active }, update: { active } });
        }

        const { count } = await tx.expenseGroupPayLaterProvider.updateMany({ where: { ...key, userId }, data: { active } });
        if (!count) throw new TypeError("This credit provider is unavailable.");
      });
    },

    async createGroupPayLaterProvider(userId: string, formData: FormData) {
      const expenseGroupId = readExpenseGroupId(formData);
      const [name, extraName] = formData.getAll("name");
      const providerName = typeof name === "string" ? name.trim().replace(/\s+/g, " ") : "";
      if (!providerName || providerName.length > 120 || extraName !== undefined) {
        throw new TypeError("Enter a credit provider name up to 120 characters.");
      }
      const providerKey = customPayLaterProviderKey(providerName);
      if (!validProviderKey(providerKey)) throw new TypeError("Enter a shorter credit provider name.");
      if (payLaterProviders.some(({ name }) => customPayLaterProviderKey(name) === providerKey)) {
        throw new TypeError("Choose this provider from the Pay Later settings list.");
      }

      return db.$transaction(async (tx) => {
        await lockOwnedExpenseGroup(tx, expenseGroupId, userId);
        const key = { expenseGroupId, providerKey };
        return tx.expenseGroupPayLaterProvider.upsert({
          where: { expenseGroupId_providerKey: key },
          create: { ...key, userId, providerName, active: true },
          update: { active: true },
        });
      });
    },
  };
}
