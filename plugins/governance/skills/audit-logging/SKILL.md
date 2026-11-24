---
name: audit-logging
description: Design and implement application audit events and their catalogue (docs/security/audit-logging.md). Use when a change adds a sensitive action - sign-in, role change, personal data access or export, admin or support action, security or payment setting - or for audit trail and accountability questions.
argument-hint: "[action or feature]"
---

# Audit logging

An audit log answers "who did what to which record, when, and did it succeed", for actions that matter to security, privacy or money. It is not debug logging, and it never contains secrets or personal data values.

1. **Decide whether the action is auditable.** Auditable actions: authentication events, authorization changes, reading or exporting personal data in bulk, admin and support actions on customer data, configuration and security settings, financial operations, and deletions. When unsure, ask.
2. **Define the event** in the catalogue: a dotted name (`domain.object.verb`), the trigger, the target, any extra fields, retention and the test. Use the record format in the document: who, what, when, where, outcome.
3. **Implement it** through the project's existing audit mechanism. If none exists, propose one in the plan first. It is an architecture decision, so write an ADR. Requirements:
   - Write the event in the same transaction or unit of work as the action, or through an outbox, so it cannot be lost when the action succeeds.
   - Store it append-only. The application cannot update or delete events, and reading the log is itself restricted and audited.
   - Use identifiers only. Record field names that changed, not values. Never record tokens, passwords, or personal data values such as names, e-mail addresses or phone numbers.
   - Use UTC timestamps from a synchronised clock.
4. **Test it.** Each event needs a test asserting that it is emitted with the right actor, target and outcome, including on failure and denial paths.
5. **Retention:** link the retention policy row for audit events. Audit logs usually outlive the data they describe.

The agent's own audit trail (`.claude/audit/`, from the core plugin) is separate. Do not mix the two.
