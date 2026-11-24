---
name: scaffold
description: Create a new ASP.NET Core Web API (.NET 10, minimal APIs by default) with a solution, feature folders, validated options, ProblemDetails, health checks, OpenTelemetry, structured logging, graceful shutdown and an xUnit integration test project. Use only when the user runs /stack-dotnet:scaffold or explicitly asks to create a new .NET service or API.
disable-model-invocation: true
argument-hint: "<directory> [--name <Solution.Name>] [--controllers]"
---

# Scaffold an ASP.NET Core service

The layout and code patterns are in `references/aspnetcore-service.md`. Read it before writing files.

## 1. Agree on the shape

Confirm with the user:
- the directory and the root namespace (`Company.Product`),
- minimal APIs (default) or controllers. Record the choice in an ADR (`docs/adr/`),
- whether it needs a database: PostgreSQL (Npgsql) or SQL Server. Then `/data-sql:setup` follows,
- the HTTP port for local development. It must not clash with other projects on the machine.

## 2. Generate with the SDK's templates

1. Check the SDK: `dotnet --list-sdks`. Use the LTS band (10.0) and pin it in `global.json` (`dotnet new globaljson --sdk-version <installed> --roll-forward latestFeature`).
2. `dotnet new sln -n <Name>`, `dotnet new webapi -n <Name>.Api -o src/<Name>.Api --no-https` (TLS terminates at the proxy), `dotnet new xunit3 -n <Name>.Api.Tests -o tests/<Name>.Api.Tests` (or `xunit` when the xUnit v3 templates are not installed), then `dotnet sln add` both.
3. Packages: pick versions published at least 14 days ago (`node "<upgrade-deps skill dir>/scripts/nuget-cooldown.mjs" --target .` lists them once the projects exist). Ask before restoring: it downloads packages.

## 3. Harden it

Apply `references/aspnetcore-service.md`: remove the weather sample, add the feature folder, options validation, ProblemDetails, health checks, OpenTelemetry, rate limiting and the integration test with `WebApplicationFactory`. Add `Directory.Build.props` (`/stack-dotnet:setup` creates it) and `Directory.Packages.props` for central package management.

## 4. Prove it

1. `dotnet build`, `dotnet format --verify-no-changes` and `dotnet test` pass.
2. Commit the `packages.lock.json` files.
3. Re-run `/stack-dotnet:setup` so the rules, verify steps and the CI step are registered, then run `node scripts/verify.mjs --full`.
