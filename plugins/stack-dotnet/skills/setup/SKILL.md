---
name: setup
description: Wire stack-dotnet into the current project - path-scoped C#, ASP.NET Core and test rules for the .NET projects it detects, the formatter, build/format/test verify steps, Directory.Build.props, the setup-dotnet CI step, the NuGet Dependabot entry and an LSP check. Add-only. Use only when the user runs /stack-dotnet:setup or explicitly asks to set up the .NET stack.
disable-model-invocation: true
argument-hint: "[--profiles dotnet,aspnetcore,test] [--refresh] [--adopt a,b]"
---

# Set up the .NET stack

`scripts/setup.mjs` in this skill's directory applies the plugin's `stack.json` contract deterministically. It never overwrites a file you own.

Run `/core:init` first (it creates `.claude/ideal-agentic-env.json` and `ci.yml`) and `/governance:setup` (it creates `.github/dependabot.yml`). The script skips a part whose file is missing and says so. For EF Core and the database service in CI, also run `/data-sql:setup`.

## 1. Dry run

Run `node "<this skill's directory>/scripts/setup.mjs" --target . --dry-run`. Pass on `--profiles` or `--refresh` if the user gave them.

Show the user:
- the detected profiles and the project directories each one covers,
- every `create`, `merge`, `update` and `skip` line,
- every `note` line.

Ask them to confirm.

## 2. Apply

Run the same command without `--dry-run`. It installs:
- rules under `.claude/rules/stack-dotnet/`: `dotnet.md` for all C#, `aspnetcore.md` for web projects, `testing.md` for test projects,
- the formatter in `.claude/ideal-agentic-env.json`: CSharpier when `.config/dotnet-tools.json` lists it, otherwise `dotnet format whitespace`,
- verify steps: `dotnet build` and `dotnet format --verify-no-changes` in `fast`, `dotnet test` in `full`, all against the root solution file,
- `Directory.Build.props` when the repository has none: nullable, warnings as errors, analyzers, lockfiles and locked restore in CI,
- the `setup-dotnet` step in `ci.yml` (from `global.json` when it exists), with the NuGet cache,
- the `nuget` Dependabot entry with the 14-day cooldown.

## 3. Act on the notes

- **No solution file:** the verify steps need one at the root. Propose `dotnet new sln` and `dotnet sln add` for each project, ask, then re-run setup.
- **No `packages.lock.json`:** run `dotnet restore` (with the new `Directory.Build.props`) and commit the lockfiles.
- **An existing `Directory.Build.props`:** setup left it alone. Compare it with this skill's `templates/Directory.Build.props.tmpl` and propose the missing settings. Ask first: turning warnings into errors can break the build of an existing codebase.
- **LSP binary missing:** give the user the install command. Choose a `csharp-ls` version published at least 14 days ago.
- **A CI block was not added** (`ci.yml` has no `ideal-agentic-env` region, or the job already sets up .NET): show the user the fragment from this plugin's `ci/` folder and where it belongs. `.github/` is protected, so ask before editing it.

## 4. Prove it

Run `node scripts/verify.mjs --fast`, then `--full`. On an existing codebase, warnings that are now errors show up here. Fix them in their own commits, or agree with the user to stage `TreatWarningsAsErrors` per project. Never switch analyzers off to get green.

## Updating after a plugin upgrade

Run the dry run with `--refresh`. It rewrites this plugin's rule files and its blocks in `.github/workflows/ci.yml` (ADR-0008, ADR-0010). `Directory.Build.props` belongs to the project and is never rewritten.
