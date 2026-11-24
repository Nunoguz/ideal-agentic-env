---
name: test
description: Write and run tests for web frontend code - component tests with Testing Library (by role and label), hook and utility unit tests, and Playwright end-to-end tests for user flows with accessibility checks. Use when adding or fixing UI behaviour, when asked to test a component, page, form or flow, or when a frontend test fails.
---

# Test web frontend code

## Choose the level

- **Unit:** pure utilities, formatters, reducers and schema logic.
- **Component** (Vitest or Jest with Testing Library): render the component and interact as a user does. Query with `getByRole` and `getByLabelText`, then assert what is visible. Do not query by class names or test implementation details.
  - Vue: `@testing-library/vue` (or `@vue/test-utils` `mount`). Give a fresh Pinia to each test (`createTestingPinia` or `setActivePinia(createPinia())`), so state does not leak between tests.
  - Nuxt: `@nuxt/test-utils` with `mountSuspended` for components that use Nuxt composables, and `$fetch` from `@nuxt/test-utils/e2e` for server routes.
- **End-to-end** (Playwright): critical user flows against the running app, with a real backend or a seeded test backend. Include an axe accessibility check on each main page (`/design:ui-verify` shows the pattern).

Use the runners the project already has; do not add a second one.

## What to cover

For each screen or component that loads data, cover all four states:
- loading
- error (a recoverable message)
- empty
- populated

For forms, cover:
- a validation error shown next to the field,
- a server error,
- successful submission,
- keyboard-only completion.

For a bug, write the failing test first.

## Keep tests honest

- Mock the network at the boundary (MSW or Playwright's `route`), not inside components.
- Fixtures use synthetic data only, never real personal data.
- Avoid snapshot tests of large trees. They pass blindly when updated. Assert specific, visible outcomes.
- Make waits deterministic: use `findBy*` / `expect.poll` / Playwright's auto-waiting, never `sleep`.

## Run

1. Run the narrowest test first.
2. Then run `node scripts/verify.mjs --fast`.
3. For UI changes, run `--full` (build, bundle budget, e2e).

A red test is information. Never skip or weaken it to get green.
