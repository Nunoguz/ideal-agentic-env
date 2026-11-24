---
name: migration
description: Write a safe database schema migration - expand/contract for breaking changes, no long locks, batched backfills, lock_timeout, reviewed generated SQL, and a passing migration-check. Use when the user asks to add, change, rename or drop a table, column, index or constraint, to generate or write a migration, or when migration-check reports a finding.
---

# Write a safe migration

Read `.claude/rules/data-sql/migrations.md` first. It loads automatically when you open a migration file.

## 1. Classify the change

- **Additive and safe:** a new table, a nullable column, a column with a constant default, or a concurrent index. Write it as one migration.
- **Breaking:** a rename, a drop, a type change, a new NOT NULL or a new constraint on existing data. Plan expand/contract across releases and write the plan down in the PR:
  1. *Expand:* add the new structure. The code writes both the old and the new.
  2. *Backfill:* in batches, outside the migration.
  3. *Switch:* the code reads the new structure. Release it.
  4. *Contract:* drop the old structure in a later migration, after the release, with an allow annotation that says why it is safe now.

## 2. Write it

- Use the project's tool (Drizzle, Prisma, Flyway, EF Core, Alembic, or plain SQL) and read the generated SQL.
- For PostgreSQL, put `set lock_timeout = '5s';` at the top of a migration that touches existing tables.
- Build indexes on existing tables with `concurrently`. Add constraints `not valid` and validate them in the next migration.
- Never edit a migration that is already on the default branch. Write a new one.

## 3. Check it

1. Run `node .github/scripts/migration-check.mjs`. Fix every finding. Add an allow annotation only when the operation really is safe here (for example the table is known to be tiny), and write the reason.
2. Apply the migration to a local database. Then run the repository and integration tests (the `test` skill of the stack plugin).
3. If the change adds or changes personal data, update `docs/compliance/data-inventory.md`.

## 4. Report

State the classification, the steps, and what must wait for a later release (the contract step).
