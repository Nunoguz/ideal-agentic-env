---
name: guardrail
description: Capture a recurring pitfall as a path-scoped rule that loads only when matching files are touched, and enforce it mechanically where possible. Use when something broke silently, when the same mistake happens twice, or when the user says "remember this", "never do X again", "add a guardrail".
argument-hint: "<short description of the pitfall>"
---

# Guardrail

A guardrail exists so a future session cannot repeat a known mistake. Text alone is the weakest form, so always look for a stronger layer first.

## 1. Can it be enforced?

In order of preference:

1. A test, ArchUnit or architecture test, lint rule or CI check. This is the **Law** layer and binds humans too.
2. A project hook or verify step.
3. A path-scoped rule (the text below) when the pitfall cannot be detected mechanically.

Do the strongest feasible option, and still write the rule so the reason is recorded.

## 2. Write the rule

Create `.claude/rules/guardrails/<slug>.md`. This is a protected path, so the user will be asked to approve the write.

```markdown
---
paths:
  - "<glob of files where this pitfall can happen>"
---

# <Pitfall in one line, stated as the failure: "X silently does Y">

**Rule:** <what to do or never do, imperative, one or two lines>

**Why:** <what happened or would happen; link the incident, PR or ADR>

**Check:** <the test, lint or CI step that enforces it, or "manual: ...">
```

Keep it under 15 lines. Narrow globs keep the context cost low. A rule that loads everywhere must justify it.

## 3. Report

Tell the user what was enforced mechanically, what remains text only, and the paths that trigger it.
