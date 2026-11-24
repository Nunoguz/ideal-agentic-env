# Java testing rules (stack-java-spring)

- JUnit 5 (Jupiter) and AssertJ. A test name states the behaviour: `returnsNotFoundWhenTheLoanDoesNotExist`, or `@DisplayName`.
- Integration tests run against the real database with Testcontainers and `@ServiceConnection` (one container per test run, reused through a shared configuration). Never H2 or another in-memory stand-in for PostgreSQL or SQL Server: it hides SQL, constraints and locking.
- Prefer slices (`@WebMvcTest`, `@DataJpaTest` with `@AutoConfigureTestDatabase(replace = NONE)`) to a full `@SpringBootTest` when one layer is enough. Each distinct context configuration starts a new context, so share them; avoid `@MockitoBean` sprinkled across many test classes.
- Architecture is tested: Spring Modulith's `ApplicationModules.verify()` and ArchUnit rules for layering and naming. They are never `@Disabled`.
- Fix time with a `Clock` bean (`Clock.fixed`). Stub outbound HTTP (`MockRestServiceServer`, WireMock). No real external calls.
- Each test owns its data (unique ids, or a transaction rolled back). Tests never depend on each other's order.
- Fixtures use synthetic data only, never real personal data.
- Never `@Disabled` a failing test to get green. A red test is information.
