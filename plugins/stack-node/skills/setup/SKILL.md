---
name: setup
description: Wire stack-node into the current project - path-scoped Node, Fastify and NestJS rules for the backend packages it detects, formatter and verify steps, the npm Dependabot entry and an LSP check. Add-only. Use only when the user runs /stack-node:setup or explicitly asks to set up the Node backend stack.
disable-model-invocation: true
argument-hint: "[--profiles node,fastify,nest] [--refresh] [--adopt a,b]"
---

# Set up the Node backend stack

`scripts/setup.mjs` in this skill's directory applies the plugin's `stack.json` contract deterministically. It never overwrites a file you own.

Run `/core:init` first (it creates `.claude/ideal-agentic-env.json`) and `/governance:setup` (it creates `.github/dependabot.yml`). The script skips a part whose file is missing and says so.

## 1. Dry run

Run `node "<this skill's directory>/scripts/setup.mjs" --target . --dry-run`. Pass on `--profiles` or `--refresh` if the user gave them.

Show the user:
- the detected profiles and the package directories each one covers,
- every `create`, `merge`, `update` and `skip` line,
- every `note` line.

Ask them to confirm. If a profile is wrong (for example a frontend package detected as `node`), re-run with `--profiles`.

## 2. Apply

Run the same command without `--dry-run`.

- Rules go to `.claude/rules/stack-node/`. Each file loads only when Claude touches a file under its `paths`.
- Formatter entries and verify steps are appended to `.claude/ideal-agentic-env.json`. Nothing existing is changed.
- The `npm` entry in `.github/dependabot.yml` uses the 14-day cooldown.

## 3. Act on the notes

- **No lockfile, or a git-ignored one:** CI installs with `npm ci` (or the pnpm/yarn equivalent) and OSV-Scanner reads the lockfile. Generate it and commit it.
- **Missing `typecheck`, `lint` or `test` script:** propose the script (for example `"typecheck": "tsc --noEmit"`), ask, add it, then re-run setup so the verify step is registered.
- **No formatter:** propose `prettier` as a devDependency. Ask before installing anything.
- **LSP binary missing:** give the user the install command from the note. Do not install global tools yourself.
- **A CI block was not added** (`ci.yml` has no `ideal-agentic-env` region, or the verify job declares `services:` outside the markers): show the user the fragment from this plugin's `ci/` folder and where it belongs. `.github/` is protected, so ask before editing it.

## 4. Prove it

Run `node scripts/verify.mjs --fast` and show the result. If it is red because of existing failures, say so; do not fix unrelated code here.

After a plugin upgrade, `--refresh` rewrites the rule files this plugin manages. Project-specific rules belong in other files under `.claude/rules/`, which setup never touches.

## Updating after a plugin upgrade

Run the dry run with `--refresh`. It rewrites this plugin's rule files and its blocks in `.github/workflows/ci.yml`, and it updates managed scripts under `.github/scripts/` that nobody edited (ADR-0008). A script that was edited by hand, or that an older release wrote without a marker, shows as `skip`:
1. Show the difference: `node "<this skill's directory>/scripts/setup.mjs" --target . --print <path>`.
2. Ask the user. Only on their yes, re-run with `--adopt <path>`.
