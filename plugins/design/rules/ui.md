# UI rules (design)

Read `DESIGN.md` before building or changing UI. It holds the design direction, the tokens and the clichés to avoid. If it does not exist, stop and suggest `/design:design-direction`.

- **Tokens only.** Colors, spacing, font sizes, radii, shadows and durations come from the token file (CSS custom properties such as `var(--color-surface)`, `var(--space-3)`). No literal hex/rgb/hsl colors or px/rem sizes in components. `token-lint` enforces this in verify and CI; a justified exception is `token-lint: allow <reason>` on that line.
- **Every data view has four states:** loading (skeleton or spinner with a label), empty (what it means plus the next action), error (what happened plus a retry), and populated. Partial data and long content (long names, many items) must not break the layout.
- **Keyboard and focus:** everything works with a keyboard alone, the focus indicator is visible and uses the focus token, the tab order follows the visual order, and dialogs trap and restore focus.
- **Contrast:** text against its background meets WCAG 2.2 AA (4.5:1 for body text, 3:1 for large text and UI components) in light and dark mode.
- **Responsive:** layouts work from 320 px wide up; no horizontal scroll at 375 px; touch targets are at least 24×24 px (44×44 preferred).
- **Motion:** use the motion tokens; honor `prefers-reduced-motion` by removing non-essential animation.
- **Dark mode** is designed, not inverted: use the semantic tokens that switch with the color scheme.
- **Copy:** labels say what happens ("Save loan", not "Submit"); errors say how to fix the problem; no lorem ipsum in shipped UI.
- **Microinteractions:** pending buttons show progress and cannot double-submit; destructive actions confirm or offer undo.
