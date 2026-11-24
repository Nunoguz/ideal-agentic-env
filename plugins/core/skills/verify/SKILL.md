---
name: verify
description: Run the project's verification (scripts/verify.mjs) and drive failures to their root cause. Use when the user asks to "run the checks", "verify", "why is the build red", "fix the failing tests", or when the Stop hook reports a red verify.
argument-hint: "[--fast | --full]"
---

# Verify

`scripts/verify.mjs` is the single verification entry point. Claude, humans and CI all run it. Its steps live in `.claude/ideal-agentic-env.json` under `verify.fast` and `verify.full`.

- `node scripts/verify.mjs --fast` runs the inner loop after each change.
- `node scripts/verify.mjs --full` runs the gate before a PR. It is the same check CI runs.

## When something fails

1. Read the failing step's output. Locate the **first** real error; later errors are often consequences.
2. Reproduce it with the narrowest command you can, such as a single test file or a single project.
3. Find the root cause in the code under change. Do not patch the symptom.
4. Fix it and re-run the narrow command, then `--fast`.
5. If the failure is pre-existing or unrelated to the current task, do not fix it silently. Tell the user, show the evidence (for example, it fails on `main` too), and ask.

## Never

- Weaken an assertion, add a skip or `@Disabled`, raise a timeout to hide flakiness, or delete a test.
- Change `scripts/verify.mjs`, the verify config or CI to get green. These are protected paths. Use the `env-request` skill instead.
- Claim green without having seen the green output in this session.
