---
name: test
description: Write and run .NET tests - xUnit unit tests for domain logic and WebApplicationFactory integration tests against a real database, with fake time and stubbed HTTP. Use when adding or fixing C# behaviour, when asked to test a .NET service, endpoint or repository, or when a dotnet test fails.
---

# Test .NET code

## Choose the level

- **Unit:** domain rules, validators, mappers and pure services. No host, no database.
- **Integration:** an endpoint through the real pipeline with `WebApplicationFactory<Program>`: routing, authorization, validation, ProblemDetails and the database. Use the database the project runs (the CI service container from data-sql, or a local instance), never the EF Core InMemory provider.
- **Contract:** for an API that a frontend or mobile app consumes, assert the status codes and response shapes they rely on.

Use the framework the project already has (xUnit v3 by default); do not add a second one.

## What to cover

For each endpoint:
- the success path, with the response shape,
- validation errors returned as `ValidationProblem`,
- not found (404) and conflict (409) where they apply,
- unauthenticated (401) and unauthorized (403),
- for reads of personal data, the audit log entry.

For a bug, write the failing test first.

## Keep tests honest

- Fake time with `FakeTimeProvider` (`Microsoft.Extensions.TimeProvider.Testing`) and outbound HTTP with a stub `HttpMessageHandler`.
- Each test creates its own data with unique ids, or runs in a transaction it rolls back. No test depends on another test's order.
- Synthetic data only, never real personal data.
- Pass `TestContext.Current.CancellationToken` (xUnit v3) to async calls.

## Run

1. The narrowest test first: `dotnet test --filter "FullyQualifiedName~LoanEndpointsTests"`.
2. Then `node scripts/verify.mjs --fast`, and `--full` before you call the work done.

A red test is information. Never skip or weaken it to get green.
