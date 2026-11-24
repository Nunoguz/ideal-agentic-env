---
name: setup
description: Wire stack-java-spring into the current project - path-scoped Java, Spring Boot, Spring Modulith and test rules for the Maven or Gradle modules it detects, compile/format/verify steps through the build wrapper, the setup-java CI step, the Maven or Gradle Dependabot entry and an LSP check. Add-only. Use only when the user runs /stack-java-spring:setup or explicitly asks to set up the Java or Spring stack.
disable-model-invocation: true
argument-hint: "[--profiles java,spring-boot,modulith,test] [--refresh]"
---

# Set up the Java / Spring Boot stack

`scripts/setup.mjs` in this skill's directory applies the plugin's `stack.json` contract deterministically. It never overwrites a file you own.

Run `/core:init` first (it creates `.claude/ideal-agentic-env.json` and `ci.yml`) and `/governance:setup` (it creates `.github/dependabot.yml`). The script skips a part whose file is missing and says so. For Flyway migrations and SQL rules, also run `/data-sql:setup`.

## 1. Dry run

Run `node "<this skill's directory>/scripts/setup.mjs" --target . --dry-run`. Pass on `--profiles` or `--refresh` if the user gave them.

Show the user:
- the detected profiles and the modules each one covers,
- every `create`, `merge`, `update` and `skip` line,
- every `note` line.

Ask them to confirm.

## 2. Apply

Run the same command without `--dry-run`. It installs:
- rules under `.claude/rules/stack-java-spring/`: `java.md` for all Java and build files, `spring-boot.md` for Spring Boot modules, `modulith.md` when Spring Modulith is used, `testing.md` for test sources,
- verify steps through the wrapper at the repository root: Maven `test-compile` (and `spotless:check` when the pom has Spotless) in `fast`, `verify` in `full`; or Gradle `testClasses`, `spotlessCheck` and `check`,
- the `setup-java` step in `ci.yml` at the Java release the build declares, with the Maven or Gradle cache,
- the `maven` or `gradle` Dependabot entry with the 14-day cooldown.

## 3. Act on the notes

- **No wrapper:** propose `mvn wrapper:wrapper` (or `gradle wrapper`) with a build tool version published at least 14 days ago, ask, then re-run setup.
- **No formatter:** Java files are not formatted on every edit (a JVM start per file is too slow). Propose the Spotless plugin with `palantir-java-format` or `google-java-format`; ask first, since the first `spotless:apply` reformats the whole codebase and belongs in its own commit.
- **The build is not at the repository root:** add the verify steps by hand, running the wrapper in its directory.
- **LSP binary missing:** give the user the install command for `jdtls`.
- **A CI block was not added** (`ci.yml` has no `ideal-agentic-env` region, or the job already sets up Java): show the user the fragment from this plugin's `ci/` folder and where it belongs. `.github/` is protected, so ask before editing it.

## 4. Prove it

Run `node scripts/verify.mjs --fast`, then `--full`. Integration tests with Testcontainers need a running Docker. On an existing codebase, failures that show up here (ArchUnit, Modulith `verify()`) are fixed in their own commits, never by disabling the check.

## Updating after a plugin upgrade

Run the dry run with `--refresh`. It rewrites this plugin's rule files and its blocks in `.github/workflows/ci.yml` (ADR-0008, ADR-0010), including the Java release after the build moves to a new one.
