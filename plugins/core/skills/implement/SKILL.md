---
name: implement
description: Execute an approved plan from docs/plans/ slice by slice, test first, with a fast verification after every slice. Use when the user says "implement docs/plans/<file>", "apply the plan", "continue the plan", or "do the next slice".
argument-hint: "<path to plan file>"
---

# Implement

Input: an approved plan file. If none is given, list `docs/plans/` and ask which one. If the plan has no slices or no acceptance criteria, stop and use the `plan` skill first.

## Loop (one slice at a time)

1. Read the next unchecked slice and only the code it touches.
2. **Write the test first** and run it. Confirm it fails for the right reason. (A pure refactor slice needs green tests before and after instead.)
3. Implement the smallest change that makes it pass. Follow the patterns already in the code and the path-scoped rules that load with each file.
4. Run `node scripts/verify.mjs --fast`. If it fails, fix the cause. Never weaken, skip or delete a test.
5. Tick the slice in the plan (`- [x]`) and add one line under it: what changed and any deviation.
6. Continue with the next slice.

## Stop and ask when

- The plan turns out to be wrong or incomplete: propose the plan change and wait.
- A slice would touch a protected path (`.claude/`, CI, `scripts/verify.mjs`, `CLAUDE.md`), a merged migration, or another module's internals.
- You need a new dependency, a schema change that is not in the plan, or an irreversible operation.

## Finish

When every slice is ticked, run `node scripts/verify.mjs --full`, then tell the user it is ready for the `pre-pr` skill. Summarize what was built, what was verified, and anything that was not verified.
