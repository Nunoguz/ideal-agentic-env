# React Native rules (stack-mobile)

## Rendering
- Function components with typed props. No class components in new code.
- Data that can grow goes in `FlatList` (or `FlashList`) with a stable `keyExtractor`, never `ScrollView` plus `map`. Memoize row components and keep `renderItem` stable.
- Styles come from the design tokens through a theme module and `StyleSheet.create`. No literal colors or sizes scattered in components. Support light and dark mode (`useColorScheme`).
- Every screen handles loading, error, empty and offline states. On mobile, a failed request is the normal case.
- Animations run on the UI thread (Reanimated) and respect reduced motion (`useReducedMotion`).

## Accessibility
- Every touchable has an `accessibilityRole`, and an `accessibilityLabel` when it shows no text. Expose state with `accessibilityState`.
- Touch targets are at least 44×44 pt (iOS) and 48×48 dp (Android).
- Text scales with the system font size. Keep `allowFontScaling` on and make layouts survive 200% text.

## Security and privacy
- Tokens live in the Keychain or Keystore (`expo-secure-store`), never in AsyncStorage, unencrypted storage or logs.
- Everything in the JS bundle, including `EXPO_PUBLIC_*` values, is readable by anyone who has the app. Secret keys stay on the server.
- Deep links and push payloads are untrusted input. Validate the route and its parameters (zod) before navigating, and never change state from a link without the user confirming.
- HTTPS only. No cleartext exceptions in release builds (`NSAllowsArbitraryLoads`, `usesCleartextTraffic`).
- Personal data never goes to analytics, crash reporting or logs. Ask for a permission when the feature needs it, with a purpose string.

## Guardrails (bugs that fail silently)
- An unhandled promise rejection is a yellow box in development and silent in a release build.
- Listeners (`AppState`, `Keyboard`, `NetInfo`, `Linking`) added in an effect are removed in its cleanup.
- Code behind a `Platform.OS` branch is tested on both platforms.
- `new Date(string)` accepts only ISO 8601 reliably on Hermes. Parse other formats explicitly.
