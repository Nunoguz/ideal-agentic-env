---
name: plugins
description: Add or remove ideal-agentic-env plugins in a project that /core:init has set up - show what is enabled, let the user tick plugins on or off, install and set up the added ones, take back the removed ones' rules, CI blocks and verify steps, then verify. Use only when the user runs /core:plugins or explicitly asks to add, remove or change the project's ideal-agentic-env plugins.
disable-model-invocation: true
argument-hint: "[--add a,b] [--remove a,b]"
---

# Add or remove plugins

The work is done by core:init's script, `<core>/skills/init/scripts/bootstrap.mjs`, where `<core>` is this plugin's root (two directories above this skill).

1. **Check the project.** `.claude/ideal-agentic-env.json` must exist. If it does not, tell the user to run `/core:init` instead and stop.
2. **Current state.** Run `node "<core>/skills/init/scripts/bootstrap.mjs" --target . --detect --dry-run --json`. `plugins` lists what the project has now plus what it would detect.
3. **Pick.** If the user passed `--add` or `--remove`, use them. Otherwise ask with one AskUserQuestion call, multiSelect, using the same three questions and options as core:init (Backend, Frontend and mobile, Data and operations). Mark the enabled plugins " (enabled)" and the detected ones " (detected)", and say that ticking adds a plugin and unticking an enabled one removes it. `core`, `governance` and `work-github` cannot be removed; never offer them.
4. **Confirm a removal.** List what removing takes back: the plugin's `.claude/rules/<plugin>/`, its blocks in `ci.yml`, its verify and format entries, and its unedited managed files. Ask for a yes.
5. **Apply.** Run `node "<core>/skills/init/scripts/bootstrap.mjs" --target . --add <a,b> --remove <c>` (leave out an empty flag). Report what was installed, removed, cleaned and kept, the setups' notes and the `verify --fast` result. Give any "run by hand" command exactly.
6. **Hand over.** Restart Claude Code to load or unload the plugins. Commit the change on a branch and open a PR (ask first).
