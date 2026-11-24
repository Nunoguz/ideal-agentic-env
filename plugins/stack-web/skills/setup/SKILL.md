---
name: setup
description: Wire stack-web into the current project - path-scoped web, React and Next.js rules for the frontend packages it detects, formatter and verify steps, the bundle budget, the npm Dependabot entry and an LSP check. Add-only. Use only when the user runs /stack-web:setup or explicitly asks to set up the web frontend stack.
disable-model-invocation: true
argument-hint: "[--profiles web,react,next] [--refresh] [--adopt a,b]"
---

# Set up the web frontend stack

`scripts/setup.mjs` in this skill's directory applies the plugin's `stack.json` contract. It never overwrites a file you own. Run `/core:init` first (it creates `.claude/ideal-agentic-env.json`) and `/governance:setup` (it creates `.github/dependabot.yml`). The script skips a part whose file is missing and says so.

## 1. Dry run

Run `node "<this skill's directory>/scripts/setup.mjs" --target . --dry-run`. Pass on `--profiles` or `--refresh` if the user gave them.

Show the user:
- the detected profiles and the package directories each one covers,
- every `create`, `merge`, `update` and `skip` line,
- every `note`.

Ask them to confirm.

## 2. Apply

Run the same command without `--dry-run`. It installs:
- rules under `.claude/rules/stack-web/`, loaded only for files of the frontend packages,
- formatter and verify entries in `.claude/ideal-agentic-env.json`, including `bundle-budget` after `build` in `verify.full`,
- the default budget in `web.budget`: 200 KB gzip for the largest chunk, 600 KB in total,
- `.github/scripts/bundle-budget.mjs`,
- the `npm` Dependabot entry with the 14-day cooldown,
- with `@playwright/test`, a CI step before `verify --full` that installs the browser (the version comes from the lockfile).

## 3. Act on the notes

- **Lockfile missing or git-ignored:** commit it.
- **A recommended script is missing** (`typecheck`, `lint`, `test`, `build`): propose it, ask, add it, then re-run setup.
- **No formatter:** propose `prettier`. Ask before installing.
- **LSP binary missing:** give the user the install command.
- **A CI block was not added** (`ci.yml` has no `ideal-agentic-env` region, or the verify job declares `services:` outside the markers): show the user the fragment from this plugin's `ci/` folder and where it belongs. `.github/` is protected, so ask before editing it.

## 4. Prove it

1. Run `node scripts/verify.mjs --full` once. It includes the production build and the bundle budget.
2. If the budget fails on an existing app, show the numbers. Agree a budget with the user, then set it in `web.budget` (a protected file, so ask). Do not raise it silently.

For UI work, also run `/design:setup` (design tokens, the token lint and visual verification).

## Updating after a plugin upgrade

Run the dry run with `--refresh`. It rewrites this plugin's rule files and its blocks in `.github/workflows/ci.yml`, and it updates managed scripts under `.github/scripts/` that nobody edited (ADR-0008). A script that was edited by hand, or that an older release wrote without a marker, shows as `skip`:
1. Show the difference: `node "<this skill's directory>/scripts/setup.mjs" --target . --print <path>`.
2. Ask the user. Only on their yes, re-run with `--adopt <path>`.
