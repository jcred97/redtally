import type { PayLaterProviderAssignment, Prisma, PrismaClient } from "@/generated/prisma/client";
import { customPayLaterProviderKey, getPayLaterProviderName, presetPayLaterProviders, type PayLaterProviderSetting } from "./providers";

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
  if (!validProviderKey(providerKey)) throw new TypeError("Choose a Pay Later provider.");

  // Hold the setting until the expense transaction commits so a save and a disable cannot race.
  const [provider] = await tx.$queryRaw<Pick<PayLaterProviderAssignment, "providerKey" | "providerName">[]>`
    SELECT "providerKey", "providerName" FROM "PayLaterProviderAssignment"
    WHERE "expenseGroupId" = ${expenseGroupId} AND "userId" = ${userId}
      AND "providerKey" = ${providerKey} AND active AND "productEnabled"
    FOR SHARE
  `;
  if (!provider) {
    throw new TypeError("This Pay Later provider is unavailable for new purchases in this expense group. Review Pay Later in the Payment Provider tab.");
  }
  return provider;
}

export function createPayLaterAccess(db: PrismaClient) {
  return {
    async getExpenseGroupPayLater(userId: string, expenseGroupId: number): Promise<{ providers: PayLaterProviderSetting[] }> {
      if (!validExpenseGroupId(expenseGroupId)) return { providers: [] };
      const group = await db.expenseGroup.findUnique({
        where: { id: expenseGroupId, userId },
        select: { payLaterProviderAssignments: { select: { providerKey: true, providerName: true, active: true, productEnabled: true } } },
      });
      if (!group) return { providers: [] };

      const providers = new Map<string, PayLaterProviderSetting>(
        presetPayLaterProviders.map((provider) => [provider.providerKey, { ...provider, active: false, productEnabled: false }]),
      );
      for (const { providerKey, providerName, active, productEnabled } of group.payLaterProviderAssignments) {
        providers.set(providerKey, { providerKey, providerName: getPayLaterProviderName(providerKey, providerName), active, productEnabled });
      }
      return { providers: [...providers.values()] };
    },

    async setGroupPayLaterProvider(userId: string, formData: FormData) {
      const expenseGroupId = readExpenseGroupId(formData);
      const [providerKey, extraKey] = formData.getAll("providerKey");
      const [productValue, extraProduct] = formData.getAll("productEnabled");
      if (!validProviderKey(providerKey) || extraKey !== undefined || extraProduct !== undefined ||
        (productValue !== undefined && productValue !== "on" && productValue !== "off")) {
        throw new TypeError("Choose a valid Pay Later provider and setting.");
      }
      const productEnabled = productValue === "on";
      const settings = { active: productEnabled, productEnabled };

      return db.$transaction(async (tx) => {
        await lockOwnedExpenseGroup(tx, expenseGroupId, userId);
        const key = { expenseGroupId, providerKey };
        const where = { expenseGroupId_providerKey: key };
        if (presetPayLaterProviders.some((provider) => provider.providerKey === providerKey)) {
          return tx.payLaterProviderAssignment.upsert({ where, create: { ...key, userId, ...settings }, update: settings });
        }

        const { count } = await tx.payLaterProviderAssignment.updateMany({ where: { ...key, userId }, data: settings });
        if (!count) throw new TypeError("This Pay Later provider is unavailable.");
      });
    },

    async createGroupPayLaterProvider(userId: string, formData: FormData) {
      const expenseGroupId = readExpenseGroupId(formData);
      const [name, extraName] = formData.getAll("name");
      const providerName = typeof name === "string" ? name.trim().replace(/\s+/g, " ") : "";
      if (!providerName || providerName.length > 120 || extraName !== undefined) {
        throw new TypeError("Enter a Pay Later provider name up to 120 characters.");
      }
      const providerKey = customPayLaterProviderKey(providerName);
      if (!validProviderKey(providerKey)) throw new TypeError("Enter a shorter Pay Later provider name.");
      if (providerKey === "custom:shopee" ||
          presetPayLaterProviders.some((provider) => customPayLaterProviderKey(provider.providerName) === providerKey)) {
        throw new TypeError("Choose this provider from the Pay Later settings list.");
      }

      return db.$transaction(async (tx) => {
        await lockOwnedExpenseGroup(tx, expenseGroupId, userId);
        const key = { expenseGroupId, providerKey };
        const settings = { active: true, productEnabled: true };
        return tx.payLaterProviderAssignment.upsert({
          where: { expenseGroupId_providerKey: key },
          create: { ...key, userId, providerName, ...settings },
          update: settings,
        });
      });
    },
  };
}
