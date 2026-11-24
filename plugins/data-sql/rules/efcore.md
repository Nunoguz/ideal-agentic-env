# EF Core rules (data-sql)

## Migrations
- Create them with `dotnet ef migrations add <Name>` and review both the generated `.cs` and its SQL: `dotnet ef migrations script <previous> <Name> --idempotent`. A rename that EF generated as drop and add loses the column's data.
- A merged migration is immutable: add a new one. Only `*ModelSnapshot.cs` changes with every migration.
- Apply migrations in a deploy step (a migration bundle, `dotnet ef migrations bundle`, or one job), not from every app instance at startup. Never call `Database.EnsureCreated()` outside tests: it bypasses migrations.
- Build large indexes without blocking writes: `.IsCreatedConcurrently()` (Npgsql) or `.IsCreatedOnline()` (SQL Server). `migration-check` enforces the same rules as for SQL (`// migration-check: allow <rule> <reason>`).

## Queries
- Read-only queries use `AsNoTracking()` and project with `Select` into a DTO instead of loading whole entities.
- Load related data deliberately (`Include`, projection or split queries); a navigation read inside a loop is an N+1.
- `FromSql($"…")`, `SqlQuery($"…")` and `ExecuteSql($"…")` parameterize interpolated values. `FromSqlRaw` / `ExecuteSqlRaw` with concatenated or interpolated input is SQL injection.
- Page with `OrderBy` before `Skip`/`Take`; use keyset pagination on large tables.
- `ExecuteUpdateAsync` and `ExecuteDeleteAsync` bypass change tracking, interceptors and `SaveChanges` overrides, so audit logging and soft delete implemented there do not run.

## Consistency
- Updates that race need a concurrency token (`xmin` on PostgreSQL, `rowversion` on SQL Server); handle `DbUpdateConcurrencyException`.
- With `EnableRetryOnFailure`, a manual transaction runs inside `Database.CreateExecutionStrategy().ExecuteAsync(...)`, or it fails at runtime.
- Use one `DbContext` per request or unit of work (scoped). It is not thread-safe: never share it across parallel tasks.
- Connection strings come from configuration (user secrets, environment variables or a secret store), never from a committed `appsettings*.json` with a password.
