---
name: setup
description: Wire stack-mobile into the current project - path-scoped React Native and Expo rules for the app packages it detects, the shared npm dependency rule, formatter and verify steps (typecheck, lint, tests, SDK version check, bundle export), the npm Dependabot entry and an LSP check. Add-only. Use only when the user runs /stack-mobile:setup or explicitly asks to set up the mobile stack.
disable-model-invocation: true
argument-hint: "[--profiles react-native,expo] [--refresh] [--adopt a,b]"
---

# Set up the mobile stack (React Native / Expo)

`scripts/setup.mjs` in this skill's directory applies the plugin's `stack.json` contract deterministically. It never overwrites a file you own.

Run `/core:init` first (it creates `.claude/ideal-agentic-env.json`) and `/governance:setup` (it creates `.github/dependabot.yml`). The script skips a part whose file is missing and says so.

## 1. Dry run

Run `node "<this skill's directory>/scripts/setup.mjs" --target . --dry-run`. Pass on `--profiles` or `--refresh` if the user gave them. Show the user the detected profiles and the app directories each one covers, every `create`, `merge`, `update` and `skip` line, and every `note`. Ask them to confirm.

## 2. Apply

Run the same command without `--dry-run`. It installs:
- rules under `.claude/rules/stack-mobile/`: `react-native.md` and `expo.md` for the app's files, `npm-dependencies.md` for `package.json`,
- formatter and verify entries in `.claude/ideal-agentic-env.json`: `typecheck`, `lint` and `test:unit` in `fast`; `test`, `expo:check` and `expo:export` in `full` (each only when the root `package.json` has that script),
- the `npm` Dependabot entry with the 14-day cooldown.

## 3. Act on the notes

- **A recommended script is missing:** propose it in the root `package.json` (in a workspace, delegate with `--workspace <app>`), for example `"expo:check": "npm exec --workspace @acme/mobile -- expo install --check"`. Ask, add it, then re-run setup.
- **No secure storage library:** if the app keeps a session, propose `npx expo install expo-secure-store`.
- **No formatter:** propose `prettier`. Ask before installing.
- **LSP binary missing:** give the user the install command.

## 4. Prove it

Run `node scripts/verify.mjs --full`. Then check the app on a simulator or emulator with the `device-verify` skill.

## Updating after a plugin upgrade

Run the dry run with `--refresh`. It rewrites this plugin's rule files (ADR-0008).
