---
name: scaffold
description: Create a new Spring Boot service (Maven, current Java LTS) as a Spring Modulith modular monolith with validated configuration properties, ProblemDetails, Actuator health groups, Flyway, Testcontainers integration tests, a ModularityTests check and the Maven wrapper. Use only when the user runs /stack-java-spring:scaffold or explicitly asks to create a new Java or Spring Boot service.
disable-model-invocation: true
argument-hint: "<directory> [--group com.company] [--name product] [--gradle]"
---

# Scaffold a Spring Boot service

The layout and code patterns are in `references/spring-boot-service.md`. Read it before writing files.

## 1. Agree on the shape

Confirm with the user:
- the directory, the group id and the base package (`com.company.product`),
- Maven (default) or Gradle (Kotlin DSL). Record the choice in an ADR (`docs/adr/`),
- the first module or two (Spring Modulith: one package per bounded context),
- the database: PostgreSQL (default) or SQL Server. Then `/data-sql:setup` follows,
- the HTTP port for local development. It must not clash with other projects on the machine.

## 2. Generate

1. Check the JDK: `java -version`. Use the current LTS.
2. Versions: a Spring Boot release and a Spring Modulith BOM published at least 14 days ago (the `upgrade-deps` skill's `scripts/maven-cooldown.mjs` checks them once the pom exists; until then, check Maven Central's dates). Spring Modulith's minor line must match the Boot line.
3. Create the project from start.spring.io with `curl` (dependencies: web, validation, actuator, flyway, postgresql, data-jdbc or data-jpa, modulith, testcontainers), or write the pom from the reference. Ask before downloading anything.
4. Add the Maven wrapper (`mvn wrapper:wrapper -Dmaven=<version>`) with a Maven version published at least 14 days ago, and commit `mvnw`, `mvnw.cmd` and `.mvn/wrapper/`.

## 3. Harden it

Apply `references/spring-boot-service.md`: the module packages, `@ConfigurationProperties` records with validation, ProblemDetails, Actuator exposure, `open-in-view=false`, `ddl-auto=validate`, the first Flyway migration, the Testcontainers configuration, `ModularityTests` and one integration test per endpoint.

## 4. Prove it

1. `./mvnw -B -ntp verify` passes (Docker must be running for Testcontainers).
2. Run `/stack-java-spring:setup` and `/data-sql:setup`, so the rules, verify steps, the CI step and Dependabot are registered, then run `node scripts/verify.mjs --full`.
