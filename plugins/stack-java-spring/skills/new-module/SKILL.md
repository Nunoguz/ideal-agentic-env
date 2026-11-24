---
name: new-module
description: Add a Spring Modulith application module end to end - its package with a small public API and internal sub-packages, its own tables through a Flyway migration, events instead of direct calls into other modules, a module test and a passing ApplicationModules.verify(). Use when asked to add a new module, bounded context or feature area to a Spring Boot modular monolith.
---

# Add a Spring Modulith module

The rules are in `.claude/rules/stack-java-spring/modulith.md` (installed by `/stack-java-spring:setup`). Follow the project's existing modules for naming and layout.

1. **Agree on the boundary.** Name the module and what it owns: its data, its use cases, the events it publishes and the events it listens to. If it overlaps an existing module, raise it with the user before writing code; a new module that reaches into another one's tables is a design error.
2. **Package.** `<main package>.<module>`: the public API (a service interface or facade, DTO records, published event records) in the top-level package, everything else in sub-packages such as `internal`. Add `package-info.java` with `@ApplicationModule(displayName = "...")` and, if needed, the `allowedDependencies`.
3. **Data.** The module's tables come in a new Flyway migration (`/data-sql:migration`), prefixed with the module name. No foreign key into another module's tables unless the user agrees; reference by id.
4. **Collaboration.** Other modules call only the API package. Side effects in other modules happen through events: publish with `ApplicationEventPublisher`, consume with `@ApplicationModuleListener`.
5. **Web.** A controller in the module, following the Spring Boot rules (validated request records, ProblemDetails, explicit security). Personal data reads write an audit entry (governance `audit-logging`).
6. **Tests.** An `@ApplicationModuleTest` for the module's use cases and events (the `test` skill), and the existing `ApplicationModules.verify()` test must still pass.
7. **Prove it.** `node scripts/verify.mjs --full`.
