---
name: perf-budget
description: Keep a web frontend fast - read the bundle budget result, find what grew (new dependency, eager import, client component boundary), split or lazy-load it, and check Core Web Vitals (LCP, INP, CLS) on key pages. Use when bundle-budget fails, when a page feels slow, when adding a heavy dependency, or when the user asks about performance, bundle size or Web Vitals.
---

# Performance budget

## 1. Bundle budget

`verify --full` runs `.github/scripts/bundle-budget.mjs` after the build. It reports the gzipped JavaScript per build output: the total and the largest chunk, against `web.budget` in `.claude/ideal-agentic-env.json`.

When it fails:
1. **Find what grew.**
   - Build with the framework's analyzer: `@next/bundle-analyzer` for Next.js, `rollup-plugin-visualizer` for Vite.
   - Or compare chunk sizes against the base branch.
2. **Typical causes and fixes:**
   - A whole library imported for one function: import the specific module, or use a lighter alternative.
   - A large `"use client"` boundary pulling server-only or heavy code into the client: move the boundary down to the leaf.
   - A heavy widget (editor, chart, map) on first load: load it with `next/dynamic` / `React.lazy` when it is needed.
   - Duplicated dependency versions: deduplicate in the lockfile.
3. **Raising the budget is a decision, not a fix.** Propose it to the user with the numbers and the reason. It is a protected file.

## 2. Core Web Vitals

The automation does not measure these yet, so check key pages by hand after significant UI changes:
- Run a production build locally (`npm run build && npm start`).
- Use Chrome DevTools' Performance and Lighthouse panels with mobile throttling, or the `web-vitals` library in a test page.
- Targets at the 75th percentile:
  - **LCP** under 2.5 s: optimize the hero image or text, preload the font, avoid client-side-only rendering.
  - **INP** under 200 ms: cut long tasks in event handlers, defer non-urgent work.
  - **CLS** under 0.1: give images and media explicit sizes, reserve space for late content.

## 3. Report

Report the numbers before and after, what you changed, and what you could not measure, for example without production-like data or a real device.
