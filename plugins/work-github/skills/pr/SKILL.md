---
name: pr
description: Push the current branch and open a pull request linked to its issue or PBI, filled from the PR template and the pre-pr gate, then report CI status once. Use when the user says "open the PR", "push and create a pull request", or approves the PR text drafted by core pre-pr.
argument-hint: "[--draft]"
---

# Open a pull request

Pushing and opening a PR are outward-facing. Do both only after an explicit yes in this conversation. Never merge. Merging is the user's decision, and core's shell-guard asks before any `gh pr merge`.

## 1. Preconditions

- You are not on the default branch. A direct push to a protected branch is never the way to ship.
- The core `pre-pr` gate ran on this branch in this session and was green. If not, run it first.
- The working tree is clean, and the commits use Conventional Commit messages.

## 2. Body

Start from `.github/pull_request_template.md` if the project has one, filled in with the pre-pr results:

- **What and why:** link the item. For a GitHub issue write `Closes #N`. For a PBI write `PBI: docs/pbi/<file>`. Link the plan in `docs/plans/` and any ADR.
- **How it was verified:** the commands that ran and their results. Never tick a box you have not seen pass.
- **Risk and rollback.**
- **Compliance impact:** the compliance-auditor's summary. Tick the data-inventory checkbox only when it is true: either no personal data changed, or the inventory was updated in this PR. The governance compliance gate reads that box as a human attestation. If unsure, leave it unticked and say why.

## 3. Push and create, after the yes

1. `git push -u origin HEAD`.
2. Write the body to a temporary file, then run `gh pr create --base <default branch> --title "<conventional commit title>" --body-file <file>`. Add `--draft` if the user asked for a draft.
3. **PBI:** `node "<this skill's directory>/../write-issue/scripts/pbi.mjs" set <id> --status in-review`.

## 4. Report

Give the PR URL, then check CI once with `gh pr checks <number>`. Do not poll or watch. Tell the user which checks are pending or failing, and offer the core `verify` skill for red ones.

After the user merges, close the loop. GitHub closes the issue through `Closes #N`. For a PBI, run `pbi.mjs set <id> --status done`.
