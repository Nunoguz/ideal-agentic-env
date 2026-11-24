---
name: api-endpoint
description: Add or change an HTTP endpoint in a Node backend (Fastify or NestJS) with schema validation at the boundary, authorization, error mapping, pagination and tests. Use when the user asks for a new route, endpoint, API, handler or controller action, or to change an existing endpoint's contract.
---

# Add or change an endpoint

The project's rules for the framework are in `.claude/rules/stack-node/`. Follow them.

## 1. Contract first

Write down the method and path, then the schemas for params, query, body and every response status (2xx and the error cases). If the frontend shares types, put the schemas in the shared contracts package and import them on both sides.

When you change an existing endpoint:
- Adding an optional field is compatible.
- Removing or renaming a field, or making it required, breaks clients. Add a new field or version the endpoint, and ask the user first.

## 2. Implement

1. Route: declare the schemas and keep the handler thin. It calls one service method.
2. Service: authorization first. Check that the caller may act on *this* resource, not only that they are signed in. Then the logic, with dependencies passed in.
3. Repository: parameterized queries only. Select explicit columns, never `select *` into a response.
4. Lists: cursor or limit/offset pagination with a capped `limit`.
5. Errors: throw domain errors and let the error handler map them. A missing resource and another user's resource both answer 404 when existence itself is sensitive.

## 3. Personal data

If the endpoint reads or writes personal data, check `docs/compliance/data-inventory.md`. A new field or a new purpose needs an inventory update (`/governance:data-inventory`). Keep personal data out of logs and error messages.

## 4. Tests

Use the `test` skill. At minimum write tests for:
- the success case,
- one validation failure,
- the authorization failure,
- the not-found case.

Then run `node scripts/verify.mjs --fast`.
