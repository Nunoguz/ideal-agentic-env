# Expo rules (stack-mobile)

## Versions and native code
- The Expo SDK decides the versions of `react-native`, every `expo-*` package and the community native modules. Add them with `npx expo install <pkg>`, never `npm install`.
- Check them with `EXPO_OFFLINE=1 npx expo install --check` (verify's `expo:check`). Offline, it compares against the installed `expo` package's list, which matches versions picked with the 14-day cooldown. Online, it demands the newest patch of everything.
- Close a Dependabot pull request that moves a package away from the SDK's version. Upgrade the SDK one major at a time with `/stack-mobile:upgrade-deps`.
- Prefer config plugins and Continuous Native Generation (`npx expo prebuild`) to committing `ios/` and `android/`.

## Configuration and secrets
- Configuration lives in a typed `app.config.ts`. Values that differ per environment come from environment variables at build time.
- Only `EXPO_PUBLIC_*` values reach the app, and they are public.
- Build-time secrets live in EAS environment variables. Never commit signing keys, `.p8`/`.p12` files or production `google-services.json` / `GoogleService-Info.plist`.
- Over-the-air updates (`expo-updates`) carry only JS and assets. A native or permission change needs a store build. Set `runtimeVersion: { policy: "fingerprint" }` so an update never reaches an incompatible binary.

## Store and privacy
- iOS: every permission has a purpose string (`ios.infoPlist`). The privacy manifest (`ios.privacyManifests`) declares the required-reason APIs and the collected data.
- Android: request only the permissions the app uses. The Play data safety form matches what the app collects.
- The governance data inventory lists what the app stores on the device and sends. Analytics and crash SDKs count.
- An app that lets users create an account also lets them delete it in the app (App Store and Play requirement).

## Routing
- With `expo-router`, every route file is reachable by deep link. Guard screens that need a session in their layout; the API still authorizes every request.
