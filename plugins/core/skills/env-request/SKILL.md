---
name: env-request
description: Record a requested change to the agent environment (protected paths such as .claude/, CI workflows, scripts/verify.mjs, CLAUDE.md, verify config) instead of making it. Use when a task seems to need a protected-path change the user did not explicitly ask for, or when a rule or check appears wrong.
---

# Environment change request

Protected paths are an ownership boundary. A model is tempted to change a rule or a check to make its own task easier, and the damage from that is silent and spreads to everyone. So you write a request; the owner decides.

1. Append an entry to `docs/ENV_REQUESTS.md`. Create the file with a one-line header if it is missing.

   ```markdown
   ## <YYYY-MM-DD> — <path or area>
   - **Requested change:** <exact change>
   - **Why:** <what blocked you, with evidence>
   - **Impact if not changed:** <what the task does instead>
   - **Status:** open
   ```

2. Continue the current task without the change if you can, and say how.
3. Tell the user the request exists. They can approve it right away and make the change, or let the owner handle it.
