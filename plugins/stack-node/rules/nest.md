# NestJS rules (stack-node)

- Validate every DTO: a global `ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true })`, or zod through a pipe. Never trust `@Body()` without it.
- A module exports only its public services. Other modules import the module, never its providers or repositories. `forwardRef` between modules is a design problem to fix, not a tool.
- AuthN and authZ in guards, deny by default (a global guard with an explicit `@Public()` opt-out). Authorization checks ownership of the resource.
- Exception filters map domain errors to responses and never leak internal messages.
- Configuration through `@nestjs/config` with schema validation at startup.
- Tests: `Test.createTestingModule` with overrides for external dependencies; e2e tests with `supertest` against the app instance.
- Call `app.enableShutdownHooks()` and close connections on shutdown.
- Never use `synchronize: true` (TypeORM) outside tests. Schema changes go through migrations.
