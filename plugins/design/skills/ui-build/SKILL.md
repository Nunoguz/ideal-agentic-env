---
name: ui-build
description: Build or change a UI screen or component bound to the project's DESIGN.md and design tokens - semantic HTML, all four data states, keyboard and focus, responsive layout, dark mode, no literal colors or sizes. Use for any UI work - a new page, screen, component, form, layout or styling change.
---

# Build UI

## 1. Ground it

- Read `DESIGN.md` and the token file it names. If `DESIGN.md` is missing, stop and suggest `/design:design-direction`. Building without it produces generic UI.
- Look at two or three existing components first and match their structure and naming.

## 2. Build

- **Structure:** semantic HTML first (`main`, `nav`, `header`, `button`, `a`, `label`, `table`), then style.
- **Styling:** tokens only, as `var(--...)`. If a value is missing from the tokens, propose a new token in `DESIGN.md` and the token file instead of hard-coding it. `token-lint` fails on literals.
- **States:** design and implement all of them: loading, empty (what it means plus the next action), error (the cause plus a retry), long or partial content, populated. Pending actions show progress and block double submission.
- **Keyboard:** every action is reachable by Tab and has a visible focus style using `--color-focus`. Dialogs move focus in and restore it on close; Escape closes them.
- **Responsive:** work from 320 px. Check 375 px (mobile) and 1280 px (desktop). No horizontal scroll. Touch targets are at least `--touch-target`.
- **Dark mode:** use the semantic tokens and check both schemes.
- **Copy:** specific labels and helpful errors. Turkish or other non-English text must fit, so test with long strings.

## 3. Verify

Run the `ui-verify` skill: screenshots at mobile and desktop in light and dark, plus the axe scan. Then ask the `design-critic` agent to review the screenshots against `DESIGN.md`. Fix what it finds before saying the UI is done.
