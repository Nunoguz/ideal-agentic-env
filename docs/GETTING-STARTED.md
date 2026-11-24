# Getting started

Three steps from zero to a project with rules, guardrails, CI and a green first check.

## Before you start

You need Claude Code, Node.js 20 or newer and git. Your project's own toolchain (JDK, .NET SDK, Node…) is needed for its checks, and Docker for integration tests that use Testcontainers.

## 1. Add the marketplace and install core (once per machine)

```bash
claude plugin marketplace add Nunoguz/ideal-agentic-env
```

```bash
claude plugin install core@ideal-agentic-env
```

core is installed for your user, so `/core:init` is there in every project. Until you run it in a project, core stays out of the way: its hooks do nothing there and it adds a single hint line to the session.

## 2. Run `/core:init` in your project

Open the project folder in Claude Code and run `/core:init`. It:

1. detects your stack and shows a checklist of plugins. Detected ones are marked; tick or untick what you want,
2. installs the chosen plugins for this project, together with `governance` and `work-github`, which every project gets,
3. writes the project skeleton: `CLAUDE.md`, `scripts/verify.mjs`, CI workflows, the PR template and the pre-push hook. It never overwrites a file you have,
4. runs every plugin's setup: path-scoped rules, verify steps, CI steps and Dependabot,
5. runs `node scripts/verify.mjs --fast` and shows you the result.

Starting from an empty folder? There is nothing to check yet. Create the service with a scaffold, for example `/stack-java-spring:scaffold`, `/stack-dotnet:scaffold`, `/stack-web:scaffold` or `/stack-node:scaffold`, then run `/core:init` again.

## 3. Restart Claude Code

The new plugins' skills and hooks load on restart. Then commit the setup on a branch and open a pull request.

**Teammates who clone the project** do not repeat any of this. When they open the folder and trust it, Claude Code offers to install the project's plugins.

## Changing plugins later

Run `/core:plugins`. It shows the same checklist with your current plugins marked. Ticking a plugin installs and sets it up. Unticking one removes it together with the rules, CI blocks and verify steps it added. `core`, `governance` and `work-github` always stay.

## Updating

Run `/core:update` in the project, then restart Claude Code. It:

1. updates every plugin the project uses, and installs any your clone lacks,
2. refreshes the rules, CI blocks and scripts their setups manage. Files you edited are kept and listed, and you decide about each one,
3. runs `verify --fast` and tells you what changed.

When it changed files, one person commits them in a pull request; everyone else gets them with `git pull`.

Stable plugins never break a project in a minor or patch update. A breaking change comes only in a major version, with a migration note that `/core:update` shows you.

## Common problems

| Symptom | Fix |
| --- | --- |
| `/core:init` is not found | Install core (step 1), then restart Claude Code. |
| "Plugin … is enabled in project settings but isn't installed" | Run the `claude plugin install … --scope project` command in the message, then restart. |
| `verify --fast` says "NO CHECKS CONFIGURED" | The project has no code or no stack plugin yet. Add code or a scaffold and run `/core:init` again. |
| Claude asks before writing `CLAUDE.md`, `.claude/`, `.github/` or a migration | These are protected paths. Read the change and approve it. |
| A setup command does not run when you describe it | Commands that change the project (`init`, `plugins`, `setup`, `scaffold`, `upgrade-deps`) run only when you type them. |
| Java: "jdtls not found" | Optional code intelligence: `brew install jdtls` on macOS. Everything else works without it. |
| Java: Testcontainers cannot find Docker | Start Docker. CI uses the runner's Docker. |
| `security` fails on a license or a vulnerability | Upgrade the dependency. If you cannot, the project owner may accept an exception in `osv-scanner.toml`, with a reason and an expiry date, in a reviewed pull request. Spring Boot projects meet this for Logback and Jakarta Annotations; see the [stack-java-spring README](../plugins/stack-java-spring/README.md). |
| A new dependency version is refused | There is a 14-day cooldown on new releases. `/<stack>:upgrade-deps` lists the versions you can take. |
| A plugin was updated but the project has old rules | Run `/<plugin>:setup --refresh`. |

## Feedback checklist

Trying this for the first time? Fill this in and send it to the maintainer.

- [ ] Time from step 1 to the first green `verify --fast`: ____ minutes
- [ ] Prerequisites I had to install: ____
- [ ] `/core:init` detected the right stack: ____
- [ ] The plugin checklist was clear, and nothing changed that I did not expect
- [ ] The first pull request's CI was green. If not, what failed: ____
- [ ] A guardrail surprised me (which one): ____
- [ ] Missing or wrong on this page: ____
