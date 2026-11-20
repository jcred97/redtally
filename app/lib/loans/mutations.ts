"use server";

import { revalidatePath } from "next/cache";
import { requireUserId } from "@/app/lib/auth/session";
import { prisma } from "@/server/db/client";
import { createLoanAccess } from "./access";
import { creditAccountsHref } from "./credit-account-links";

const access = createLoanAccess(prisma, requireUserId);

export type LoanActionState = { error?: string; success?: boolean; id?: string };

async function submit(operation: () => Promise<{ id?: string }>): Promise<LoanActionState> {
  try {
    const { id } = await operation();
    revalidatePath("/loans");
    revalidatePath(creditAccountsHref);
    revalidatePath(`${creditAccountsHref}/[id]`, "page");
    revalidatePath("/loans/cash/[id]", "page");
    revalidatePath("/loans/plans/[id]", "page");
    revalidatePath("/spending/[id]", "page");
    return { success: true, id };
  } catch (error) {
    if (error instanceof TypeError) return { error: error.message };
    throw error;
  }
}

export async function createCashLoan(_previous: LoanActionState, formData: FormData): Promise<LoanActionState> {
  return submit(() => access.createCashLoan(formData));
}

export async function createCreditAccount(_previous: LoanActionState, formData: FormData): Promise<LoanActionState> {
  return submit(() => access.createCreditAccount(formData));
}

export async function setCreditProductEnabled(_previous: LoanActionState, formData: FormData): Promise<LoanActionState> {
  return submit(() => access.setCreditProductEnabled(formData));
}

export async function recordLoanPayment(_previous: LoanActionState, formData: FormData): Promise<LoanActionState> {
  return submit(() => access.recordLoanPayment(formData));
}
