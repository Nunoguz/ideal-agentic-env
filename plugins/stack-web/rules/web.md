# Web frontend rules (stack-web)

## TypeScript and data
- `strict: true`; no `any`. Data from `fetch`, `localStorage`, URL params or `postMessage` is `unknown` until a schema (zod) parses it.
- Share request and response schemas with the backend through a contracts package instead of redefining types by hand.
- Every request handles loading, error and empty results. A failed request shows a recoverable message, never a blank screen or a raw error.

## Security
- Nothing secret reaches the browser bundle. Only variables meant to be public are exposed (`NEXT_PUBLIC_*`, `VITE_*`), and they hold no keys, tokens or internal URLs.
- Never render untrusted HTML. `dangerouslySetInnerHTML` / `v-html` only with sanitized input (DOMPurify) and a comment naming the source.
- Tokens live in `httpOnly`, `Secure`, `SameSite` cookies set by the server, not in `localStorage`.
- Links that open a new tab use `rel="noopener noreferrer"`. URLs built from user input are validated (`https:` only, no `javascript:`).
- Personal data is not sent to analytics or error tracking, and not logged to the console.

## Accessibility (WCAG 2.2 AA)
- Native elements first: `<button>` for actions, `<a href>` for navigation, `<label>` for every input. No click handlers on `div`s.
- Every interactive element is reachable and operable by keyboard with a visible focus indicator. Focus moves sensibly when dialogs open and close.
- Images have meaningful `alt` (or `alt=""` when decorative). Icon-only buttons have an accessible name.
- Form errors are announced (`aria-describedby`, `aria-invalid`) and tell the user how to fix the input.
- Respect `prefers-reduced-motion`.

## Performance
- The bundle budget in `.claude/ideal-agentic-env.json` (`web.budget`) is checked by `verify --full`. Raising it is a reviewed decision.
- Import heavy, rarely used code lazily. Do not import a whole library for one function.
- Images have explicit dimensions (no layout shift) and modern formats; below-the-fold images load lazily.

## Guardrails (bugs that fail silently)
- `new Date()` and `Math.random()` during render differ between server and client, causing a hydration mismatch.
- `toLocaleString()` without an explicit locale and time zone renders differently on the server and in the browser.
- `useEffect` with missing dependencies reads stale values; with an object or array literal as a dependency it runs on every render.
- `key={index}` on a reorderable list keeps the wrong state on the wrong row.
