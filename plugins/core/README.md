# core

> **Status:** Stable, 1.2.0. Every project needs it.

The foundation of the environment. It brings:

- an engineering constitution that applies in every session of a set-up project,
- hooks that enforce the rules in code, not in prose,
- the plan → implement → verify → pull request workflow,
- one-step project setup (`/core:init`) and plugin management (`/core:plugins`).

## Install

Node 20 or newer is the only requirement.

```bash
claude plugin marketplace add Nunoguz/ideal-agentic-env
```

```bash
claude plugin install core@ideal-agentic-env
```

This installs core for your user, so `/core:init` is available in every project. **core is dormant until a project is set up:** in a folder without `.claude/ideal-agentic-env.json` (in it or in a parent folder), its hooks do nothing and the session gets one hint line instead of the constitution ([ADR-0013](../../docs/adr/0013-one-step-onboarding.md)).

## Set up a project: `/core:init`

One command:

1. detects the stack and shows a checklist of plugins (detected ones marked),
2. installs the chosen plugins at project scope, plus `governance` and `work-github`,
3. writes the scaffold, add-only: `CLAUDE.md`, `scripts/verify.mjs`, CI, the PR template, `.githooks/pre-push` (and sets `core.hooksPath`), `.claude/settings.json`, `.claude/ideal-agentic-env.json`,
4. runs every chosen plugin's setup script straight from its installed copy,
5. runs `verify --fast`.

`/core:update` updates every plugin the project uses (and installs any this clone lacks), re-runs their setups with `--refresh` and runs `verify --fast`. Files the project edited are kept and reported. `/core:plugins` adds or removes plugins later. Removing a plugin takes back its rules, CI blocks, verify and format entries and unedited managed files. Edited files and Dependabot entries stay and are reported. The script behind both is `skills/init/scripts/bootstrap.mjs`; `--no-install` prints the `claude plugin install` commands instead of running them.

## Hooks

All hooks run as exec-form Node and behave the same on Windows, macOS and Linux ([ADR-0002](../../docs/adr/0002-cok-platformlu-hook-tasarimi.md)). They act only in set-up projects.

**Safety hooks (fail closed):** if the hook crashes, the action is blocked.

- **`shell-guard`** (PreToolUse, Bash and PowerShell):
  - **Blocks:** deleting the root or home directory, piping a download into a shell (`curl | sh`), force-pushing a protected branch, `DROP DATABASE`, reading secret files.
  - **Asks first:** a direct push to a protected branch (also `git push` while on `main`), `reset --hard`, force push, `TRUNCATE` and `DELETE` without `WHERE`, `kubectl delete`, `terraform destroy`, `publish`, `gh pr merge`, `sudo`.
- **`read-guard`** (PreToolUse, Read and Grep): blocks reading secret files such as `.env`, `*.pem` and SSH keys; `.env.example` is allowed.
- **`edit-guard`** (PreToolUse, edit tools):
  - **blocks** changes to a merged migration,
  - **blocks** content that contains a secret in a known format,
  - **asks** before writing a protected path: `.claude/`, `.github/`, `.githooks/`, `scripts/verify.mjs`, `CLAUDE.md`.

**Convenience hooks (fail open):** if the hook crashes, the action goes on.

- **`format-dispatch`** (PostToolUse): runs the project's formatter on the edited file.
- **`audit-trail`** (PostToolUse, async): records which tool touched which file or program under `.claude/audit/`. Content and full commands are never stored.
- **`verify-gate`** (Stop): after changes in the session, Claude cannot finish until `scripts/verify.mjs --fast` is green. After 3 attempts it stops with a warning.
- **`session-context`** (SessionStart): adds the constitution and the project status (branch, recent plans, setup state).

The blocking patterns are a safety net, not the boundary. The boundary is CI plus branch protection. Where the hosting plan has no branch protection (GitHub Free, private repository), three controls take its place ([ADR-0003](../../docs/adr/0003-free-planda-yasa-katmani.md)): the `.githooks/pre-push` hook, shell-guard's approval for pushes to a protected branch, and governance's `change-audit` workflow.

## Git hook: `.githooks/pre-push`

`/core:init` installs it and enables it in the current clone. It stops direct pushes to a protected branch. Every teammate enables it once per clone:

```bash
git config core.hooksPath .githooks
```

In an emergency `git push --no-verify` bypasses it; governance's `change-audit` still records the push.

## Skills

| Skill | When |
| --- | --- |
| `/core:init` | Setting a project up (typed by the user only) |
| `/core:plugins` | Adding or removing plugins (typed by the user only) |
| `/core:update` | Updating every plugin and refreshing the files they manage (typed by the user only) |
| `plan` | An approved plan before code (`docs/plans/`) |
| `implement` | Executing an approved plan slice by slice, test first |
| `verify` | Running the checks and finding the root cause of a red one |
| `pre-pr` | The last gate before a pull request |
| `adr` | Recording a hard-to-reverse decision |
| `guardrail` | Turning a recurring trap into a path-scoped rule, enforced by a test or lint where possible |
| `env-request` | Requesting a change to a protected path instead of making it |

## Agents

- **`architect`** (opus): design options and trade-offs.
- **`reviewer`:** independent diff review.
- **`security-auditor`:** OWASP ASVS-focused security audit.
- **`test-engineer`** (sonnet): writes tests only, never production code.

`architect`, `reviewer` and `security-auditor` have no Edit or Write tools but do have shell access, so their read-only role is an instruction, not a technical limit. Broad code searches use Claude Code's built-in `Explore` agent.

## Project config: `.claude/ideal-agentic-env.json`

```json
{
  "verify": {
    "fast": [{ "name": "lint", "run": "npm run lint" }],
    "full": [{ "name": "test", "run": "npm test" }],
    "timeoutSec": 240
  },
  "format": [{ "glob": "**/*.ts", "run": "npx prettier --write {file}" }],
  "protectedPaths": [],
  "migrations": [],
  "secretFiles": []
}
```

The safety lists (`protectedPaths`, `migrations`, `secretFiles`) can only **add** to the defaults: a broken or malicious config cannot turn protection off. When a command differs between Windows and Unix, give `run` as `{ "posix": "./mvnw verify", "win32": "mvnw.cmd verify" }`.
