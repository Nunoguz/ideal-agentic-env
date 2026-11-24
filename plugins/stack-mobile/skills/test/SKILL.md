---
name: test
description: Write and run React Native and Expo tests - component tests with jest-expo and Testing Library (by role and label), hook and utility unit tests, network mocked at the boundary, and on-device checks with device-verify. Use when adding or fixing mobile app behaviour, when asked to test a screen, component or flow, or when a mobile test fails.
---

# Test a React Native / Expo app

## Choose the level

- **Unit:** utilities, formatters, schema parsing and state logic.
- **Component** (`jest-expo` with `@testing-library/react-native`): render the screen and act as a user does. Query with `getByRole` and `getByLabelText`, then assert what is visible. Do not query by test ids when a role or label works.
- **On device:** the `device-verify` skill runs the app on the iOS simulator and the Android emulator, in light and dark mode. Use it for every new screen; Jest does not render native layout.

Use the runner the project already has; do not add a second one.

## What to cover

For every screen that loads data, all four states: loading, error (a recoverable message with retry), empty, populated. Add the offline case when the screen must work without a network.

For forms: a validation error next to the field, a server error, success, and completion with a screen reader (each input has a label).

For a bug, write the failing test first.

## Keep tests honest

- Mock the network at the boundary (a mocked `fetch` or MSW), not inside components.
- Mock native modules only through the Jest preset or `jest.mock` at the module boundary.
- Fixtures use synthetic data only, never real personal data.
- Use `findBy*` and `waitFor`, never fixed timeouts.

## Run

1. The narrowest test first: `npx jest <path>`.
2. Then `node scripts/verify.mjs --fast`, and `--full` before you call the work done.

A red test is information. Never skip or weaken it to get green.
