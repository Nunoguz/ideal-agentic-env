---
name: test
description: Write and run tests for Node/TypeScript backend code - unit tests, route tests with app.inject or supertest, and integration tests against a real database (Testcontainers or a CI service container). Use when adding or fixing backend behaviour, when asked to test a service, route, repository or job, or when a backend test fails.
---

# Test Node backend code

## Choose the level

- **Unit:** pure logic and services with their dependencies passed in. Use plain objects as fakes; avoid mocking libraries unless the project already uses one.
- **Route:** build the app with `buildApp()` and call `app.inject()` (Fastify) or `supertest` against the Nest app. Assert the status, the body against the response schema, and the error shape (problem+json).
- **Integration:** repositories and migrations against a real database of the same engine and major version as production. Never use SQLite for a Postgres app. Use Testcontainers locally, or the CI service container when `DATABASE_URL` is set.

Use the project's runner (`node:test`, Vitest or Jest). Do not add a second one.

## Write the test first

For a bug, write the test that reproduces it and watch it fail before you fix the code. For a feature, cover:
- the main success case,
- each validation failure that matters,
- authorization: another user's resource returns 403 or 404,
- the empty and paginated cases for lists.

## Keep tests honest

- Each test sets up its own data, with unique ids, and does not depend on the order tests run in.
- No real network calls to third parties. Fake them at the boundary.
- Fixtures contain no real personal data. Use obviously synthetic values, for example `user-1@example.test`.
- Do not assert on log output or timing unless that is the behaviour under test.

## Run

1. Run the narrowest command first (one file or one test name).
2. Then run `node scripts/verify.mjs --fast`.
3. A red test is information. Report it with its output. Never skip, weaken or delete a test to get green.
