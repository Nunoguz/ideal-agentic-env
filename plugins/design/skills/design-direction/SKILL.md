---
name: design-direction
description: Establish a project's design language before UI work - audience, feel, references and clichés to avoid, then DESIGN.md and a token file (color with light and dark themes, typography scale, spacing, radius, elevation, motion, density). Use only when the user runs /design:design-direction or explicitly asks to define the design direction, visual identity, design system or tokens.
disable-model-invocation: true
argument-hint: "[product or app name]"
---

# Design direction

The goal is a UI that looks designed for *this* product, not like a generic AI-made app. Every later UI task reads `DESIGN.md`, so it must be specific.

## 1. Interview (ask, do not assume)

Ask the user, in a few short rounds:
1. **Product and audience:** what it does, who uses it, in what context (desk, phone, on the move, under time pressure) and how often.
2. **Feel:** three to five adjectives, and their opposites to avoid (for example "calm, precise, warm", not "playful, flashy").
3. **References:** two or three products or sites whose qualities they admire, and what exactly they like about each.
4. **Constraints:** an existing brand (logo, colors, fonts), languages and scripts (Turkish characters, RTL), accessibility needs beyond AA, data density.

## 2. Propose before writing

Propose two distinct directions in a few lines each. For each, give:
- the palette idea,
- the type pairing,
- the density,
- one signature detail.

Let the user choose or mix. Name the clichés this project will avoid; start from `references/cliches.md` and add project-specific ones.

## 3. Write the files

- **`DESIGN.md`** at the repository root, from `references/DESIGN.template.md`:
  - direction, principles, do/don't with examples, the components' anatomy and states,
  - the accessibility requirements,
  - the token table.
- **The token file**, from `references/tokens.template.css`, next to the app's global styles (for example `src/styles/tokens.css`). Use CSS custom properties with semantic names (`--color-surface`, `--color-text-muted`, `--space-3`), and a dark theme under both `@media (prefers-color-scheme: dark)` and `[data-theme="dark"]`.
- **Contrast:** check every text/background pair in both themes. It must meet 4.5:1, or 3:1 for large text and UI components. Compute it from the hex values. Do not eyeball it.

## 4. Hand over

- If the token file's name is not covered by `design.tokenFiles` in `.claude/ideal-agentic-env.json`, add it (ask first: it is a protected file).
- Suggest building one representative screen with the `ui-build` skill and verifying it with `ui-verify` before building the rest.
