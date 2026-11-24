---
name: setup
description: Set up work intake for the current project - the GitHub issue form in the shared work-item schema, the local PBI folder, the default work source and the label set. Never overwrites existing files. Use only when the user runs /work-github:setup or explicitly asks to set up issue templates, labels or the backlog.
disable-model-invocation: true
argument-hint: "[--source github|pbi]"
---

# Set up work intake

## 1. Files

1. Run `node "<this skill's directory>/scripts/setup.mjs" --target . --dry-run`, adding `--source` if the user gave one. Without it, the source is `github` when `origin` is on GitHub, otherwise `pbi`. Show the plan and confirm the work source with the user.
2. Run it again without `--dry-run`. The script writes the files itself, so the core edit hooks do not prompt for the protected `.github/` and `.claude/` paths; the confirmed dry run is the review. It creates:
   - `.github/ISSUE_TEMPLATE/work-item.yml`, the issue form in the shared schema,
   - `docs/pbi/README.md`,
   - `"work": { "source": ... }` in `.claude/ideal-agentic-env.json`, only if the key is missing.

## 2. Labels (GitHub source only)

Labels change the repository, so ask first.

1. Show the user the labels in `<this skill's directory>/labels.json`, plus the ones that already exist: `gh label list --limit 200 --json name`.
2. After a yes, create only the missing labels, one `gh label create "<name>" --color <color> --description "<description>"` per label. Never pass `--force`, and never edit or delete existing labels.

## 3. Hand over

- New work starts with the `write-issue` skill and is picked up with `take-issue`.
- The default source is stored in the config. Any item can still name its source explicitly: `#42` or `PBI-0007`.
