# RedTally roadmap

Planning baseline: October 22, 2026. Unchecked items are planned work.

Release update: October 25, 2026. [PR #1](https://github.com/jcred97/redtally/pull/1) merged as `39be226038cb867de9a98fbfb357e013eace4236`; the authentication migration was applied and the matching Vercel production deployment reached ready status. A backup restore was verified, all 25 original business rows were preserved, and the five legacy expense groups remain unclaimed.

## Daily expense tracking

Each signed-in user can record an expense on a phone, correct mistakes, review monthly spending, and recover saved history. Retain the current Next.js, Prisma, and PostgreSQL foundation.

### 1. Make real data dependable

- [x] Adapt the core ExpenseGroup, Category, Expense, Budget, Bank, and BankAssignment schema while preserving legacy records. Use PaymentMethod and legacyBankName in application code with mappings to existing database identifiers. See [data model](data-model.md). Exchange rates remain planned.

- [x] Implement integer-centavo storage, exact parsing/formatting/totals, and a transactional migration with conversion and rollback tests. Apply the migration together with the matching application release; the shared database rollout is a separate deployment step.
- [x] Define expense dates as calendar days: default to today in `Asia/Manila`, store the selected day at UTC midnight in the existing timestamp column, and display its UTC calendar day. Existing timestamps are preserved.
- [x] Retain restricted deletion for expense groups/categories with child records and banks/assignments referenced by history. Document and test these rules in the core model.

### 2. Complete the core workflow

- [x] Implement Better Auth email/password accounts, sessions, and expense-group ownership in source, including sign-up/sign-in/sign-out, anonymous-access protection, and per-user queries/actions. Supabase remains only the database host.
- [x] Apply the auth migration and deploy the matching release; configure production secret/origin, verify database-role/RLS configuration, and check user isolation against the release. Completed October 25, 2026; preserved legacy groups remain unclaimed and hidden.
- [ ] Configure email delivery, email verification, and password recovery. Google sign-in remains deferred.

- [x] Implement owner-only category creation and category lists within an Expense Group, with server validation and accessible pending/error feedback.
- [x] Allow owners to rename categories and delete empty categories after confirmation. Categories with expenses require moving or deleting those expenses first.
- [x] Wire New Expense to a working owner-only creation form.
- [x] Add owner-only expense editing with the same validation and draft protection as creation.
- [x] Add owner-only expense deletion with a confirmation showing the expense title and amount.
- [x] Validate title, amount, date, and category on the server. Ensure a submitted category belongs to the intended Expense Group and its signed-in owner.
- [x] Provide pending, success, and error feedback for creation; preserve entered values after failed saves.
- [x] Suggest editable expense details from on-device receipt OCR and offer an optional AI scan when the user wants more help. See [receipt scanning](workflows.md#receipt-scanning).

### 3. Make daily phone use comfortable

- [ ] Prioritize amount entry, category selection, and a sensible date default.
- [x] Offer a desktop history table with compact cards on phones, and a grouped view with filtered daily subtotals. Show recorded Manila times in both views.
- [ ] Support long names, empty states, keyboard use, and accessible dialogs and labels.
- [x] Filter expense history by month or exact day, category, payment method, and bank. Keep selections across pages and update the expense count and total after changes.
- [x] Calculate totals in PostgreSQL and paginate expense history.
- [x] Review monthly spending in a Dashboard tab with an editable budget, daily spending comparison, and category totals linked to filtered history.
- [ ] Add indexes based on actual filters and access patterns.
- [x] Browse the Philippine bank catalog and configure enabled banks and payment methods in each expense group.
- [x] Offer enabled banks for the selected payment method in the expense form.

### 4. Verify recovery and private access

- [x] Provide owner-only CSV, PDF, and Excel expense-history exports across all pages matching the current filters. Preserve exact amounts, recorded dates and times, merchant, category, payment method, bank, and notes. CSV streams in bounded batches and escapes spreadsheet formula-like text.
- [ ] Document and operationalize an ongoing database backup/restore procedure. The October 25 authentication release included a verified isolated backup restore; CSV history export does not replace a full account/database backup.
- [x] Add authentication and ownership checks covering implemented reads and mutations in source.
- [x] Activate those protections through a coordinated migration/deployment and verify signed-out, cross-user, and session-revocation behavior in the deployed environment. Production HTTP checks passed on October 25, 2026; temporary test accounts and groups were removed.

### Acceptance criteria

The November 11, 2026 browser smoke test used 360 px and 430 px viewports, an isolated database, and fallback fonts because Google Fonts was unreachable. It covered a rejected save and successful retry, editing, confirmed deletion, and exact totals after reload. A shortened viewport verified dialog scrolling and saving. The native software keyboard still needs a check on a physical phone.

- At representative 360-430px phone widths, the entry flow and history are usable without horizontal page scrolling; the software keyboard does not hide essential controls.
- Create an expense group and category, then add, edit, and delete an expense. Confirm changes survive a refresh and summaries remain correct.
- Exact-money checks include PHP 0.10 + PHP 0.20 = PHP 0.30, plus a month-boundary date check under the chosen Manila date policy.
- Invalid amounts/dates and a category from another Expense Group are rejected by the server; a failed save retains input and supports a safe retry.
- Month/category filters agree with saved records and displayed totals.
- Exported history reconciles with source records, and a backup can be restored successfully.
- Run lint/build and meaningful automated checks for money handling, validation, and data access as those behaviors are implemented. Exercise the complete workflow on the owner's actual phone.

## Dashboard and connected finances

Phase 1 uses existing expenses, monthly budgets, and recurring schedules. Phases 2 through 4 describe the planned expansion into accounts, forecasting, and investments.

### Purpose and navigation

**Dashboard** is the first tab and the signed-in home page at `/`. **Expense Groups** is the second tab at `/expense-groups`, with the group list, creation, and settings. Individual groups have Dashboard, Expenses, Recurring, Categories, and Payment Provider tabs. Payment Provider has separate Banks and Pay Later sections for group settings. Dashboard drill-downs open the relevant group view with its reporting month or history filters when applicable.

**Loans** lists cash loans and their balances and payments. **All Expense Groups → Pay Later Bills** shows upcoming and overdue bills and manages reusable provider accounts such as SPayLater. [Loans and Pay Later workflows](workflows.md#loans-and-pay-later) · [Production rollout](../README.md#loans-production-rollout)

Use the reference images for clear goal progress, account context during entry, rounded summary cards, and a distinction between planned and recorded transactions. Keep decorative wallet artwork compact so useful amounts and actions appear sooner.

### Phase 1: Dashboard using existing data

- [x] Show spending for the selected Manila reporting month, with a matched previous-period comparison using the existing dashboard date policy.
- [x] Show budget progress for included groups that have a target for that month, with explicit coverage such as "2 of 3 groups budgeted." Compare those targets only with spending in those same groups and show unbudgeted spending separately.
- [x] Show upcoming recurring expenses with their scheduled dates, plus schedules needing attention. Scheduled expenses describe expected postings.
- [x] Show category and merchant breakdowns and recent expenses, with links into matching group history. Preserve group context for categories with identical names.
- [x] Let the owner choose which expense groups contribute to Dashboard and clearly display the active scope. Dashboard starts with the oldest owned group because duplication can copy an entire history. The reporting month and group selection are kept in the Dashboard URL.
- [x] Provide month and group filters, quick expense entry, and a route to every included group's existing views.

Start with **Spent this month**, **Budget progress**, **Upcoming expenses**, and relevant **Needs attention** items. Place trends, breakdowns, and recent activity underneath. Only show attention items backed by actual state and an action the user can take.

### Phase 2: financial accounts, income, and bills

- [ ] Add balance-bearing financial accounts for cash, banks, e-wallets, and credit cards, allowing multiple named accounts at one institution. Add income, linked transfers, opening balances, and statement reconciliation before presenting cash balances as reliable.
- [ ] Extend recurring scheduling into a bills and payday timeline with planned, due, overdue, and paid states, reminders, and matching between expected items and actual transactions. Include subscriptions and annual renewals.
- [ ] Add account balances, income, expenses, and net cash flow to Dashboard. Internal transfers and credit-card repayments must not count purchases as expenses twice.
- [ ] Add credit-card statement/current balances, minimum payments, due dates, installments, and debt payoff progress.
- [x] Implement user-owned cash loans with a lender, original amount, manually entered receiving account, repayment schedule, and an optional expense-group link. Show outstanding balance, next payment, and payment history.
- [x] Add Pay Later to **New Expense**. Save the purchase and its repayment plan together under a reusable provider account. Each plan gets its group from its original expense and tracks its own installments.
- [x] Record a loan or provider bill payment once with the name of the bank account or wallet used. Allocate one provider payment across the installments it covers.
- [ ] Link disbursements and repayments to the financial-account ledger. Track principal, interest, and fees separately when the underlying transactions support that breakdown.

### Phase 3: goals, forecasts, and net worth

- [ ] Add savings goals and sinking funds with target amounts/dates, progress, required contributions per payday, and allocations to real account balances. Reserving money for a goal does not move money or create another asset; prevent allocating the same available funds more than once.
- [ ] Add a **Before next payday** card showing available cash, the next income date, obligations due first, protected savings, and an explainable estimate of spending money. Account for card obligations without reserving the same payment twice.
- [ ] Add a 30-90 day balance forecast with assumptions, uncertain amounts, the projected lowest balance/date, and a clear distinction between recorded and forecast data.
- [ ] Add net worth and its history from assets minus liabilities, explaining changes through saving, borrowing, and valuation changes. Identify incomplete account coverage and stale valuations.

### Phase 4: portfolios and optional refinements

- [ ] Add portfolio value, contributions, withdrawals, returns, and asset allocation once investment transactions, holdings, and dated valuations exist. Balance growth alone is not investment return.
- [ ] Extend budgets with category limits, optional rollover, payday-based periods, and spending-pace alerts. Category limits and pace alerts can be considered earlier using existing history.
- [ ] Allow balance privacy controls and reordering/hiding optional dashboard sections. Customization can follow the first working Dashboard.
- [ ] Evaluate multi-currency accounts, what-if purchase scenarios, and Philippine-oriented presets such as twice-monthly paydays, e-wallets, installments, and remittances through actual use. These do not imply bank-sync availability.

### Layout and acceptance criteria

The complete Dashboard will connect money balances, a payday plan, attention items, monthly performance, upcoming events, goals, investments, and recent activity. Introduce each section when its data dependency is available.

- Use a single column on phones with actionable information and quick entry near the top. On desktop, place trends and activity beside upcoming obligations and goals. Preserve readable labels, keyboard access, reduced-motion behavior, and usability at 360-430 px without horizontal page scrolling.
- Clearly label "Balance today," "Spending this month," and "Forecast through next payday" rather than applying one reporting period to every module.
- Keep budget remaining, available cash, and net worth distinct. Unused credit limits are not assets; goal allocations are not additional assets.
- Missing or unsupported financial data offers an appropriate next action or an unavailable state, never a fabricated zero. Loading and failed queries must not masquerade as empty financial records.
- Owner-only totals and drill-downs must agree for the chosen scope and dates. Verify partial budget coverage, duplicated/excluded groups, same-name categories, empty accounts, month boundaries, and failed reads through the signed-in Dashboard.
- Future mixed-currency totals require explicit conversion rates and valuation dates while retaining original-currency amounts. Show data freshness where balances or prices can become stale.

See [financial-model dependencies](data-model.md#planned-financial-model-dependencies) for preservation and calculation rules. Phase 1 uses the current schema.

## Later: reliable personal automation

After the daily workflow is useful:

- Recurring rules, the generation worker, and the Recurring tab are implemented in source. Apply the matching migration, configure the production cron secret, and verify the first scheduled run.
- PWA installation, followed by durable offline capture and visible synchronization status if daily use demonstrates the need. Installation alone does not implement offline saves.
- Improved search, reporting, and imports driven by actual use.

## Before a multi-user product launch

- Confirm domain availability and trademark clearance for RedTally.
- Maintain user-ownership checks and isolation tests as new reads and mutations are added. If shared finances enter scope, introduce explicit workspace membership and roles.
- Review backup operations, migration safety, monitoring, abuse controls, and export/account-deletion behavior.
- Add billing, external integrations, and larger background-job infrastructure only when required by the product scope.

## Deliberately deferred

Native mobile apps, bank synchronization, and comprehensive offline sync remain deferred. Subscription and renewal tracking is part of the planned bills timeline.
