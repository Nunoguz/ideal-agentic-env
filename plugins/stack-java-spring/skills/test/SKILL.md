---
name: test
description: Write and run Java and Spring Boot tests - JUnit 5 unit tests for domain logic, slice and integration tests against a real database with Testcontainers, Spring Modulith and ArchUnit architecture tests, with a fixed Clock and stubbed HTTP. Use when adding or fixing Java behaviour, when asked to test a Spring service, endpoint or repository, or when mvnw verify or gradlew check fails.
---

# Test Java / Spring Boot code

## Choose the level

- **Unit:** domain rules, validators, mappers and pure services. Plain JUnit 5 and AssertJ, no Spring context.
- **Slice:** one layer with its Spring wiring: `@WebMvcTest` for a controller (validation, ProblemDetails, security), `@DataJpaTest` with `@AutoConfigureTestDatabase(replace = NONE)` for a repository against the real database.
- **Integration:** `@SpringBootTest` with Testcontainers (`@ServiceConnection` on a shared `PostgreSQLContainer` configuration) for a use case through the real stack. Never H2 as a stand-in.
- **Module:** `@ApplicationModuleTest` for one Spring Modulith module; assert published events with `Scenario`.
- **Architecture:** `ApplicationModules.of(Application.class).verify()` and ArchUnit rules. They exist once per application and are never disabled.

Use the libraries the project already has; do not add a second assertion or mocking library.

## What to cover

For each endpoint:
- the success path, with the response shape,
- validation errors returned as ProblemDetails (400),
- not found (404) and conflict (409) where they apply,
- unauthenticated (401) and unauthorized (403),
- for reads of personal data, the audit log entry.

For a bug, write the failing test first.

## Keep tests honest

- Fix time with a `Clock` bean (`Clock.fixed(...)`), and stub outbound HTTP (`MockRestServiceServer` or WireMock).
- Each test creates its own data with unique ids, or runs in a transaction that rolls back. No test depends on another test's order.
- Reuse one context configuration: every new combination of `@MockitoBean`, properties or profiles starts another Spring context and slows the suite.
- Synthetic data only, never real personal data.

## Run

1. The narrowest test first: `./mvnw -B -ntp test -Dtest=LoanControllerTests` (Gradle: `./gradlew test --tests LoanControllerTests`). Testcontainers needs a running Docker.
2. Then `node scripts/verify.mjs --fast`, and `--full` before you call the work done.

A red test is information. Never `@Disabled` it or weaken it to get green.
