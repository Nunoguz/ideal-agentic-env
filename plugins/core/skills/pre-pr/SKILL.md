---
name: pre-pr
description: Final gate before a pull request. Full verification, diff review against the plan and the constitution, documentation and compliance check, then a drafted PR. Use when the user says "prepare the PR", "is this ready", "pre-pr", or a plan is fully implemented.
---

# Pre-PR gate

Nothing here pushes or opens a PR on its own. That is a separate, explicit yes from the user.

## Steps

1. **Branch hygiene.** Confirm you are not on the default branch and that the working tree contains only this task's changes (`git status`, `git diff --stat origin/HEAD...`).
2. **Full verification.** Run `node scripts/verify.mjs --full`. If it is red, stop and use the `verify` skill.
3. **Review the diff** (`git diff origin/HEAD...`):
   - Every acceptance criterion in the plan is met and has a test.
   - Nothing out of scope slipped in: drive-by refactors, debug code, commented-out code, TODOs.
   - Constitution checks: no secrets or personal data in code, logs or fixtures; boundaries respected; inputs validated; work is bounded.
   - For non-trivial diffs, ask the `reviewer` subagent for an independent pass. Also ask the `security-auditor` subagent when the change touches auth, permissions, personal data, external input, crypto, infrastructure or dependencies.
   - When the governance plugin is installed, ask its `compliance-auditor` subagent for the compliance report. Do this whenever the diff touches data models, migrations, logging, authorization, external integrations or retention.
4. **Living documents.** Decide, and say, whether this change needs any of:
   - an ADR (hard-to-reverse decision)
   - a guardrail (a pitfall that will bite again)
   - an update to the data inventory or another compliance document (new personal data, new processor, new retention)
   - an update to the README or runbooks

   Write the missing ones, or list them as follow-ups the user agrees to.
5. **Draft the PR.**
   - Title: a Conventional Commit, e.g. `feat(orders): add cursor pagination`.
   - Body: what and why, the linked issue or plan, how it was verified, risks and rollback, and compliance impact. Use `.github/pull_request_template.md` when it exists.
   - Put the compliance-auditor's one-paragraph summary under the compliance section. Tick a checkbox there only when it is true. The governance compliance gate in CI reads the data-inventory checkbox as a human attestation.
6. **Report** the gate result: green or red, the findings and how each was resolved, and the drafted PR text. Then ask whether to push and open the PR. On a yes, the work-github `pr` skill pushes the branch and opens it.
