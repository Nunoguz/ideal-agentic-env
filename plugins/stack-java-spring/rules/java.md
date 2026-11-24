# Java rules (stack-java-spring)

## Build discipline
- One build tool, run through its wrapper (`./mvnw`, `./gradlew`) so every machine and CI use the same version. The wrapper files are committed.
- One Java release for the whole build (`java.version` in the parent pom, or a Gradle toolchain). Prefer the current LTS.
- Versions live in one place: the parent pom's `<dependencyManagement>` and BOMs (Spring Boot, Spring Modulith, Testcontainers), or `gradle/libs.versions.toml`. A module never repeats a version a BOM manages.
- A new dependency gets a version published at least 14 days ago (`upgrade-deps` checks it). A same-line security patch that fixes a blocking finding may be taken at once; name the finding in the pull request.
- Compiler warnings are not noise: build with `-Xlint:all` where the project allows it, and fix what it reports. Never add `@SuppressWarnings` without a comment saying why.

## Code
- `null` stays at the edges. Return `Optional` from lookups that may find nothing; never pass or store `Optional` as a field or parameter. Annotate packages with JSpecify `@NullMarked` where the project uses it.
- Value types are `record`s. Collections handed out are unmodifiable (`List.copyOf`, `Stream.toList()`).
- Time comes from an injected `java.time.Clock`, so tests can fix it. Store instants as `Instant` (or `OffsetDateTime` in UTC); never `java.util.Date` or `LocalDateTime` for a moment in time.
- Money is `BigDecimal` with an explicit scale and `RoundingMode`, created from a `String` (`new BigDecimal("0.1")`), never from a `double`. Compare with `compareTo`, not `equals` (`2.0` and `2.00` are not equal).
- Close what you open with try-with-resources. Never swallow an exception: rethrow with context or handle it; log once, at the boundary.
- Virtual threads (Java 21+) for blocking I/O; never pin them with `synchronized` around blocking calls before Java 24, and never pool them.

## Logging and secrets
- SLF4J with placeholders: `log.info("Loan {} returned", loanId)`, never string concatenation. Structured (JSON) logs in production.
- Never log personal data, tokens, passwords or connection strings. Secrets come from environment variables or a secret store, never from a committed `application*.yml`.

## Guardrails (bugs that fail silently)
- `toLowerCase()`, `toUpperCase()` and `String.format` without a `Locale` use the default locale. Under tr-TR, `"FILE".toLowerCase()` is `"fıle"`. Use `Locale.ROOT` for identifiers, keys and protocol values.
- `==` on `String`, `Integer` or `Long` compares references; it works for small cached values and fails for others. Use `equals`.
- `equals` without `hashCode` (or a mutable field in either) breaks `HashMap` and `HashSet`. Records get both right.
- `new Date()`, `LocalDate.now()` and `ZoneId.systemDefault()` depend on the machine's time zone. Pass a `Clock` and a `ZoneId`.
- `Arrays.asList(...)` is fixed-size, and `List.of(...)` rejects `null`; both throw at runtime, not at compile time.
