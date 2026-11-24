---
name: setup
description: Wire the design plugin into the current project - path-scoped UI rules for the frontend packages it detects, the token-lint verify step (no literal colors or sizes outside the token files) and the design settings. Add-only. Use only when the user runs /design:setup or explicitly asks to set up design or UI quality checks.
disable-model-invocation: true
argument-hint: "[--refresh] [--adopt a,b]"
---

# Set up design quality checks

`scripts/setup.mjs` in this skill's directory applies the plugin's `stack.json` contract. It never overwrites a file you own. Run `/core:init` first.

## 1. Dry run

Run `node "<this skill's directory>/scripts/setup.mjs" --target . --dry-run`. Show the user:
- the detected UI packages,
- every `create`, `merge`, `update` and `skip` line,
- the notes.

Ask them to confirm.

## 2. Apply

Run the same command without `--dry-run`. It installs:
- **Rules:** `.claude/rules/design/ui.md`, loaded only for UI files of the detected packages.
- **Token lint:** `.github/scripts/token-lint.mjs` and a `token-lint` step in `verify.fast`. Lines added to UI files may not contain literal colors or lengths outside the token files.
- **Settings:** `design.tokenFiles` and `design.uiGlobs` in `.claude/ideal-agentic-env.json`. Adjust them if the project's token file has another name. This is a protected file, so ask first.
- **CI evidence:** with `@playwright/test` in a UI package, a step after `verify --full` that uploads the `ui-verify` screenshots and the Playwright report as an artifact.

- **A CI block was not added** (`ci.yml` has no `ideal-agentic-env` region, or the verify job declares `services:` outside the markers): show the user the fragment from this plugin's `ci/` folder and where it belongs. `.github/` is protected, so ask before editing it.

## 3. Next

- If `DESIGN.md` does not exist, suggest `/design:design-direction`. Every UI task depends on it.
- To see how existing code scores, run `node .github/scripts/token-lint.mjs --all`. That is information, not a task: existing code is only checked once it is touched.
- For visual verification, set up the Playwright spec from the `ui-verify` skill.

## Updating after a plugin upgrade

Run the dry run with `--refresh`. It rewrites this plugin's rule files and its blocks in `.github/workflows/ci.yml`, and it updates managed scripts under `.github/scripts/` that nobody edited (ADR-0008). A script that was edited by hand, or that an older release wrote without a marker, shows as `skip`:
1. Show the difference: `node "<this skill's directory>/scripts/setup.mjs" --target . --print <path>`.
2. Ask the user. Only on their yes, re-run with `--adopt <path>`.
