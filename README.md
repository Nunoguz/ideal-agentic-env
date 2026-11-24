# ideal-agentic-env

A **Claude Code plugin marketplace** that turns any project into a production-grade agentic engineering environment. With these plugins, Claude follows the project's stack rules, safety guardrails and compliance checks, and works plan → implement → verify → pull request.

- **Rules that load when they matter:** editing Java loads the Java and Spring rules, editing a migration loads the SQL rules.
- **Guardrails as hooks, not hopes:** pushes to `main`, edits to merged migrations, secrets in files and destructive commands are blocked deterministically.
- **One verify command** for Claude, people and CI: `node scripts/verify.mjs --fast | --full`.
- **Compliance built in:** secret, SAST, dependency and license scanning, a personal-data inventory gate (KVKK/GDPR) and a change-control audit, as GitHub Actions.

## Quick start

**1. Add the marketplace and install core** (once per machine):

```bash
claude plugin marketplace add Nunoguz/ideal-agentic-env
```

```bash
claude plugin install core@ideal-agentic-env
```

**2. Open your project in Claude Code** and run:

```text
/core:init
```

It detects the stack and shows a checklist of plugins. Tick the ones you want; it installs them, sets everything up and runs the first check.

**3. Restart Claude Code.** Done.

Joining a project someone already set up? Clone it and open it in Claude Code: it offers to install the project's plugins.

Step-by-step guide and troubleshooting: [docs/GETTING-STARTED.md](docs/GETTING-STARTED.md).

## Plugins

| Plugin | What it does | Status |
| --- | --- | --- |
| [`core`](plugins/core/README.md) | Constitution, safety hooks, plan/implement/verify workflow, one-step setup | Stable, always installed |
| [`governance`](plugins/governance/README.md) | KVKK/GDPR data inventory, threat model, audit logging, SOC 2 / ISO 27001 evidence, security CI | Stable, always installed |
| [`work-github`](plugins/work-github/README.md) | Work items as GitHub Issues or local PBI files, through to the pull request | Stable, always installed |
| [`stack-web`](plugins/stack-web/README.md) | React, Next.js, Vue, Nuxt | Stable |
| [`stack-node`](plugins/stack-node/README.md) | Node, Fastify, NestJS | Stable |
| [`stack-dotnet`](plugins/stack-dotnet/README.md) | .NET, ASP.NET Core | Stable |
| [`stack-java-spring`](plugins/stack-java-spring/README.md) | Java, Spring Boot, Spring Modulith (Maven; Gradle experimental) | Stable |
| [`data-sql`](plugins/data-sql/README.md) | Safe migrations (SQL, EF Core, Flyway), indexing, row-level security | Stable |
| [`design`](plugins/design/README.md) | Per-project design language, tokens, accessibility, visual checks | Stable |
| [`devops-selfhosted`](plugins/devops-selfhosted/README.md) | Dockerfile, Compose, container scanning, deploy (Kubernetes experimental) | Stable |
| [`stack-mobile`](plugins/stack-mobile/README.md) | React Native, Expo | Experimental |

Stable plugins follow semantic versioning: a breaking change comes only in a major version with a migration note ([ADR-0012](docs/adr/0012-v1-surum-sozu.md)). Experimental plugins may change without notice.

## Everyday use

| To | Run |
| --- | --- |
| Pick up a work item | `/work-github:take-issue 42` |
| Plan it | `/core:plan` |
| Implement the plan | `/core:implement docs/plans/<file>` |
| Check before a PR | `/core:pre-pr` |
| Open the PR | `/work-github:pr` |
| Add or remove plugins | `/core:plugins` |

Plain language works too: "take issue 42", "plan this", "open the PR".

**Updating:** run `claude plugin marketplace update ideal-agentic-env`, update the plugins in the `/plugin` menu, then `/<plugin>:setup --refresh` in the project.

## Development

Node 20 or newer, no dependencies.

```bash
npm run check
```

- `npm run validate` checks the marketplace and every plugin against the repository rules.
- `npm test` runs the tests of the validator, hooks and setup scripts.

CI also runs `claude plugin validate . --strict` and dogfoods governance's `security`, `compliance` and `change-audit` workflows. Code that several plugins ship lives in `shared/`: edit it there, then run `npm run sync`. Contribution rules are in [CLAUDE.md](CLAUDE.md); decisions are recorded in [docs/adr/](docs/adr/).

## License

[MIT](LICENSE)
