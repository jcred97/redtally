import "server-only";

import { requireUserId } from "@/app/lib/auth/session";
import { prisma } from "@/server/db/client";
import { createLoanAccess } from "./access";

const access = createLoanAccess(prisma, requireUserId);

export const {
  getLoans,
  getCashLoansForExpenseGroup,
  getCashLoan,
  getRepaymentPlan,
  getCreditAccounts,
  getCreditAccount,
} = access;
