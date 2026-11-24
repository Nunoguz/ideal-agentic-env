# ASP.NET Core rules (stack-dotnet)

## Endpoints
- Follow the style the project chose in an ADR: minimal APIs grouped per feature with `MapGroup`, or controllers. Handlers stay thin: validate, call a service, map the result.
- Validate every request at the boundary and return `ValidationProblem`: data annotations with .NET 10's minimal API validation (`builder.Services.AddValidation()`), or FluentValidation.
- Errors are ProblemDetails (RFC 9457): `AddProblemDetails()` and `UseExceptionHandler()`. Never return an exception message or a stack trace.
- Return typed results (`TypedResults.Ok(dto)`, `Results<Ok<LoanDto>, NotFound>`), so the OpenAPI document is accurate.
- Bind request DTOs, never entities (over-posting).

## Security
- Endpoints require authorization by default: `RequireAuthorization()` on each group, or a fallback policy. `AllowAnonymous` is explicit and reviewed. With `MapIdentityApi`, a fallback policy also locks `/login` (its endpoints carry no `AllowAnonymous`), so use per-group policies there.
- Rate limiting (`AddRateLimiter`) on sign-in, sign-up and other abuse-prone endpoints.
- CORS lists exact origins. Never `AllowAnyOrigin()` together with credentials.
- Behind a reverse proxy, configure `ForwardedHeadersOptions` with the known proxies before `UseForwardedHeaders()`. Use `UseHsts()` in production.
- Cookie-authenticated form posts need anti-forgery.
- Reading personal data the data inventory marks as sensitive writes an audit log entry (governance `audit-logging`).

## Operations
- Health checks: `/health/live` for the process and `/health/ready` for its dependencies. They are anonymous and return no details.
- Traces and metrics through OpenTelemetry; logs are structured JSON in production.
- Graceful shutdown: honour cancellation tokens and set `HostOptions.ShutdownTimeout`.
- Configuration per environment comes from environment variables. `appsettings.Development.json` holds no secrets.
