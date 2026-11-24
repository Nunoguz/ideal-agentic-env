# PostgreSQL rules (data-sql)

- Types: `timestamptz` for instants, `text` with a `check` instead of `varchar(n)`, `numeric` for money (or integer minor units), `uuid` or `bigint generated always as identity` for keys, `jsonb` (not `json`) only for genuinely schemaless data.
- Indexes: build on existing tables with `create index concurrently` (not inside a transaction). Use partial indexes (`where deleted_at is null`) and covering indexes (`include (...)`) deliberately; every index slows writes.
- Constraints: add foreign keys and checks with `not valid`, then `alter table ... validate constraint` in a separate migration.
- `set lock_timeout = '5s';` and, for long statements, `set statement_timeout` at the top of migrations that touch existing tables.
- Row-level security: tables holding tenant or user-owned data enable RLS with policies keyed on a session setting (`current_setting('app.tenant_id')`), and the application role is not the table owner (owners bypass RLS unless `force row level security`).
- Use `explain (analyze, buffers)` on a production-like dataset before trusting a plan; a seq scan on a 100-row dev table says nothing.
