# .NET / C# rules (stack-dotnet)

## Build discipline
- Nullable reference types are on and warnings are errors (`Directory.Build.props`). Fix the warning. Suppress only one line, with a reason: `#pragma warning disable CA1234 // <why>`. Never add a project-wide `NoWarn` for convenience.
- Every project targets the same framework, and `global.json` pins the SDK band.
- With more than one project, package versions live in one place: `Directory.Packages.props` (central package management).
- A new package gets a version published at least 14 days ago (`upgrade-deps` checks it). A same-line security patch that fixes a blocking finding (for example the runtime 10.0.14 → 10.0.15) may be taken at once; name the finding in the pull request. Commit every `packages.lock.json`.

## Code
- Async all the way: never `.Result`, `.Wait()` or `GetAwaiter().GetResult()`. Pass a `CancellationToken` through and honour it. `async void` only for event handlers.
- Dispose what you create (`using`, `await using`). Never `new HttpClient()` per call; use `IHttpClientFactory`.
- Time and randomness come from `TimeProvider` and injected services, so tests can fake them. Store instants as `DateTimeOffset` in UTC.
- Money is `decimal`. Parse and format machine data with `CultureInfo.InvariantCulture`.
- Options are validated at startup: `AddOptions<T>().BindConfiguration("X").ValidateDataAnnotations().ValidateOnStart()`.
- Never catch `Exception` and carry on silently. Log once, at the boundary.

## Logging and secrets
- Structured logging with message templates: `logger.LogInformation("Loan {LoanId} returned", id)`, never string interpolation. On hot paths, use `[LoggerMessage]` source-generated methods.
- Never log personal data, tokens or connection strings. Secrets come from user secrets (development), environment variables or a secret store, never from a committed `appsettings*.json`.

## Guardrails (bugs that fail silently)
- `ToLower()`, `ToUpper()`, `string.Compare` and `StartsWith(string)` without a `StringComparison` use the current culture. Under tr-TR, `"FILE".ToLower()` is `"fıle"`. Use `StringComparison.Ordinal(IgnoreCase)` or `ToLowerInvariant()` for identifiers.
- `DateTime.Now` and `DateTime.Parse` without a culture and a `DateTimeKind` differ by machine and time zone.
- A LINQ query is lazy: enumerating it twice runs it twice, against the database too. Materialize once with `ToListAsync()`.
- Mutating a `struct` read from a property or a list changes a copy.
