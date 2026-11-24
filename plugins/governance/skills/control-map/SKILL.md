---
name: control-map
description: Maintain the SOC 2 / ISO 27001 control map (docs/compliance/control-map.md) and assemble audit evidence for a period. Use when a change adds, removes or weakens a control (CI check, review rule, logging, access control, backup), before an audit, or for "which controls does this satisfy" questions.
argument-hint: "[change | evidence <from> <to> | gaps]"
---

# Control map

The control map connects what the team actually does to the controls an auditor tests. The mapping is indicative, and the auditor decides. Never claim a control is "compliant". Say what the mechanism is and where its evidence lives.

## When a change affects a control

1. Find the row or rows the change touches. If a control is added, add a row. If one is weakened or removed (a check disabled, a review rule relaxed), say so prominently. It needs the owner's explicit agreement, and the core constitution forbids disabling checks to get unblocked.
2. Keep the evidence column concrete: a workflow name, a document path, an issue label, a log store. "We review code" is not evidence. "PR history with approvals, change-audit runs" is.

## Evidence for an audit period

Change management is the most sampled control. For the period the user names:

```bash
gh pr list --state merged --search "merged:<from>..<to>" --limit 500 --json number,title,author,mergedAt,reviewDecision,statusCheckRollup
gh issue list --state all --search "[change-control] in:title created:<from>..<to>" --json number,title,state,createdAt
gh run list --workflow change-audit.yml --created "<from>..<to>" --limit 500 --json conclusion,headSha,createdAt
```

Summarise into `docs/compliance/evidence/<from>_<to>.md`:
- merged PRs and how many had green checks and an approval,
- change-control exceptions and their resolution,
- security workflow failures and their fixes,
- updates to the data inventory, threat model and access reviews in the period (`git log --since --until -- docs/compliance docs/security`).

List no personal data beyond GitHub handles.

## Gaps

Rows with `<!-- fill -->` or with no evidence are gaps. List them with a proposed owner and the plugin or skill that would close each one. For example, backup and environment separation come with `devops-selfhosted`.

## AI-assisted development (ISO/IEC 42001, if in scope)

The evidence that AI contributions are traceable and human-approved:
- `Co-Authored-By` trailers on commits (Claude Code adds them by default; do not remove them),
- the agent audit trail in `.claude/audit/`,
- every change merged through a human-approved PR (change-audit).
