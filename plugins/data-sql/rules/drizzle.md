# Drizzle rules (data-sql)

- Change the schema in code, then `drizzle-kit generate` and review the generated SQL file before committing it. Edit the generated SQL for safety (for example `create index concurrently`, `not valid` constraints) while it is still unmerged.
- Never use `drizzle-kit push` against a shared or production database; it applies changes without a migration file. It is acceptable only on a throwaway local database.
- Do not hand-edit `meta/_journal.json` or snapshots; regenerate instead. A merge conflict in the journal means two branches added migrations: regenerate on top of the merged base.
- Apply migrations in the pipeline (`drizzle-kit migrate` or the migrator API), not from an application instance at startup when several instances start together.
