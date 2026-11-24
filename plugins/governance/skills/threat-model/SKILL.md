---
name: threat-model
description: Create or update the STRIDE threat model (docs/security/threat-model.md). Use when a change adds or alters a trust boundary (endpoint, integration, queue, upload, auth flow, admin function, tenant model, infrastructure), or when asked for a threat model or security design review.
argument-hint: "[feature or component]"
---

# Threat model

The threat model is updated incrementally: each change that touches a trust boundary updates the parts it affects. Re-model the whole system only on request.

1. **Scope.** Name the change and the components and data flows it touches. Read the code, not just the plan. Cite `path:line`.
2. **Context and boundaries.** Update the mermaid diagram and the **Trust boundaries** table. A boundary is any place where data crosses from a less trusted to a more trusted zone: internet → API, API → database, service → third party, user upload → storage, tenant A → tenant B.
3. **Threats.** For each affected boundary and asset, walk through STRIDE:
   - **Spoofing:** weak or missing authentication, token validation (signature, audience, issuer, expiry).
   - **Tampering:** unvalidated input, mass assignment, unsigned webhooks, integrity of files and messages.
   - **Repudiation:** sensitive actions without an audit event. Link the `audit-logging` skill.
   - **Information disclosure:** IDOR and tenant leaks, personal data in logs or errors, over-broad API responses, secrets.
   - **Denial of service:** unbounded queries, payloads, retries and fan-out, missing rate limits and timeouts.
   - **Elevation of privilege:** missing server-side authorization, role confusion, injection (SQL, command, template, path, SSRF).
4. **Rate and mitigate.** Give each threat a likelihood and impact (low, medium, high), a concrete mitigation, a status (open, mitigated, accepted) and, most important, the **test or evidence** that proves the mitigation. A mitigation with no test is still open.
5. **Accepted risks** need a named person and a date. You never accept a risk yourself. Propose it, and the user decides.
6. **Report.** List new open threats as follow-ups: issues, or slices in the plan. Put one sentence in the PR. Ask the `security-auditor` subagent to review high-impact threats.

Keep the document factual. No generic threat catalogue: list only threats that apply to this system.
