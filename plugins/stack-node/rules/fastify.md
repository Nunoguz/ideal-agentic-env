# Fastify rules (stack-node)

- Every route declares schemas for `body`, `params`, `querystring` and `response` (zod through `fastify-type-provider-zod`, or JSON Schema). Response schemas also stop accidental field leaks.
- One encapsulated plugin per feature module. Use `fastify-plugin` only for decorators that must be shared. Keep handlers thin; business logic lives in services that receive their dependencies explicitly.
- Authentication in an `onRequest` hook, deny by default, with an explicit allowlist of public routes. Authorization checks ownership of the resource, not just "logged in".
- One `setErrorHandler` maps domain errors to status codes and an `application/problem+json` body. Never return stack traces or internal messages.
- Set `bodyLimit`, `requestTimeout` and `connectionTimeout`. Public routes get `@fastify/rate-limit`; register `@fastify/helmet` and a strict CORS allowlist.
- Logger: Fastify's pino with `redact` for `req.headers.authorization`, `req.headers.cookie` and personal-data fields.
- Health: `/health/live` (process up) and `/health/ready` (dependencies reachable), unauthenticated and without details.
- Graceful shutdown: `await app.close()` on SIGTERM; close database pools in an `onClose` hook.
- Route tests use `app.inject()`; no listening port is needed.
