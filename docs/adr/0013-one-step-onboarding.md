# ADR-0013: One-step onboarding and a public marketplace

- **Status:** Accepted
- **Date:** 2026-11-24
- **Amends:** [ADR-0003](0003-free-planda-yasa-katmani.md) (branch protection), [ADR-0006](0006-stack-sozlesmesi.md) (how setups run)

## Context

After phase 5, a teammate needed about ten commands to set up a project: GitHub authentication, a marketplace, three mandatory plugins, the stack plugins, a restart, and one setup command per plugin. The marketplace was a private repository, so every teammate also needed an invitation. The owner asked for three things: anyone can find and install it, plugins can be picked by hand or detected and then changed, and the whole thing takes one or two steps with a simple picker.

## Decision

1. **The repository is public** under the MIT license. Installing needs no invitation and no GitHub credentials. The repository was recreated with a single initial commit, so that its history holds no personal data or private project names. Rule: no personal data, private project names or internal paths are ever written into it (CLAUDE.md).
2. **core is installed for the user and is dormant by default.** Its hooks act only below a folder that holds `.claude/ideal-agentic-env.json`, the file `/core:init` creates. Elsewhere they do nothing, and the session gets one hint line instead of the constitution. Bad hook input still fails closed. In a project that is set up, nothing changes.
3. **`/core:init` does everything in one run** (`skills/init/scripts/bootstrap.mjs`):
   - detect the stack,
   - show a checklist through AskUserQuestion,
   - install the chosen plugins at project scope with the `claude` CLI,
   - write the scaffold,
   - run every plugin's setup script from its installed copy (found through Claude Code's plugin registry),
   - run `verify --fast`.

   Setups are deterministic Node scripts, so they do not wait for the restart that loads the new plugins' skills.
4. **`/core:plugins`** changes the set later with the same script. Removing a plugin takes back what its setup provably wrote:
   - its rule folder,
   - its `ci.yml` blocks,
   - the verify and format entries of its `stack.json`,
   - its unedited managed files.

   Edited files and Dependabot entries stay and are reported.
5. **Branch protection** is on for `main`, now that the repository is public: pull requests are required, force pushes and deletion are blocked, and the CI checks must pass. The compensating controls of ADR-0003 stay as a second line.

## Consequences

**Good:**
- Three steps for a new teammate: add the marketplace, install core, run `/core:init`.
- Zero steps for someone who clones a project that is already set up.
- One script for setup and changes, with tests, instead of a sequence of skills the model has to chain.

**Costs and risks:**
- core's skill descriptions are in every session of the user, even outside set-up projects (about 770 tokens).
- `bootstrap.mjs` depends on the `claude` CLI and on the layout of Claude Code's plugin registry (`installed_plugins.json`). When either is missing, it prints the install commands instead, and it finds setup scripts next to core or in the marketplace clone.
- The old repository's pull requests, issues and Actions history are gone. The CHANGELOGs keep the story.
