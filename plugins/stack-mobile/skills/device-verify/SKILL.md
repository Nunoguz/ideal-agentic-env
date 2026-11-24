---
name: device-verify
description: Check a React Native or Expo app visually on the iOS simulator and the Android emulator - screenshots of each screen in light and dark mode, large text and screen-reader labels, reviewed against DESIGN.md. Use after building or changing a mobile screen, or when asked to check how the app looks or behaves on a device.
---

# Verify the app on devices

## 1. Run the app

- **iOS simulator** (macOS with Xcode): boot one (`xcrun simctl list devices available`, `xcrun simctl boot <udid>`, `open -a Simulator`). With Expo Go: `npx expo start --ios`. With a development build: `npx expo run:ios` (needs CocoaPods).
- **Android emulator:** start an AVD (`emulator -list-avds`, `emulator -avd <name>`). With Expo Go: `npx expo start --android`.
- Metro uses port 8081. If another project uses it, pass `--port`.

Starting a simulator, installing Expo Go and building download and run software on the user's machine. Ask first.

## 2. Capture the screens

Run `node "<this skill's directory>/scripts/device-shots.mjs" --platform ios --prefix <prefix> --routes /,/loans,/loans/1`, and again with `--platform android`:
- Expo Go: `--prefix exp://127.0.0.1:8081/--/` (use the Android emulator's `exp://10.0.2.2:8081/--/` for Android).
- A development build: `--prefix <scheme>://`.

It writes `artifacts/device/<route>-<platform>-<light|dark>.png`. If the session has a simulator tool (for example Claude Code's iOS Simulator tool), you may use it to tap through flows and take screenshots instead.

## 3. Review

Read each PNG (the Read tool shows images) and check:
- the DESIGN.md tokens: colors, type scale, spacing; dark mode has enough contrast,
- the four data states (loading, error, empty, populated) for each data screen,
- safe areas, the notch and the keyboard: nothing important is hidden,
- large text: `xcrun simctl ui booted content_size accessibility-extra-extra-large` (reset with `large`). The layout must survive it,
- touch targets and labels: every control has a role and a label.

If the `design` plugin is installed, hand the screenshots and DESIGN.md to its `design-critic` agent. Fix every "must fix" finding and capture again.

## 4. Report

Say which platforms and modes you checked, list the screenshots, and name what you could not check (for example: no Android emulator available).
