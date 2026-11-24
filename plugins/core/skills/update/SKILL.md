---
name: update
description: Update a project's ideal-agentic-env plugins in one step - refresh the marketplace, update every plugin the project uses (installing any this clone lacks), refresh the rules, CI blocks and managed scripts their setups wrote, keep and report files the project edited, then verify. Use only when the user runs /core:update or explicitly asks to update the ideal-agentic-env plugins or environment.
disable-model-invocation: true
---

# Update the environment

The work is done by core:init's script, `<core>/skills/init/scripts/bootstrap.mjs`, where `<core>` is this plugin's root (two directories above this skill).

1. **Check the project.** `.claude/ideal-agentic-env.json` must exist. If it does not, tell the user to run `/core:init` instead and stop.
2. **Run it.** `node "<core>/skills/init/scripts/bootstrap.mjs" --target . --update`. It:
   1. refreshes the marketplace,
   2. updates each plugin the project uses at the scope it is installed at, and installs any this clone lacks,
   3. re-runs every plugin's setup with `--refresh`,
   4. runs `verify --fast`.
3. **Report**, briefly:
   - each plugin's version change ("up to date" when nothing moved),
   - the files that were refreshed. Rule files under `.claude/rules/<plugin>/` belong to the plugin, as their header says, and are always rewritten; project rules go in other files. This is expected, not lost work,
   - the files kept because the project edited them. For each kept file, offer to show the difference (`node <plugin>/skills/setup/scripts/setup.mjs --target . --print <path>`); replace it only if the user says so (`--adopt <path>`),
   - the `verify --fast` result,
   - any "run by hand" command, exactly as printed.
4. **Point to what changed.** For each plugin whose version moved, read the new sections of its `CHANGELOG.md` (in the plugin's installed folder) and give the user the one or two lines that matter. A major version always has a migration note: show it and help the user apply it.
5. **Hand over.** Restart Claude Code to load the updated plugins. If files changed, commit them on a branch and open a PR (ask first): teammates then get the refreshed files with `git pull`.
