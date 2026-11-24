---
name: api-endpoint
description: Add or change an ASP.NET Core endpoint end to end - request and response DTOs, validation, authorization, ProblemDetails errors, typed results for OpenAPI, the service call, an audit entry for personal data, and integration tests. Use when asked to add, change or expose a .NET API endpoint or route.
---

# Add an ASP.NET Core endpoint

Follow the project's style (an ADR records minimal APIs or controllers). The patterns are in the `scaffold` skill's `references/aspnetcore-service.md`.

1. **Contract first.** Define the request and response records. Never bind or return entities. If a frontend or mobile app consumes the API, update the shared contract or the OpenAPI document in the same change.
2. **Validation.** Data annotations (or the project's FluentValidation validators) on the request. Invalid input returns `ValidationProblem`.
3. **Authorization.** The endpoint inherits the group's `RequireAuthorization()`. Add a policy when only some roles may call it, and update `docs/compliance/access-matrix.md` (governance `access-matrix`).
4. **Handler.** Thin: call a service, map the result to `TypedResults`. Errors are ProblemDetails with a stable `type`, never an exception message.
5. **Personal data.** If the endpoint returns or changes data the inventory marks as personal, write an audit log entry (governance `audit-logging`) and check `docs/compliance/data-inventory.md`.
6. **Tests.** Integration tests for success, validation, 401/403 and not-found (the `test` skill).
7. **Prove it.** `node scripts/verify.mjs --full`.
