# Expense history and duplication profiling

Run the existing access entry points against deterministic synthetic groups:

```sh
node --import tsx scripts/profile-expense-history.ts
# Optional expense counts (25 through 1000000):
node --import tsx scripts/profile-expense-history.ts 1000 10000 50000
```

The script defaults to an in-memory PGlite database. To profile native PostgreSQL, provide an existing PostgreSQL binary directory and add `--native`:

```powershell
$env:REDTALLY_POSTGRES_BIN = 'C:\path\to\postgresql\bin'
node --import tsx scripts/profile-expense-history.ts --native 50000
```

```sh
REDTALLY_POSTGRES_BIN="$(pg_config --bindir)" node --import tsx scripts/profile-expense-history.ts --native 50000
```

Native mode requires `initdb`, `pg_ctl`, and their PostgreSQL runtime files. It creates a fresh temporary cluster with random SCRAM credentials, binds only to loopback on an available port, disables Unix sockets, applies all committed migrations, and stops and removes the cluster in `finally`. It never loads `.env`, uses `DATABASE_URL`, or connects to an existing cluster. Ambient `PG*` variables are removed from subprocesses; SQL connections explicitly set SSL and encoding options. Run as a normal user (PostgreSQL refuses root); a Windows process sandbox may need permission to let PostgreSQL create its restricted token. It does not install a Windows service.

Both modes reuse database fixtures under `tests/helpers/`. Generate the Prisma client first if needed (`npx prisma generate`). Failed duplication is reported with a nonzero exit status after checking rollback.

Each size uses a fresh database with twelve categories, one bank assignment, one budget, 250 merchant names, and expenses spread across 1,095 days. Rows include both known and absent times. Seeding and `ANALYZE` run outside measurements. History measurements report the median, minimum, and maximum of five runs after one warm-up; duplication runs once with the application's current transaction settings. Sizes run sequentially. Run without other test/build processes for less noisy comparisons.

Assertions check cross-user reads and duplication rejection, page sizes and requested page numbers, copied counts and exact totals, category/budget counts, and copied bank-assignment ownership. A failed duplicate must leave the source counts/totals intact and create no group. The regular access suite covers page clamping, broader duplication field preservation, and filter behavior.

## Before the duplication fix: PGlite

Measured November 18, 2026 on Windows x64, Node 24.14.1, PGlite 0.4.1. These local synthetic timings identify areas to investigate; they are not PostgreSQL production latency estimates.

| Expenses | First page median | Last page median | Last page with day totals median | November page median | Duplicate |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 1,000 | 6.0 ms | 3.8 ms | 6.1 ms | 3.3 ms | 411.1 ms |
| 10,000 | 17.3 ms | 22.4 ms | 28.9 ms | 4.9 ms | 4,364.3 ms |
| 50,000 | 56.8 ms | 78.5 ms | 134.2 ms | 4.6 ms | Failed after 47,790.9 ms |

For the 1,000- and 10,000-row runs, sampled process RSS increases during duplication were 8.0 MiB and 36.9 MiB respectively; JavaScript heap increases were 30.6 MiB and 117.3 MiB. Samples occur every 10 ms and at completion, so they can miss short peaks. They include Prisma, PGlite/WASM, and garbage-collection effects in the same process, and measure increases from the operation's starting allocation rather than total required memory. They should not be used as server memory sizing estimates.

The 50,000-row run failed twice with Prisma `P2003` on `Category_spendingId_fkey` during the nested copy update. The measured rerun sampled increases of 1,122.8 MiB RSS and 473.3 MiB JavaScript heap, and verified rollback: no copied group remained and source counts and totals were unchanged.

## Native PostgreSQL reproduction and fix

The same workload was then run against a disposable native PostgreSQL 18.7 cluster (Windows x64, MSVC 19.44.35229), using the same Node version and current transaction defaults. Binaries came from [EDB's portable PostgreSQL distribution](https://www.enterprisedb.com/download-postgresql-binaries), linked from the [PostgreSQL Windows downloads page](https://www.postgresql.org/download/windows/).

| 50,000 expenses | Before | After |
| --- | ---: | ---: |
| Duplication | Failed after 32,262.8 ms | Passed in 1,344.2 ms |
| Sampled Node RSS increase | 1,226.2 MiB | 1.3 MiB |
| Sampled JavaScript heap increase | 463.2 MiB | 0.6 MiB |
| First history page median | 23.1 ms | 23.9 ms |
| Last history page median | 61.4 ms | 62.8 ms |
| Last grouped page median | 108.9 ms | 114.3 ms |
| November history page median | 2.0 ms | 2.4 ms |

Native PostgreSQL reproduced the foreign-key failure during the nested category/expense update, with rollback verified. It therefore was not specific to PGlite. The expensive path materialized all source expenses in JavaScript and built a large nested Prisma mutation. The precise relationship between Prisma planning, its default five-second transaction timeout, and the resulting foreign-key error has not been established; the error should not be interpreted as proof of corrupt source relationships.

Duplication now reads category metadata, creates each destination category sequentially, and copies its expenses with `INSERT ... SELECT` inside the original repeatable-read transaction, without raising its timeout. Bank assignments are remapped inside SQL. This keeps expense payloads in PostgreSQL and avoids the large nested mutation. The native rerun verified copied counts, exact totals, categories, budgets, remapped bank ownership, and cross-user denial. Separate native regression tests verify all copied fields, fresh UTC timestamps with an Asia/Manila database session, and forced transaction rollback.

Memory samples in native mode include Node and Prisma, but not the separate PostgreSQL processes. They measure increases from an operation's starting allocation, may miss brief peaks, and are affected by garbage collection. These local results are not production capacity guarantees. Prisma's pg adapter emitted a concurrent-query deprecation warning during both baseline and fixed profiling; it did not prevent the fixed workload from completing.

The fixed 50,000-row PGlite workload also passed: duplication took 1,355.7 ms, with sampled RSS increase 11.5 MiB and heap increase 2.8 MiB. PGlite runs inside Node, so its memory samples include the database engine and cannot be compared directly with native PostgreSQL Node-only memory samples.

## Next decisions

Keep existing numbered-page navigation and indexes until representative workloads are measured against an isolated native PostgreSQL instance matching deployment. Capture query plans with `EXPLAIN (ANALYZE, BUFFERS)`, application memory peaks, transaction duration, and concurrent workloads. Include low- and high-selectivity filters, grouped day totals, skewed dates, and the largest realistic merchant/category distributions.

The first page also calculates counts and totals over matching history, and grouped results calculate day windows; cursor pagination alone would not remove those costs. Compare query plans before adding an index, since the current ordering includes `date::date`, optional times, and tie-breaking IDs. The default month filter is substantially cheaper in this synthetic workload.

Duplication remains atomic in one transaction. Profile larger expense counts, many categories, and concurrent writes before changing transaction limits. Any future multi-transaction batching needs explicit incomplete-copy visibility, retry, cleanup, and ownership rules. Preserve category and bank remapping and atomic failure behavior.
