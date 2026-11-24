---
name: scaffold
description: Create a new Expo (React Native) app with expo-router, strict TypeScript, a typed app.config.ts, design tokens with light and dark themes, secure token storage, an API client with timeouts, jest-expo with Testing Library, and the verify scripts. Use only when the user runs /stack-mobile:scaffold or explicitly asks to create a new mobile app.
disable-model-invocation: true
argument-hint: "<directory> [--name <package-name>] [--scheme <deep-link-scheme>]"
---

# Scaffold an Expo app

## 1. Agree on the shape

Confirm with the user:
- the directory and package name (inside a workspace, add it to the root `workspaces`),
- the deep link scheme (`--scheme`), the iOS bundle identifier and the Android package name,
- the API it talks to and how it authenticates (bearer tokens from the API's sign-in endpoint),
- whether a design direction exists (`DESIGN.md`). The app's theme module uses its tokens.

## 2. Generate with the official tool, pinned

1. Find a version past the cooldown: `npm view create-expo-app version time --json`. Use one published at least 14 days ago.
2. Run `npx create-expo-app@<version> <dir> --template default` (TypeScript and expo-router). Ask before running it: it downloads packages.
3. The template asks for the newest patch of every Expo package. Pick versions published at least 14 days ago, with `expo` first (the others follow its `bundledNativeModules.json`), and install with `npm install --before <date 14 days ago>`. Pin `typescript` to 6.0.x. Add native modules only with `npx expo install`.

## 3. Harden the generated app

- **TypeScript:** `strict: true`, `noUncheckedIndexedAccess`.
- **Config:** rename `app.json` to a typed `app.config.ts`. Read the API URL from `EXPO_PUBLIC_API_URL` and parse it with zod at startup. Set `scheme`, `ios.bundleIdentifier`, `android.package`, `runtimeVersion: { policy: "fingerprint" }` and the permission purpose strings the app needs.
- **Theme:** `src/theme/` with the DESIGN.md tokens for light and dark, read through `useColorScheme`.
- **Session:** store tokens with `expo-secure-store`. Never use AsyncStorage for them.
- **API client:** `fetch` with a timeout (`AbortSignal.timeout`), typed responses parsed with zod, and loading, error, empty and offline states on every screen.
- **Lint:** `npx expo lint` (eslint-config-expo) and `eslint-plugin-react-native-a11y`.
- **Tests:** `jest-expo` with `@testing-library/react-native`.
- **Scripts:** `typecheck`, `lint`, `test`, `expo:check` (`EXPO_OFFLINE=1 expo install --check`) and `expo:export` (`expo export --platform ios --platform android --output-dir .expo-export`; add `.expo-export/` to `.gitignore`).
- **Cleanup:** remove the template's sample screens and assets.

## 4. Prove it

1. `npm run typecheck`, `npm run lint`, `npm test`, `npm run expo:check` and `npm run expo:export` pass.
2. Re-run `/stack-mobile:setup`, then `node scripts/verify.mjs --full`.
3. Check the screens on a simulator or emulator with the `device-verify` skill.
