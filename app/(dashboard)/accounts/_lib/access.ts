import type { PrismaClient } from "@/generated/prisma/client";
import { manualFinancialAccountTypes, supportsFinancialAccountBank } from "./types";

const accountIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const currencyCodes = new Set(Intl.supportedValuesOf("currency"));

export function createFinancialAccountAccess(db: PrismaClient, requireUserId: () => Promise<string>) {
  return {
    async list() {
      const userId = await requireUserId();
      return db.financialAccount.findMany({
        where: { userId },
        select: { id: true, name: true, type: true, currency: true, bank: { select: { name: true } } },
        orderBy: [{ name: "asc" }, { id: "asc" }],
      });
    },

    async listBanks() {
      await requireUserId();
      return db.bank.findMany({
        where: { active: true },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      });
    },

    async create(formData: FormData) {
      const userId = await requireUserId();
      const accountId = formData.get("accountId");
      if (typeof accountId !== "string" || !accountIdPattern.test(accountId)) {
        throw new TypeError("Unable to identify this draft. Refresh the page and try again.");
      }
      const id = accountId.toLowerCase();

      const rawName = formData.get("name");
      const name = typeof rawName === "string" ? rawName.trim() : "";
      if (!name || name.length > 120) throw new TypeError("Account name must be between 1 and 120 characters.");

      const rawType = formData.get("type");
      const type = manualFinancialAccountTypes.find(({ value }) => value === rawType)?.value;
      if (!type) throw new TypeError("Choose a valid account type.");

      const rawCurrency = formData.get("currency");
      const currency = typeof rawCurrency === "string" ? rawCurrency.trim().toUpperCase() : "";
      if (!currencyCodes.has(currency)) throw new TypeError("Enter a valid currency code, such as PHP.");

      const rawBankId = formData.get("bankId");
      let bankId = null;
      if (rawBankId !== null && rawBankId !== "") {
        if (!supportsFinancialAccountBank(type) || typeof rawBankId !== "string"
          || !/^[1-9]\d{0,9}$/.test(rawBankId) || Number(rawBankId) > 2_147_483_647) {
          throw new TypeError("Choose a valid bank for this account type.");
        }
        bankId = Number(rawBankId);
      }

      const data = { id, userId, name, type, currency, bankId };
      return db.$transaction(async (tx) => {
        const where = { id, userId };
        const select = { id: true, name: true, type: true, currency: true, bankId: true } as const;
        let saved = await tx.financialAccount.findUnique({ where, select });
        if (!saved) {
          if (bankId !== null && !await tx.bank.findUnique({ where: { id: bankId, active: true }, select: { id: true } })) {
            throw new TypeError("Choose an available bank.");
          }
          // The account ID identifies the draft across retries and concurrent submissions.
          const { count } = await tx.financialAccount.createMany({ data, skipDuplicates: true });
          if (count === 1) return { id };
          saved = await tx.financialAccount.findUnique({ where, select });
        }
        if (!saved || saved.name !== name || saved.type !== type || saved.currency !== currency || saved.bankId !== bankId) {
          throw new TypeError("This draft could not be saved. Close it and start again.");
        }
        return { id: saved.id };
      });
    },
  };
}
