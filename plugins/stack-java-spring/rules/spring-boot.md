# Spring Boot rules (stack-java-spring)

## Wiring
- Constructor injection only, into `final` fields. No field injection (`@Autowired` on a field), no `ApplicationContext.getBean` in application code.
- Configuration is typed: `@ConfigurationProperties` records with `@Validated` and Bean Validation annotations, so a bad value fails at startup. No scattered `@Value`.
- Profiles separate environments; production settings come from environment variables. `application.yml` holds safe defaults and no secrets.
- Keep `spring.jpa.open-in-view=false`: lazy loading during view rendering hides N+1 queries and holds connections.

## Web
- Controllers are thin: validate (`@Valid` on request records), call a service, map the result. Bind and return DTO records, never JPA entities (over-posting, lazy-loading exceptions, leaked columns).
- Errors are ProblemDetails (RFC 9457): `spring.mvc.problemdetails.enabled=true` and a `@RestControllerAdvice` that maps domain exceptions to a stable `type`. Never return an exception message or a stack trace.
- Version the API in the path or a header, and keep the OpenAPI document (springdoc) accurate.

## Data
- `@Transactional` belongs on service methods, not on controllers or repositories. It only works on public methods called through the proxy: a call from the same class bypasses it. Read paths use `@Transactional(readOnly = true)`.
- Schema changes go through Flyway migrations (data-sql), never `spring.jpa.hibernate.ddl-auto=update`. Use `validate` (or `none`) in every environment.
- Watch N+1: fetch what a use case needs with a join fetch, an entity graph or a projection.

## Security
- Spring Security denies by default: every request matcher is explicit, and `permitAll()` is reviewed. Method security (`@PreAuthorize`) for rules that depend on the data.
- CSRF stays on for cookie sessions; turn it off only for stateless token APIs. CORS lists exact origins.
- Passwords are hashed with the `DelegatingPasswordEncoder` (bcrypt or argon2), never stored or logged.
- Reading personal data the data inventory marks as sensitive writes an audit log entry (governance `audit-logging`).

## Operations
- Actuator exposes only `health` and `info` (and `prometheus` on a management port when the project uses it). Liveness and readiness groups are on; health details are not public.
- Traces and metrics through Micrometer and OpenTelemetry.
- Graceful shutdown (`server.shutdown=graceful`) with a `spring.lifecycle.timeout-per-shutdown-phase` that fits the deployment.
