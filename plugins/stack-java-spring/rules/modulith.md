# Spring Modulith rules (stack-java-spring)

- Each direct sub-package of the application's main package is a module. Other modules may use only its top-level (API) package; everything in sub-packages is internal. A type another module needs is moved to the API package on purpose, or exposed through a `@NamedInterface`.
- `ApplicationModules.of(Application.class).verify()` runs in a test (`ModularityTests`) and is never disabled. A cycle or an access to an internal type is a design question: fix the dependency, do not weaken the check.
- Modules talk through events for side effects that belong to another module: publish with `ApplicationEventPublisher`, listen with `@ApplicationModuleListener` (asynchronous, in its own transaction). Turn on the event publication registry (`spring-modulith-starter-jpa` or `-jdbc`) so events survive a crash.
- A module owns its tables. Another module never reads or writes them directly: it calls the owning module's API or reacts to its events.
- Test a module on its own with `@ApplicationModuleTest`; publish and assert events with `Scenario`.
- Keep the generated module documentation (`Documenter`) current when the project uses it.
