# DESIGN — <product>

> The design language of this project. Every UI change follows it. Change it deliberately, in a PR.

## Direction

- **Product and audience:** <who, doing what, where, how often>
- **Feel:** <adjectives>. **Not:** <opposites>.
- **References:** <product> for <quality>; <product> for <quality>.
- **Signature:** <the one or two details that make this UI recognizable>

## Principles

1. <e.g. Content first: chrome recedes, data is the hero.>
2. <e.g. Calm density: compact tables, generous section spacing.>
3. <e.g. One accent: color means action or status, never decoration.>

## Avoid

- <project-specific clichés, from references/cliches.md plus our own>

## Tokens

Defined in `<path to tokens.css>`. Components use only these.

| Group | Tokens | Notes |
| --- | --- | --- |
| Color | `--color-bg`, `--color-surface`, `--color-surface-raised`, `--color-border`, `--color-text`, `--color-text-muted`, `--color-accent`, `--color-accent-contrast`, `--color-focus`, `--color-success`, `--color-warning`, `--color-danger` | Light and dark values; contrast pairs listed below |
| Type | `--font-sans`, `--font-mono`, `--text-xs` … `--text-2xl`, `--leading-tight`, `--leading-normal`, `--weight-regular`, `--weight-medium`, `--weight-bold` | Scale ratio <1.2> |
| Space | `--space-1` … `--space-8` | 4 px base |
| Shape | `--radius-sm`, `--radius-md`, `--radius-lg`, `--border-width` | |
| Elevation | `--shadow-sm`, `--shadow-md` | Used for overlays only |
| Motion | `--duration-fast`, `--duration-normal`, `--ease-standard` | Disabled under reduced motion |
| Layout | `--content-max`, `--touch-target` | |

### Contrast pairs (WCAG 2.2 AA)

| Text | Background | Light | Dark |
| --- | --- | --- | --- |
| `--color-text` | `--color-bg` | <ratio> | <ratio> |
| `--color-text-muted` | `--color-surface` | <ratio> | <ratio> |
| `--color-accent-contrast` | `--color-accent` | <ratio> | <ratio> |

## Components

For each core component (button, input, table/list, card, dialog, toast, empty state):
- anatomy, variants, sizes
- states: default, hover, focus-visible, active, disabled, loading, error
- copy rules

## States every screen designs

Loading · Empty (meaning + next action) · Error (cause + retry) · Partial and long content · Populated.

## Accessibility

WCAG 2.2 AA. Keyboard-complete flows, visible focus (`--color-focus`), 24 px minimum targets, reduced motion honored, language set on `<html>`.
