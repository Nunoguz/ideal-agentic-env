# Work item schema

GitHub issues and local PBIs (`docs/pbi/PBI-NNNN-<slug>.md`) use the same sections. The issue form
renders them as `### <Section>` headings, and PBI files use `## <Section>`. Skills read either.

| Section | Required | Content |
| --- | --- | --- |
| Title | yes | `<type>: <outcome>` in imperative form, e.g. `feature: customers can export their orders as CSV`. |
| Type | yes | `feature` · `bug` · `chore` · `spike` |
| Context | yes | Why it matters, who is affected, links (ADR, incident, design). For a bug: observed vs expected behaviour, and the steps to reproduce. |
| Acceptance criteria | yes | Testable checkbox statements. Each one maps to at least one test. "Works well" is not a criterion. |
| Out of scope | no | What this item deliberately does not do. Prevents scope creep. |
| Risks | no | What could go wrong: data migration, performance, security, backwards compatibility. |
| Test plan | no | How the criteria will be verified: unit, integration, e2e, manual UI check. |
| Compliance impact | yes | Personal data added or changed? A new third party or transfer abroad? A change to retention, deletion or access rights? Authentication or security controls touched? Otherwise "none". |

Local PBIs also carry a header list: `Type`, `Status`, `Priority`, `Issue`, `Plan`.

- **Status:** `proposed` → `ready` → `in-progress` → `in-review` → `done` (or `dropped`).
- **Priority:** `p1` (now), `p2` (next), `p3` (later).

An item is **ready** when it has a type, context, at least one testable acceptance criterion and a compliance impact line, and is small enough for one pull request. If it is not small enough, split it.

Never put personal data, customer names, secrets or production data in a work item. Use technical identifiers and synthetic examples.
