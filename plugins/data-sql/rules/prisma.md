# Prisma rules (data-sql)

- Change `schema.prisma`, then `prisma migrate dev --create-only`, review and adjust the SQL, then apply. Generated SQL is not automatically safe (locks, NOT NULL, renames).
- Never run `prisma db push` or `prisma migrate reset` against a shared or production database. Production uses `prisma migrate deploy` from the pipeline.
- A renamed field is generated as drop + add (data loss). Write the expand/contract steps by hand instead.
- Select explicit fields (`select: {...}`) for API responses instead of returning whole models.
