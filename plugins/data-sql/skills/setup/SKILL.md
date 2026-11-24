---
name: setup
description: Wire data-sql into the current project - path-scoped SQL, migration, PostgreSQL and ORM rules, the migration-check verify step (merged migrations immutable, lock and data-loss lint) and the database dialect setting. Add-only. Use only when the user runs /data-sql:setup or explicitly asks to set up database or migration safety.
disable-model-invocation: true
argument-hint: "[--profiles sql,postgres,drizzle,prisma] [--refresh] [--adopt a,b]"
---

# Set up relational database discipline

`scripts/setup.mjs` in this skill's directory applies the plugin's `stack.json` contract. It never overwrites a file you own. Run `/core:init` first.

## 1. Dry run

Run `node "<this skill's directory>/scripts/setup.mjs" --target . --dry-run`, passing on `--profiles` or `--refresh` if the user gave them. Show the user the detected profiles, every `create`, `merge`, `update` and `skip` line, and the notes. Ask them to confirm. The dialect (`dataSql.dialect`) comes from the first detected database profile; correct it with `--profiles` if it is wrong.

## 2. Apply

Run the same command without `--dry-run`. It installs:
- rules under `.claude/rules/data-sql/`, loaded only when SQL, migration or schema files are touched,
- `.github/scripts/migration-check.mjs` and a `migrations` step in `verify.fast`, so the Stop hook, the terminal and CI all run it,
- migration folders of the detected ORM in `migrations` (which core's edit and shell guards also protect),
- the database as a job service in `.github/workflows/ci.yml` (PostgreSQL or SQL Server, pinned by digest), so integration tests in `verify --full` have one. Set the test connection string in the job env as the note says.

Notes:
- **A CI block was not added** (`ci.yml` has no `ideal-agentic-env` region, or the verify job declares `services:` outside the markers): show the user the fragment from this plugin's `ci/` folder and where it belongs. `.github/` is protected, so ask before editing it.

## 3. First run on an existing project

1. Run `node .github/scripts/migration-check.mjs`. It checks only what changed since the base branch, so existing migrations do not fail it.
2. To see how the existing migrations would score, run it with `--all`. That is information, not a task: merged migrations must not be edited to fix it.
3. Confirm the project's migration folders are covered. Run `git ls-files | grep -i migrat` and compare it with `migrations` in `.claude/ideal-agentic-env.json`. Add any missing glob there; this is a protected file, so ask.

## 4. Report

Tell the user what is now enforced and where:
- the immutability of merged migrations: hook and CI,
- the lock and data-loss lint: verify and CI.

Also tell them how to accept a lint finding: `-- migration-check: allow <rule-id> <reason>` in the migration file.

## Updating after a plugin upgrade

Run the dry run with `--refresh`. It rewrites this plugin's rule files and its blocks in `.github/workflows/ci.yml`, and it updates managed scripts under `.github/scripts/` that nobody edited (ADR-0008). A script that was edited by hand, or that an older release wrote without a marker, shows as `skip`:
1. Show the difference: `node "<this skill's directory>/scripts/setup.mjs" --target . --print <path>`.
2. Ask the user. Only on their yes, re-run with `--adopt <path>`.
