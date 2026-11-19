# RedTally

RedTally is a budgeting and expense-management web app designed for daily use on a phone, with desktop access for reviewing expenses. Email/password accounts and private expense-group ownership run through Better Auth. The authentication migration and matching Vercel production release were completed on October 25, 2026.

## Current direction

**App name: RedTally.** Red is the founder's surname. Tally reflects the app's focus on recording and totaling expenses and leaves room for future portfolio tracking.

Product decisions recorded on October 22, 2026:

- **Private accounts for everyone.** Email/password sign-up/sign-in and per-user expense-group ownership are deployed. Better Auth runs inside the TypeScript application; Supabase is used only as the PostgreSQL host. Google sign-in can be added later.
- **Keep the existing stack** of Next.js App Router, React, TypeScript, Tailwind CSS, Better Auth for authentication, Prisma with PostgreSQL hosted on Supabase, and Vercel for deployment. See [package.json](package.json) for dependency versions. No backend replacement or native mobile rewrite is planned for the initial milestone.
- **Web first, designed for phones.** Complete the connected expense workflow before adding PWA installation or offline synchronization.
- Keep branding separate from business rules and database identifiers when adding features, so a future rename remains manageable.

See [the roadmap](docs/roadmap.md) for implementation priorities and acceptance criteria, and [the data model](docs/data-model.md) for the Salesforce-inspired core adaptation.

The signed-in home opens on **Dashboard**. Select the expense groups and Manila reporting month to see spending, budget coverage, upcoming recurring expenses, breakdowns, and recent activity. **Expense Groups** is the second tab and opens the group list. The [Dashboard and connected-finances roadmap](docs/roadmap.md#dashboard-and-connected-finances) covers later phases for accounts, income and transfers, bills, goals, forecasts, net worth, and portfolios.

## Current implementation

The data hierarchy is `User -> ExpenseGroup -> Category -> Expense`. Expense groups also have optional monthly `Budget` targets and `BankAssignment` records. Server-side session checks and ownership filters protect expense groups and their child data. Existing groups remain unclaimed (`userId = null`) and hidden from all signed-in users until deliberately assigned through an administrative process. Prisma mappings retain the existing database names and data: `ExpenseGroup` maps to `Spending`, and `BankAssignment` maps to `ExpenseGroupBank`. `Budget` uses the existing `Budget` table. Expense payment choices use `PaymentMethod` (the existing `TransactionType` enum); `paymentMethod` and `legacyBankName` map to the existing `transactionType` and `bank` columns. Category's `expenseGroupId` still maps to `spendingId`.

Implemented source includes:

- Expense-group creation, list cards, and detail/history pages use random UUID public IDs, such as `/spending/1b6bc67a-6891-44df-a306-76b69e150c33`. Old numeric links redirect to the owner's canonical UUID URL and retain filters. Apply migration `20261118010000_expense_group_public_id` before deploying this version.
- Each group's **Dashboard** tab shows monthly spending, an optional budget target, and ranked categories that open the matching expense history. Owners can set, edit, or remove the target for each month. The cumulative trend compares the current Manila month through today with the previous month through the same calendar day, or through its last day if shorter. Past months compare full months.
- Owners can create and rename categories inside an expense group. Empty categories can be deleted after confirmation. Categories with expenses require moving or deleting those expenses first.
- Owner-only expense entry and editing with a title, peso amount, calendar date, optional Manila time, and a category from the current group. History defaults to a table on desktop and compact cards on phones. Choose **Grouped by day** for daily counts and subtotals across all matching expenses, including days that span multiple pages. Both views keep the current filters and page when switching.
- **Merchant** is optional and separate from the expense title. When present, it appears below the title in both history views. Apply migration `20261117010000_expense_merchant` before deploying this version.
- Enter part of a merchant name and choose **Apply filters** to search expense history. Matching is case-insensitive, and the search text is included in the filtered URL. Dashboard merchant links retain their exact matches.
- **Export Expenses** opens a file-type chooser for CSV, PDF, or Excel (`.xlsx`). Each download includes every expense matching the current history filters, including rows beyond the current page, with PHP amounts, calendar dates, recorded Manila times, title, merchant, category, payment method, bank, and notes. Choose **All months** first to export the full group. CSV works well for imports, PDF for sharing and printing, and Excel for spreadsheet analysis. Exports require the group's owner; CSV formula-like text is escaped and Excel text is stored as literal strings. CSV streams in batches; PDF and Excel are prepared before downloading.
- In **New Expense**, paste a receipt image or choose a photo or screenshot. RedTally reads it on your device and suggests a title, merchant, peso total, date, and Manila time when available. Apply the suggestions you want, then review the editable form before saving. The original image and recognized text stay in the browser.
- Owner-only expense deletion with a confirmation showing the title and exact amount. Cancel receives initial focus; pending requests block duplicate submissions and dismissal. Deleting refreshes history and totals without removing the category or expense group.
- **Import expenses** reads CSV, TSV, and Excel `.xlsx` files up to 5 MB in the browser. Choose a worksheet if needed, map the description, date, amount, and optional merchant columns, and select an existing category for the batch. The preview shows invalid rows and possible duplicates before you choose what to save. Each import supports up to 500 data rows and saves positive PHP expenses. Named merchants distinguish otherwise matching expenses; files without merchants retain conservative duplicate warnings. Retrying an uncertain save reuses its draft IDs and does not create another copy.
- The same import dialog accepts unlocked PDF bank statements with selectable text, up to 5 MB and 30 pages. PDF import expects date, description, and debit, withdrawal, or purchase headings on each transaction page of a PHP statement, with four-digit years in the transaction dates. The preview shows source pages so you can compare extracted debits with the statement and deselect transfers or other entries. For scanned PDFs or other statement layouts, use the bank’s CSV or Excel export when available.
- Email/password sign-up, sign-in, and sign-out through Better Auth, with authenticated server-side queries and actions using Prisma and PostgreSQL.
- Database-backed authentication rate limiting and private ownership of new expense groups.
- Philippine peso display formatting.

Sessions last seven days and can renew after one day. Server-rendered pages validate the session. Browser requests renew both the database expiry and the HTTP-only cookie together. The dashboard checks the session on mount, on sign-out from another tab, when the window regains focus or reconnects, and every five minutes while a session exists. When a check confirms a sign-out or account change, the dashboard clears the previous account's data and opens the appropriate page.

The Banks tab includes a Philippine starter catalog. Expense group owners can enable banks and choose the payment methods they use in each group. In the expense form, the optional bank picker shows only banks enabled for the selected payment method. Apply the committed migrations to populate the catalog in an existing database.

The Recurring tab lets owners schedule daily, weekly, monthly, and yearly expenses, optionally ending on a specific date. Use **Run due expenses** to post this group's due entries immediately. Scheduled entries use their original Manila calendar date and appear in regular history. Short months use their last day and retain the original day for subsequent months. A past start date queues catch-up. Paused or blocked schedules can resume with missed dates skipped or included. Deleting a schedule preserves the expenses it already posted.

The app is an early prototype. Email verification, password recovery, Google sign-in, exchange rates, and offline synchronization are not implemented. The standalone categories page is a placeholder. Expense and budget amounts use exact integer centavos; see the migration notes below before deploying this version to an existing database.

Full-screen loading feedback is reserved for sign-in, sign-up, and sign-out. After successful authentication and navigation, the home header stays visible while expense-group cards load into a skeleton. Expense-group navigation shows a page-shaped skeleton inside the signed-in layout while its data loads. Skeletons crossfade into content, respect reduced motion, and never display made-up amounts or names. There is no global loading placeholder. Saves and edits keep their pending/error feedback inside the form dialog.

The form defaults to today's date in `Asia/Manila`. The database stores the selected day at UTC midnight and the optional Manila time separately. Legacy expenses and newly posted recurring expenses display their date until a time is entered. Apply migration `20261116010000_expense_time` before deploying this version.

## Local development

Use a development PostgreSQL database and keep connection credentials out of Git.

1. Install dependencies with `npm ci`.
2. Copy `.env.example` to an untracked `.env` file (the current workspace already has ignored local settings) and configure:
   - `DATABASE_URL`: runtime Prisma/PostgreSQL connection.
   - `DIRECT_URL`: connection used by the Prisma CLI through `prisma.config.ts`.
   - `BETTER_AUTH_SECRET`: generate at least 32 random bytes; the configuration requires a secret of at least 32 characters. Never reuse the example placeholder or commit the value.
   - `BETTER_AUTH_URL`: canonical origin, normally `http://localhost:3000` locally; HTTPS is required outside localhost. Do not include a path, query, or fragment.
3. For a fresh development database, apply committed migrations with `npx prisma migrate deploy`.
4. Generate the Prisma client with `npx prisma generate`.
5. Start the app with `npm run dev`, then open [localhost:3000](http://localhost:3000).

Check the target database before applying migrations. For existing databases, inspect migration history and back up data first; the committed spending migration adds a required category relationship without a backfill.

To try the app with local data, sign up, create an expense group, add a category, and record an expense.

Available scripts:

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the development server |
| `npm run lint` | Run ESLint |
| `npm run typecheck` | Generate Next.js route types and check TypeScript without emitting files |
| `npm run build` | Generate Prisma client and build Next.js |
| `npm start` | Serve an existing production build |
| `npm test` | Discover every `tests/**/*.test.ts` file and run tests without a live database |
| `npm run test:native` | Run the isolated native PostgreSQL 50,000-expense duplication and rollback regression |
| `npm run test:browser` | Run Chromium smoke tests against the production build and a disposable native PostgreSQL cluster |
| `npm run test:browser:install` | Install Chromium in the project's Playwright cache |

GitHub CI runs lint, TypeScript, portable tests, the native PostgreSQL regression, a production build, and Chromium browser checks for pushes and pull requests. Native and browser tests require `REDTALLY_POSTGRES_BIN` pointing to a PostgreSQL directory containing `initdb` and `pg_ctl`. They start their own password-protected cluster on a random loopback port, apply migrations, and remove the cluster after stopping it; they never use `.env`, `DATABASE_URL`, or an existing database. Browser checks also require Playwright's Chromium (`npm run test:browser:install`) and a production build. See [history profiling](docs/performance.md) for reproducible before/after measurements and their limits.

Expense exports are expense-history copies, not complete account backups: they do not include budgets, recurring schedules, or account settings. An export caps the maximum expense ID when it starts; later inserts are excluded, while edits and deletions can affect batches that have not been read yet. For a stable recovery copy, finish editing before downloading and check the exported count and amount against the same history filters. Database backup/restore operations remain a separate deployment responsibility.

PDF reports embed bundled fonts for accented text, simplified and traditional Chinese, Japanese, and Korean, and render emoji in color. Emoji sequences, including joined families, flags, and skin-tone modifiers, stay together when wrapping. Shared Han characters use Japanese glyph forms. The export works offline and keeps the text selectable; equivalent emoji presentation selectors may be normalized when copying text. Explicit text-presentation symbols stay monochrome. Font sources and licenses are documented in `server/pdf/fonts/README.md`.

All export formats keep generated report headings, totals, field labels, and column names plain. User-entered emoji in expense titles, merchants, categories, bank names, and notes are preserved. Exports do not add decorative emoji, category icons, or bank logos to the data.

### Recurring expense worker

Apply the recurring expense migrations through `20261119010000_recurring_expense_submissions` before deploying the matching app. If a schedule save is interrupted, retrying from the open dialog reuses the original draft. Set a separate random `CRON_SECRET` in Vercel Production. The cron in `vercel.json` invokes `/api/cron/recurring-expenses` daily during the 1 a.m. Manila hour. The endpoint requires `Authorization: Bearer <CRON_SECRET>`. For an isolated local database, set the same variable in `.env` and call the endpoint with that header to exercise a run.

Each invocation processes batches of up to 50 occurrences. The worker chooses the least recently updated due schedule and posts its oldest missed date. Advancing a schedule moves it behind the other waiting schedules, including when a later invocation resumes the backlog. The worker stops starting transactions after 45 seconds to leave room for in-flight work within the 60-second function limit. If due work remains, the response reports `hasCatchUpRemaining` and the function logs a warning with the run counts. The next scheduled run resumes automatically, or an operator can call the same protected endpoint to continue sooner. An ineligible bank puts its schedule in Needs attention so other schedules keep posting.

### Exact money and migration

`Expense.amountCentavos` is a positive PostgreSQL integer. For example, PHP 150.75 is stored as `15075`. A single expense may be at most PHP 21,474,836.47. `app/lib/expenses/money.ts` parses decimal strings without floating-point arithmetic, formats peso values, and sums integer centavos with overflow checks. Totals can exceed the single-expense limit while remaining safe JavaScript integers.

New input must be positive, with at most two decimal places; extra decimal places, signs, scientific notation, currency symbols, and grouping commas are rejected rather than silently rounded. Leading/trailing whitespace and leading zeros are accepted. The expense form uses this parser on the server before saving.

For existing databases, `20261022130000_exact_money_centavos` converts legacy float pesos through PostgreSQL `numeric` and rounds once to the nearest centavo (half-centavo ties round up). Invalid/nonfinite amounts, nonpositive values, values rounding to zero, and amounts exceeding the integer limit stop the transaction without dropping the original column. Record IDs, relationships, and dates are unchanged. A database constraint rejects nonpositive centavos.

Back up the database before applying the migration and reconcile expense counts and per-record converted amounts afterward. **Coordinate this migration with the new application release:** it replaces `amount` with `amountCentavos`, so the older deployed application is not compatible with the new schema. Pause traffic during the release, apply committed migrations with `npx prisma migrate deploy`, generate the client, and deploy the matching code. Do not apply this migration independently to a database still serving the older Vercel release. The isolated tests exercise conversion, transaction rollback, and constraints without using `.env` or connecting to Supabase.

### Authentication and production rollout

Better Auth owns credentials and sessions inside the Next.js application. Supabase supplies PostgreSQL only; Supabase Auth, API keys, and browser database access are not used. New accounts start with an empty expense-group list. Every new group gets the verified session user ID on the server; submitted owner IDs are never trusted.

The first release supports email/password sign-up, sign-in, and sign-out. Email addresses are not yet verified, and password recovery is not available until an email-delivery provider is configured. Google sign-in is deferred, with implicit provider linking disabled. Do not treat an email string alone as proof of identity or use it to claim preserved groups.

Migration `20261024100000_user_auth_ownership` adds Better Auth tables, database-backed rate-limit storage, and a nullable owner foreign key on `Spending`. It preserves existing IDs, amounts, child records, and group names; existing groups stay unclaimed. It enables row-level security on application/auth tables without adding Data API access policies. It refuses preexisting policies on the protected tables; resolve them explicitly after auditing before retrying the migration. With no policies, Supabase `anon`/`authenticated` Data API roles have deny-all access. The trusted server database role must own these tables or have `BYPASSRLS`; ordinary RLS-restricted roles cannot run the Prisma backend. The server role bypasses RLS, so application ownership checks remain essential.

Authentication throttling uses database storage across server instances and trusts `x-real-ip`, which Vercel supplies. If hosting behind another proxy, configure it to overwrite this header with the real client IP; do not accept client-controlled forwarding headers. When no trusted client IP is available (as observed locally), authentication requests share one fallback bucket per endpoint. Local browser tests can therefore throttle one another; Vercel supplies the trusted header in production.

The production rollout completed on October 25, 2026 through [PR #1](https://github.com/jcred97/redtally/pull/1), merged as `39be226038cb867de9a98fbfb357e013eace4236`. Vercel reported the matching production deployment as ready. Production authentication variables were configured, a backup was restored and verified in an isolated database, and migration `20261024100000_user_auth_ownership` was applied successfully. All 25 original business rows were preserved; the five legacy expense groups remain unclaimed and hidden.

Production HTTP checks verified sign-up/sign-in for two independent accounts, anonymous redirects, private home lists, access to each account's own group, rejection of cross-user group IDs, hidden legacy records, hostile-origin rejection, and sign-out/session revocation. Temporary test accounts and groups were removed after verification.

The production domain is public and protected by application sign-in. Vercel Standard Protection restricts generated deployment URLs, including older releases without ownership checks; all six older ready deployments were verified behind the Vercel login gate. Keep those older deployment URLs protected while they retain database access.

For future installations or releases that change authentication storage, coordinate the migration with the matching application version:

1. Back up existing rows and inspect migration status and any RLS policies. Verify the runtime role owns the protected tables or has `BYPASSRLS`.
2. Set `BETTER_AUTH_SECRET` and `BETTER_AUTH_URL` in the intended Vercel environment. Production uses `https://redfunds.vercel.app`; Preview needs its own explicit origin/settings. Changing environment variables requires a new deployment.
3. Restrict traffic during transitions where an older release lacks the required access controls or schema support; it must not serve newly private records.
4. Apply committed migrations with `npx prisma migrate deploy`, generate the client, and deploy the matching code. This release is not activated by merely pushing the schema file.
5. Verify anonymous redirects, two independent users, rejected cross-user IDs, sign-out/revocation, and preserved unclaimed legacy records. Any later assignment of legacy groups must target a specifically verified account ID, never the first account to sign up.

### Database connection troubleshooting

If a Supabase connection returns `(ENOTFOUND) tenant/user ... not found`, the shared pooler could not match the configured host and username to a project. This response can arrive after successful DNS resolution; it does not by itself mean a local DNS failure or an incorrect password. See [Supabase's troubleshooting guide](https://supabase.com/kb/troubleshooting/tenant-or-user-not-found).

Check the project's status in Supabase Dashboard, then copy the current connection strings from **Connect** into the untracked `.env` file. Use the Transaction pooler string for `DATABASE_URL` and a Session pooler string for `DIRECT_URL` when a direct connection is unavailable. Copy each host and username exactly, replacing only the password placeholder with the appropriately URL-encoded database password. Restart the app after changing `.env`.

Authenticated pages render per request because their session check uses request headers. A successful build alone does not establish runtime database connectivity. Authentication configuration is required during the build. Validate connectivity before attempting migrations.

## Repository map

| Location | Responsibility |
| --- | --- |
| `app/` | Route entry points, root layout, and global styles |
| `app/(dashboard)/layout.tsx` | Shared navigation for signed-in pages |
| `app/(dashboard)/_components/expense-groups/` | Shared expense-group switcher, creation, and settings controls |
| `app/(dashboard)/page.tsx`, `app/(dashboard)/_home/dashboard/` | Signed-in Dashboard route and cross-group reporting feature |
| `app/(dashboard)/expense-groups/` | Expense Groups list and its private `_components/` |
| `app/(dashboard)/_lib/` | Database access, queries, and server actions grouped by feature, plus the recurring expense worker |
| `app/(dashboard)/spending/[id]/` | Expense-group dashboard, history, categories, banks, and recurring-expense views |
| `app/(dashboard)/spending/[id]/_lib/navigation.ts` | Filter parsing, canonical redirects, and group navigation links |
| `app/(dashboard)/spending/[id]/_lib/expenses/` | CSV, PDF, and Excel export helpers |
| `app/(dashboard)/spending/[id]/export/` | Owner-only expense downloads using history filters |
| `app/(dashboard)/categories/` | Categories route placeholder |
| `app/(auth)/` | Sign-up and sign-in routes and shared form |
| `app/api/auth/[...all]/` | Better Auth HTTP handler |
| `app/api/cron/recurring-expenses/` | Protected scheduled worker entry point |
| `app/lib/auth/` | Better Auth configuration, browser and server clients, and session checks |
| `app/lib/expenses/` | Expense dates, exact centavo parsing/formatting/totals, merchant validation, and import normalization |
| `app/components/` | Shared auth, dialog, feedback, and native form-field components |
| `app/components/forms/` | Reusable Select and DateInput controls with shared icons and picker behavior |
| `server/db/client.ts` | Shared runtime database client |
| `server/db/schema.prisma` | Data model |
| `server/db/migrations/` | Database migration history |
| `server/pdf/fonts/`, `server/pdf/emoji/` | Licensed CJK fonts, selectable emoji text, and color emoji artwork bundled into PDF exports |
| `tests/auth/` | Authentication and session tests |
| `tests/helpers/` | Shared PGlite and native PostgreSQL fixtures and cleanup |
| `tests/expense-groups/duplication.native.ts` | Native 50,000-expense copy preservation, ownership, and rollback regression |
| `tests/browser/` | Production browser smoke coverage with an isolated native database |
| `scripts/` | Automatic test discovery, synthetic history profiling, and isolated browser-test lifecycle |
| `playwright.config.ts` | Chromium browser smoke configuration |
| `.github/workflows/ci.yml` | Lint, TypeScript, and test checks |
| `tests/categories/`, `tests/expense-groups/`, `tests/expenses/` | Feature access, expense date, and money tests |
| `tests/recurring-expenses/` | Recurrence calculator, isolated worker, and schedule ownership tests |
| `tests/dashboard/` | Cross-group and per-group spending, comparison periods, and budget ownership tests |
| `tests/db/migrations/public-id.test.ts` | Public UUID backfill, defaults, uniqueness, and preserved records |
| `tests/db/migrations/` | Tests for PostgreSQL migrations and data preservation |
| `public/branding/` | Active RedTally header logo and handwritten R coin favicon |
| `docs/branding/archive/` | Logo concepts, generation prompts, and previous branding |
| `docs/roadmap.md` | Planned milestones and completion criteria |
| `docs/data-model.md` | Core model, integrity rules, and preservation strategy |
| `docs/performance.md` | Synthetic history/duplication measurements and profiling decisions |

Application code uses grouped feature routes, the private Dashboard home feature, and `_components` and `_lib` folders. Group related files by feature and use short role names such as `access.ts` and `mutations.ts` for implementation modules. Use descriptive component names that match their filenames. Keep feature UI beside its route and group reusable UI by purpose under `app/components/`.

The Prisma schema, migration history, and runtime client live in `server/db/`. Prisma generates its client into the ignored root `generated/` folder. The `@/*` alias resolves from the repository root. Route groups and private folders keep URLs stable as internal files move.

Keep automated test files under the root `tests/` directory, grouped by the area they cover, so application folders contain implementation code. Tests import the implementation from `app/` or `server/`. Name tests `*.test.ts`; `npm test` discovers them recursively. Ordinary database integration suites share `tests/helpers/database.ts`; migration tests retain their specialized setup.

Follow [AGENTS.md](AGENTS.md), including its requirement to read relevant bundled Next.js documentation before writing application code.
