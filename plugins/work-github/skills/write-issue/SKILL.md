---
name: write-issue
description: Turn a request, bug report or idea into a work item in the shared schema (context, testable acceptance criteria, risks, test plan, compliance impact) as a GitHub issue or a local PBI in docs/pbi/. Use when the user says "write an issue", "create a ticket", "log this bug", "add to the backlog", or describes work to track before building it.
argument-hint: "<what needs to be done>"
---

# Write a work item

The schema is in `references/work-item.md`. Read it before drafting.

## 1. Draft

1. Restate the request in one sentence and pick the type. Ask about anything that changes the acceptance criteria. Do not invent requirements.
2. For a bug, reproduce or locate it first if you can, and include the observed behaviour, the expected behaviour and the steps.
3. Write the criteria as testable checkbox statements. If one item would need more than one PR, propose a split into several items.
4. **Compliance impact:** decide from the request and the code it touches whether it adds or changes personal data, adds a third party or a transfer abroad, changes retention, deletion or access, or touches a security control. If any applies, say which, and add the `compliance` label.
5. Never put personal data, customer names, secrets or production data into the item. Rewrite any examples with synthetic values.

## 2. Confirm and create

Show the draft and the target. The target is the source the user named, otherwise `work.source` in `.claude/ideal-agentic-env.json`, otherwise ask. Create the item only after a yes. Creating a GitHub issue is outward-facing.

- **GitHub:** write the body to a temporary file, then run `gh issue create --title "<title>" --body-file <file> --label "type:<type>" --label "status:needs-triage"`. Add `--label compliance` if it applies. Use the `### <Section>` headings so the body matches the issue form.
- **Local PBI:** run `node "<this skill's directory>/scripts/pbi.mjs" new --title "<title>" --type <type> [--priority p1|p2|p3]`. It prints the new file's path. Fill in the sections in that file.

Report the issue URL or the PBI path. Next step: the `take-issue` skill.
