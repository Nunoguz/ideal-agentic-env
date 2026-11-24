# Flyway rules (data-sql)

- Versioned migrations (`V<n>__<description>.sql` under `db/migration/`) are forward-only. Once merged, a migration is never edited, renamed or deleted (edit-guard and `migration-check` block it); fix a mistake with a new migration. Repeatable migrations (`R__*.sql`) are the exception: Flyway re-runs them when they change.
- Number migrations so parallel branches do not collide: a timestamp (`V20261124093000__add_loans.sql`) or the next free integer agreed at merge time. Keep `spring.flyway.out-of-order=false`.
- One logical change per migration, with the lock and backfill rules from `migrations.md` (expand, migrate, contract). Spring Boot runs Flyway at startup, so a long-locking migration blocks the deployment.
- Never `flyway clean` outside a throwaway database; keep `spring.flyway.clean-disabled=true` (the default) everywhere.
- The schema comes only from Flyway: `spring.jpa.hibernate.ddl-auto=validate` (or `none`), never `update` or `create`.
- Integration tests run every migration against the real database (Testcontainers), so a migration that fails on PostgreSQL fails in `verify --full`, not in production.
- Flyway 10+ needs the database module next to the core (`flyway-database-postgresql`, `flyway-sqlserver`, `flyway-mysql`). Spring Boot manages its version: add it without one.
