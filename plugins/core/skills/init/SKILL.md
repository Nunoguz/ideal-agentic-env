---
name: init
description: Set up the current project for the ideal-agentic-env environment in one step - detect the stack, let the user pick the plugins, install them, scaffold CLAUDE.md, verify, CI, PR template and the pre-push hook, run every plugin's setup and prove it with verify --fast. Never overwrites existing files. Use only when the user runs /core:init or explicitly asks to initialize or onboard a project.
disable-model-invocation: true
argument-hint: "[--yes] [--plugins a,b] [--owner @handle] [--docs-language English]"
---

# Initialize a project

`scripts/bootstrap.mjs` in this skill's directory does all the work deterministically: plugin installs (through the `claude` CLI, project scope), core's scaffold, every plugin's setup script and `verify --fast`. You run it, let the user choose, and fill in what only a reader of the codebase can write. Re-running it is safe: it adds what is missing and skips the rest.

## 1. Preconditions

- `node --version` is 20 or newer. If not, stop: the core hooks need Node.
- The folder is a git repository (`git rev-parse --show-toplevel`). If not, ask whether to run `git init`.
- The CODEOWNERS owner: pass on `--owner` if the user gave it, else use `@<login>` from `gh api user -q .login`, else leave it out (CODEOWNERS is skipped).

## 2. Detect

Run `node "<this skill's directory>/scripts/bootstrap.mjs" --target . --detect --dry-run --json`. It returns `detected` (the stacks found), `plugins` (what the project would get) and `scaffold` (the files that would be created).

## 3. Let the user pick

Skip this step when the user passed `--yes` (take the detected plugins) or `--plugins a,b` (take exactly those).

Otherwise ask with one AskUserQuestion call, multiSelect, three questions. Put the detected and already-enabled plugins first and add " (detected)" or " (enabled)" to their labels. Tell the user in the question text that ticking a plugin installs it and unticking a detected or enabled one leaves it out.

| Question (header) | Options |
| --- | --- |
| Backend (`Backend`) | `stack-node` Node, Fastify, NestJS · `stack-dotnet` .NET, ASP.NET Core · `stack-java-spring` Java, Spring Boot |
| Frontend and mobile (`Frontend`) | `stack-web` React, Next.js, Vue, Nuxt · `design` design language, accessibility, visual checks · `stack-mobile` React Native, Expo (experimental) |
| Data and operations (`Data/ops`) | `data-sql` SQL databases and migrations · `devops-selfhosted` Dockerfile, Compose, deploy |

`core`, `governance` and `work-github` are always installed; do not offer them. The picked plugins are the project's optional set: everything picked is `--add`, everything detected or enabled but not picked is `--remove`.

## 4. Apply

Run `node "<this skill's directory>/scripts/bootstrap.mjs" --target . --add <picked> [--remove <unpicked>] [--owner @x] [--docs-language <lang>]` (`--add` with a comma-separated list; leave out an empty flag). It:

1. writes core's scaffold, add-only (`CLAUDE.md`, `scripts/verify.mjs`, CI, PR template, `.githooks/pre-push`, `.claude/settings.json` and `.claude/ideal-agentic-env.json`) and sets `core.hooksPath`,
2. installs every chosen plugin at project scope, and for a removed plugin takes back its rules, CI blocks, verify steps and unedited managed files,
3. runs every chosen plugin's setup (governance first),
4. runs `node scripts/verify.mjs --fast`.

If it lists commands under "run by hand" (the `claude` CLI was not found or an install failed), give them to the user exactly.

## 5. Fill in what needs judgement

The core hooks ask for approval on these writes (protected paths). If approval is denied or cannot be given, show the content you would write and stop.

- **`CLAUDE.md`:** replace every `<!-- fill: ... -->` with facts from the codebase (README, build files, entry points). Ask the user for domain facts you cannot infer; never guess. Keep it under about 120 lines.
- **Setup notes:** act on the notes the setups printed, one by one, asking first (for example a missing wrapper, formatter or lockfile). Do not switch analyzers or checks off to get green.

## 6. Hand over

Tell the user, briefly:
- what was installed and set up, and the `verify --fast` result (say plainly when it ran no checks: an empty repository has none until code or a scaffold exists, for example `/stack-java-spring:scaffold`);
- **restart Claude Code** to load the new plugins' skills and hooks;
- commit on a branch and open a PR (ask before committing or pushing). Teammates who clone the project get the plugins offered by Claude Code when they trust the folder;
- to add or remove plugins later: `/core:plugins`.
