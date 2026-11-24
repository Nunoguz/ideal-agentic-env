# Node.js / TypeScript backend rules (stack-node)

## TypeScript
- `strict: true`. Never weaken `tsconfig` or add `skipLibCheck`-style escapes to make an error go away.
- No `any`. Data that crosses a boundary is `unknown` until a schema parses it. Use `as` only for a narrowing that a check just proved; `@ts-expect-error` needs a reason in the comment.
- ES modules; `import type` for type-only imports.

## Trust boundaries
- Parse every external input with a schema (zod by default) and use the parsed value, never the raw one: request body, params, query, the headers you read, queue messages, third-party responses, files.
- `JSON.parse` of external data is always followed by a schema parse.
- Read and validate `process.env` once at startup into a typed config object and fail fast. No `process.env.X` scattered through the code.

## Errors and async
- No floating promises: await, return or explicitly handle every promise.
- Never swallow errors (`catch {}`). Map known failures to domain errors; let unknown ones reach the framework's error handler.
- Handle `unhandledRejection` and `uncaughtException` by logging and exiting; the process manager restarts.

## Data and IO
- SQL only through parameterized queries, a query builder or an ORM. Never interpolate values into SQL strings or template literals.
- Every outbound call (HTTP, database, queue) has a timeout (`AbortSignal.timeout()`) and a bounded retry with backoff.
- Paginate list endpoints and cap the page size. Stream large payloads instead of buffering them.

## Logging and secrets
- Structured logs with a request id. Never log secrets, tokens, passwords or personal data; configure redaction for auth headers, cookies and known personal fields.
- Secrets come from the environment or a secret store, never from the repository or a default value in code.

## Guardrails (bugs that fail silently)
- `array.sort()` without a comparator sorts numbers as strings.
- `await` inside `forEach` does not wait. Use `for...of`, or `Promise.all` with a concurrency limit.
- `Number("")` is `0` and `parseInt("12abc")` is `12`. Validate numbers with the schema.
- `new Date("2024-01-02")` is UTC midnight, `new Date(2024, 0, 2)` is local midnight. Store and compare instants in UTC.
- Money in floating point drifts. Store minor units as integers or use a decimal type.
