# SQL Server rules (data-sql)

- Turn on `READ_COMMITTED_SNAPSHOT` for the database, so readers do not block writers. Without it, a long read blocks updates on the same rows.
- Use `nvarchar` for user text, `datetime2` (or `datetimeoffset` for instants) instead of `datetime`, and `decimal(p, s)` for money; never `float` for money.
- Build indexes on large tables with `WITH (ONLINE = ON)` where the edition supports it (Enterprise, Azure SQL); otherwise schedule the migration. `migration-check` warns about offline index builds.
- `sp_rename` and dropping columns follow expand/contract, exactly as in the general migration rules.
- Parameterize every query (`SqlParameter`, EF Core, Dapper parameters); never build `EXEC` / `sp_executesql` text from input.
- Keep transactions short and touch tables in the same order everywhere: deadlocks are reported as error 1205 and the losing transaction must be retried.
