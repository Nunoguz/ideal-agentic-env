---
name: rls
description: Design and verify row-level security and tenant isolation in PostgreSQL - policies keyed on a session setting, a non-owner application role, FORCE ROW LEVEL SECURITY, and tests that prove one tenant cannot read or change another's rows. Use when the user asks about multi-tenancy, tenant isolation, row-level security or RLS policies, or when a table holds tenant- or user-owned data.
---

# Row-level security

RLS is defence in depth. The application still checks authorization; RLS makes a forgotten `where tenant_id = ...` fail closed.

## 1. Model

- Every tenant-owned table has a `tenant_id` column (`not null`) and an index that starts with it.
- The application connects as a role that does **not** own the tables. Table owners and superusers bypass RLS. Also set `alter table ... force row level security` so a mistaken owner connection is filtered as well.
- The tenant comes from a transaction-local setting. Set it at the start of every transaction: `select set_config('app.tenant_id', $1, true)`. With a connection pool, never use a session-level setting.

## 2. Policies

```sql
alter table loans enable row level security;
alter table loans force row level security;
create policy loans_tenant on loans
  using (tenant_id = current_setting('app.tenant_id')::uuid)
  with check (tenant_id = current_setting('app.tenant_id')::uuid);
```

- `using` filters reads, updates and deletes; `with check` stops writes into another tenant.
- When the setting is missing, `current_setting('app.tenant_id')` raises an error, so a forgotten setting fails closed. Do not pass `missing_ok` to make it quiet.
- Add policies in a migration (the `migration` skill).

## 3. Prove it

Write integration tests against a real PostgreSQL that:
1. create two tenants with data,
2. show that tenant A cannot select, update or delete tenant B's rows, and cannot insert a row with B's `tenant_id`,
3. show that a transaction without the setting fails.

## 4. Record

Add the control to `docs/security/threat-model.md` (tenant isolation, an elevation-of-privilege mitigation) and to `docs/compliance/access-matrix.md`.
