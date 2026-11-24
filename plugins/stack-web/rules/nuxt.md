# Nuxt rules (stack-web)

## Rendering boundaries
- `server/` runs only on the server. Components, composables and plugins run on both, unless named `*.client.*` / `*.server.*`. Browser APIs (`window`, `localStorage`) go in `onMounted`, `<ClientOnly>` or a `.client` plugin.
- Fetch page data with `useFetch` or `useAsyncData` (with a unique key), so it is serialized into the payload once. A bare `$fetch` in `setup` runs on the server and again on the client.
- Share state with `useState`. A module-level `ref` lives in the server process and leaks data between requests and users.

## Server routes (Nitro, `server/api`)
- Validate every input: `readValidatedBody`, `getValidatedQuery` and `getValidatedRouterParams` with a zod schema.
- Fail with `createError({ statusCode, statusMessage })`; never return a stack trace or a raw database error.
- Authorize in the handler or a server middleware on every request. Route middleware in `middleware/` is navigation UX, not access control.

## Config and secrets
- Secrets live in `runtimeConfig` (server only) and come from `NUXT_*` environment variables. Everything under `runtimeConfig.public` is shipped to the browser.
- Set the security headers (Content-Security-Policy, `X-Content-Type-Options`, `Referrer-Policy`, `frame-ancestors`) in `routeRules` or a Nitro plugin.
- Cache rules in `routeRules` (`swr`, `isr`, `prerender`) never apply to pages with personal data.
- Type-check with `nuxi typecheck` (it needs `vue-tsc`). The client bundle lands in `.output/public/_nuxt`, which the bundle budget reads.
