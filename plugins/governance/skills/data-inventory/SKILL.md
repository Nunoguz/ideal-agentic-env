---
name: data-inventory
description: Maintain the personal data inventory (docs/compliance/data-inventory.md; VERBİS / GDPR Art. 30). Use when a change adds or changes personal data fields, a processing purpose, a third party receiving data or a transfer abroad; when the inventory-check hook or CI compliance gate asks; or for questions about KVKK, VERBİS or "what personal data do we keep".
argument-hint: "[scan | <table, entity or feature>]"
---

# Data inventory

The inventory says which personal data the system holds, why, on what legal basis, for how long, and who receives it. It holds **field names and categories only**. Never copy real personal data into it, into an issue, or into a PR.

## 1. Find the data

- For a change: read the diff. Note every new or changed field that identifies a person or relates to one.
- For a full pass, or when unsure: run `node "<this skill's directory>/scripts/scan-pii.mjs" --root .`. It lists the schema files and lines that look like personal data, using the same heuristic as the CI gate. It is a starting point, not a verdict. Read each hit in context, and look beyond schemas too: logs, analytics events, third-party SDK calls, exports and file uploads.

## 2. Update `docs/compliance/data-inventory.md`

If the file is missing, ask the user to run `/governance:setup`, or create it from that skill's template.

For each element:
1. Add a row to **Data elements**: element, category, special yes or no, activity, source, protection, retention reference.
2. Attach it to a **processing activity**: an existing purpose, or a new `PA-n` section with every field filled.
3. **Legal basis:** propose one from `references/legal-bases.md` and mark it **to confirm**. You never decide a legal basis. The DPO does.
4. **Special categories** (health, biometric, genetic, religion, ethnic origin, political opinion, union membership, sex life, criminal records, appearance): they need an explicit basis under KVKK Art. 6 / GDPR Art. 9. Usually they also need a DPIA, so run the `dpia` skill and tell the user.
5. **Recipients and transfers:** a new processor (an e-mail provider, analytics, hosting, an AI API) or a transfer abroad goes into the activity. A transfer abroad also needs a KVKK Art. 9 mechanism. Flag it for the DPO.
6. **Retention:** link a row in `retention-policy.md`, or add one with the `retention-and-erasure` skill.
7. Add a **Change log** row with the date and the PR.

## 3. Report

Give the user the summary in one or two sentences: what was added, what is marked "to confirm", and whether a DPIA or DPO decision is needed. Put the same summary under the PR's compliance section.

If a change touches a schema file but adds no personal data (an index, a rename), make no inventory change. Say why in one sentence, and in the PR tick the inventory checkbox or write `Inventory: not needed — <reason>`.
