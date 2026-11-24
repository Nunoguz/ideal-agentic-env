---
name: scaffold
description: Create a new web app or package - Next.js (App Router), Vite + React, Vue 3 + Vite or Nuxt - with strict TypeScript, ESLint with accessibility rules, Vitest and Testing Library, Playwright, security headers and validated environment variables. Use only when the user runs /stack-web:scaffold or explicitly asks to create a new frontend app.
disable-model-invocation: true
argument-hint: "<directory> [--framework next|vite|vue|nuxt] [--name <package-name>]"
---

# Scaffold a web app

## 1. Agree on the shape

Confirm with the user:
- the directory and package name (inside a workspace, add it to the root `workspaces`),
- the framework: Next.js App Router by default; Vite + React, Vue 3 + Vite (a SPA in front of a separate API) or Nuxt (server rendering and server routes) on request,
- whether a design direction already exists (`DESIGN.md`). If not, run `/design:design-direction` before building screens.

## 2. Generate with the official tool, pinned

1. Find a version past the cooldown: `npm view create-next-app version time --json`. Use one published at least 14 days ago.
2. Run `npx create-next-app@<version> <dir> --ts --app --eslint --src-dir --no-tailwind --import-alias "@/*" --use-npm`, adjusting the flags to the agreed shape. Ask before running it: it downloads packages.
3. For Vite + React, use `npm create vite@<version> <dir> -- --template react-ts` instead.
4. For Vue, use `npm create vue@<version> <dir> -- --typescript --router --pinia --vitest --playwright --eslint`.
5. For Nuxt, use `npm create nuxt@<version> <dir> -- --packageManager npm --gitInit false`.
6. Pin `typescript` to 6.0.x in the generated `package.json`: TypeScript 7 has no JS API, so `vue-tsc`, `typescript-eslint` and the language server do not run on it.

## 3. Harden the generated app

- **TypeScript:** `tsconfig`: `strict: true`, plus `noUncheckedIndexedAccess`. Vue and Nuxt type-check with `vue-tsc --noEmit` / `nuxi typecheck`; add `@vue/typescript-plugin` (same version as `vue-tsc`) as a devDependency so the language server understands `.vue` files.
- **ESLint:** React: `eslint-plugin-jsx-a11y`'s recommended rules. Vue: `eslint-plugin-vue` (recommended) and `eslint-plugin-vuejs-accessibility`.
- **Environment:** add `src/env.ts`. It parses the environment with zod at startup. Only public values go to the client: `NEXT_PUBLIC_*`, `VITE_*`, or Nuxt's `runtimeConfig.public`.
- **Security headers** in `next.config` `headers()`, Nuxt `routeRules`, or the web server in front of a Vite SPA (devops-selfhosted's nginx config):
  - a Content-Security-Policy
  - `X-Content-Type-Options: nosniff`
  - `Referrer-Policy: strict-origin-when-cross-origin`
  - `frame-ancestors 'none'`
- **Tests:**
  - Vitest with Testing Library and jsdom for components (`@testing-library/vue` for Vue, `@nuxt/test-utils` for Nuxt).
  - Playwright for end-to-end tests, with `@axe-core/playwright` for the accessibility check (see `/design:ui-verify`).
- **Scripts:** `typecheck`, `lint`, `test`, `test:e2e` and `build`.
- **Cleanup:** remove the generated sample content and any template branding.

## 4. Prove it

1. `npm run typecheck`, `npm run lint`, `npm test` and `npm run build` pass.
2. Re-run `/stack-web:setup` so the new package's rules, verify steps and bundle budget are registered.
3. Run `node scripts/verify.mjs --full`.
