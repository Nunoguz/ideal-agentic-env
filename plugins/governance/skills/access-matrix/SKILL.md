---
name: access-matrix
description: Maintain the role x permission matrix and access reviews (docs/compliance/access-matrix.md) and check the code enforces them. Use when a change adds a role, permission, endpoint, admin capability, tenant rule or service account; for access reviews; or for "who can do what", RBAC or least-privilege questions.
argument-hint: "[feature | review]"
---

# Access matrix

The matrix is the specification. The authorization code and its tests are the implementation. All three must agree.

## For a change

1. Find how authorization is enforced in this codebase. Look for policies, guards, middleware, annotations (`@PreAuthorize`, `[Authorize]`, route guards), tenant filters and row-level security. Cite `path:line`.
2. For every new or changed action, add or update a row: the resource and action, each role (✅ allowed, 🔒 own records or tenant only, ❌ denied), where it is enforced, and the test.
3. Check the rules:
   - **Deny by default.** Every endpoint and command has an explicit server-side check. UI hiding is not authorization.
   - **Object-level checks:** the caller's tenant and ownership are verified for every identifier taken from the request (IDOR).
   - **Least privilege:** no role gets a permission "for convenience". Admin and support access to customer data is limited and audited (see the `audit-logging` skill).
   - **Tests:** every 🔒 and ❌ cell has a test that proves the denial. Missing tests are findings. Write them with the `test-engineer` subagent.
4. Report any mismatch between the matrix and the code as a finding. Never resolve it silently in either direction.

## For an access review (SOC 2 CC6.2 / CC6.3, ISO 27001 A.5.18)

1. List the operational access: repository collaborators (`gh api repos/{owner}/{repo}/collaborators --paginate`), CI secrets owners, and the database and cloud access the user can describe.
2. Mark people who left, unused accounts and excessive roles. Removing access is the user's action. Record the proposals.
3. Add a row to **Access reviews** with the date, the reviewer (the human), the scope and the changes made.
