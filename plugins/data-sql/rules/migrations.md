# Migration rules (data-sql)

`node .github/scripts/migration-check.mjs` enforces the first two rules in verify and CI.

- **Merged migrations are immutable.** Fix a mistake with a new migration. Tool-managed files (`meta/_journal.json`, `migration_lock.toml`, `*ModelSnapshot.cs`, Flyway `R__*.sql`) are the only exception.
- **No long locks, no silent data loss.** Build indexes concurrently, add constraints `NOT VALID` and validate them later, never add a `NOT NULL` column without a default to a table with rows, never change a column type in place, and never truncate or delete unbounded rows in a migration. If a finding is truly safe, accept it in the file with `-- migration-check: allow <rule-id> <reason>`.
- **Expand/contract for every breaking change.** Rename = add the new column, write both, backfill, read the new one, release, then drop the old one in a later migration. The application version that is running during the deploy must work with both schemas.
- **Forward-only.** Do not rely on down migrations in production. Make each migration safe to retry or wrapped in a transaction.
- **One concern per migration**, named for what it does (`0007_add_loans_due_at.sql`).
- **Backfills** of large tables run in batches outside the schema migration (a job or script) with progress logging and a stop condition.
- **Review generated SQL.** ORMs generate migrations; read the SQL before committing it. Generated is not the same as safe.
- **Set `lock_timeout`** (PostgreSQL) at the top of migrations that alter existing tables, so a blocked migration fails fast instead of queueing every query behind it.
