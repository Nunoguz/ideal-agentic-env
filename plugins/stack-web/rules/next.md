# Next.js rules (stack-web)

## Server and client boundary
- Components are Server Components by default. Add `"use client"` only to the smallest leaf that needs state, effects or browser APIs; never to a page or layout just for convenience.
- Code that touches secrets, the database or internal services imports `server-only` so it can never be bundled for the client.
- Props passed from a Server Component to a Client Component are serializable and contain only what the client needs. Never pass a whole database row; select the fields.

## Server Actions and Route Handlers are public endpoints
- Each one validates its input with a schema, checks authentication **and** authorization for the specific resource, and returns typed errors. A Server Action is reachable by anyone who can post to the page.
- Mutations revalidate what they change (`revalidatePath` / `revalidateTag`) instead of disabling caching globally.
- Rate-limit public actions and handlers that send email, create accounts or cost money.

## Data and caching
- Fetch on the server, close to where data is used. Run independent fetches in parallel (`Promise.all`), not as a waterfall.
- Be explicit about caching for every fetch and route segment that depends on the user or changes often. Personalized data must never land in a shared cache.
- `loading.tsx`, `error.tsx` and `not-found.tsx` exist for routes that load data.

## Configuration
- Only `NEXT_PUBLIC_*` variables reach the browser; they hold no secrets. Validate server environment variables once at startup.
- Set security headers (CSP, `X-Content-Type-Options`, `Referrer-Policy`, `frame-ancestors`) in `next.config` or middleware.
- Use `next/image` and `next/font` for images and fonts; give images explicit sizes.
