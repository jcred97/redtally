ALTER TABLE "Expense"
  ADD COLUMN "timeMinutes" SMALLINT,
  ADD CONSTRAINT "Expense_timeMinutes_check" CHECK ("timeMinutes" BETWEEN 0 AND 1439);
