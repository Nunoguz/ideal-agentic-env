# .NET testing rules (stack-dotnet)

- Use the project's framework (xUnit v3 by default). A test name states the behaviour: `Returns_404_when_the_loan_does_not_exist`.
- Integration tests run the real pipeline with `WebApplicationFactory<Program>` against a real database: the CI service container, or a local instance. Never the EF Core InMemory provider: it hides SQL, constraints and transactions.
- Each test owns its data (unique ids, or a transaction rolled back at the end). Tests never depend on each other's order.
- Fake time with `FakeTimeProvider` and outbound HTTP with a stub `HttpMessageHandler`. No real external calls.
- Fixtures use synthetic data only, never real personal data.
- Never `Skip` a failing test to get green. A red test is information.
