---
name: ui-verify
description: Verify UI visually and for accessibility - Playwright screenshots at mobile (375) and desktop (1280) in light and dark mode, an axe WCAG 2.2 AA scan with zero violations, horizontal overflow and keyboard checks, then a design-critic review of the screenshots. Use after building or changing UI, before saying UI work is done, or when the user asks to check, screenshot or audit a page.
---

# Verify UI

The UI is not done until it has been seen. Tests that pass while the page looks broken still count as broken.

## 1. Set up once per app

Add `@playwright/test` and `@axe-core/playwright` as devDependencies (ask first; pick versions past the 14-day cooldown). Copy `references/ui-verify.spec.ts` into the app's e2e folder. Configure `webServer` in `playwright.config.ts` so the spec starts the app itself.

## 2. Run

1. List the routes to check in `UI_VERIFY_ROUTES`, for example `UI_VERIFY_ROUTES=/,/loans,/loans/new`.
2. Include each data state you built. Use the app's test seed or route mocking, for example `/loans?fixture=empty` and `?fixture=error`, or a Playwright `route` handler in a dedicated test.
3. Run `npx playwright test ui-verify`.

The spec:
- takes a full-page screenshot per route × {mobile 375, desktop 1280} × {light, dark} into `artifacts/ui/`,
- runs axe with WCAG 2.0/2.1/2.2 A and AA tags and fails on any violation,
- fails on horizontal overflow,
- checks that Tab moves focus to a visible element.

## 3. Look at the screenshots

Read each PNG in `artifacts/ui/` (the Read tool shows images). Then delegate to the `design-critic` agent with the screenshot paths and `DESIGN.md`. Fix every "must fix" finding, and run the spec again.

## 4. Report

Report:
- the routes and states checked,
- the axe result,
- the critic's findings and what you changed.

Name what was not verified, for example a state you could not reach or a real device. Keep `artifacts/` out of git, or upload it as a CI artifact.
