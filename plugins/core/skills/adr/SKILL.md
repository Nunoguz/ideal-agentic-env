---
name: adr
description: Record an architecture decision record in docs/adr/. Use when a hard-to-reverse choice is made or proposed (framework, data model, module boundary, integration pattern, security model, new infrastructure), or when the user says "write an ADR", "record this decision", "why did we choose X".
argument-hint: "<decision title>"
---

# ADR

1. Find the next number: the highest `docs/adr/NNNN-*.md` plus one, zero-padded to four digits.
2. Copy the structure of `docs/adr/0000-template.md`:
   - Status
   - Date
   - Context
   - Decision
   - Consequences (positive and negative)
   - Alternatives considered
   - Links
3. Write it in the project's documentation language (CLAUDE.md says which; default English). Keep it to one screen: the decision and its *why*, not a design document.
4. Status is `Proposed` unless the user has already decided; then `Accepted`. Never change an accepted ADR's decision. A new ADR supersedes it, and the old one's status becomes `Superseded by ADR-NNNN`.
5. Link the ADR from the plan or PR that motivated it.
