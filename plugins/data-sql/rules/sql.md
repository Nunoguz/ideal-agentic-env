# SQL and data access rules (data-sql)

- Values reach SQL only as bound parameters, through the driver, a query builder or an ORM. Never interpolate them into SQL text, not even "trusted" ones. Identifiers (table or column names) chosen at runtime come from an allowlist.
- Select explicit columns. `select *` in application code silently changes what an API returns when the table changes.
- Every foreign key has an index on the referencing column unless a composite index already starts with it.
- Lists are paginated with a stable order (`order by created_at, id`). Prefer keyset pagination for large tables.
- No query inside a loop (N+1). Batch with `where id = any($1)` / `in (...)`, or join.
- Keep transactions short and never hold one open across a network call. Pick the isolation level deliberately where it matters (money, counters, uniqueness checks).
- Concurrency: enforce uniqueness and invariants with constraints, not with "check then insert" in code. Use `on conflict` / upsert or row locks (`for update`) where the code reads then writes.
- Timestamps are stored as instants (`timestamptz` in PostgreSQL) in UTC.
- Personal data columns are listed in `docs/compliance/data-inventory.md`. A new one needs an inventory update.
- Never run DDL or bulk DML against a shared or production database from a session. Migrations are applied by the pipeline.
