# Fastify service reference layout

```
<service>/
├── package.json          # scripts: dev, build, start, typecheck, lint, test
├── tsconfig.json         # strict, module/moduleResolution NodeNext, outDir dist
├── .env.example          # variable names with placeholders only
└── src/
    ├── config.ts         # parse process.env once; fail fast
    ├── app.ts            # buildApp(config, deps): no listen, so tests can inject
    ├── server.ts         # composition root: config, deps, listen, shutdown
    ├── errors.ts         # domain errors and the problem+json mapping
    └── <feature>/
        ├── routes.ts     # schemas + thin handlers
        ├── service.ts    # business logic, dependencies passed in
        ├── repository.ts # data access only (see data-sql rules)
        └── routes.test.ts
```

Check the provider's README for the zod major version it supports before you pick versions.

## config.ts

```ts
import { z } from "zod";

const Env = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
  DATABASE_URL: z.string().min(1),
  CORS_ORIGINS: z.string().default("").transform((s) => s.split(",").map((o) => o.trim()).filter(Boolean)),
});
export type Config = z.infer<typeof Env>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = Env.safeParse(env);
  // Report names only: values may be secrets.
  if (!parsed.success) throw new Error(`invalid configuration: ${parsed.error.issues.map((i) => i.path.join(".")).join(", ")}`);
  return parsed.data;
}
```

## errors.ts

```ts
export class NotFoundError extends Error {}
export class ConflictError extends Error {}
export class ForbiddenError extends Error {}

export function problem(status: number, title: string, detail?: string) {
  return { type: "about:blank", status, title, ...(detail ? { detail } : {}) };
}
```

## app.ts

```ts
import { randomUUID } from "node:crypto";
import Fastify from "fastify";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import { serializerCompiler, validatorCompiler, type ZodTypeProvider } from "fastify-type-provider-zod";
import type { Config } from "./config.js";
import { ConflictError, ForbiddenError, NotFoundError, problem } from "./errors.js";

export interface Deps {
  ping(): Promise<void>; // readiness: one cheap query against each dependency
}

export async function buildApp(config: Config, deps: Deps) {
  const app = Fastify({
    logger: { level: config.LOG_LEVEL, redact: ["req.headers.authorization", "req.headers.cookie"] },
    genReqId: () => randomUUID(),
    bodyLimit: 1_048_576,
    requestTimeout: 10_000,
  }).withTypeProvider<ZodTypeProvider>();
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  await app.register(helmet);
  await app.register(rateLimit, { max: 100, timeWindow: "1 minute" });

  app.setErrorHandler((err, req, reply) => {
    if (err.validation) return reply.code(400).type("application/problem+json").send(problem(400, "Invalid request", err.message));
    if (err instanceof NotFoundError) return reply.code(404).type("application/problem+json").send(problem(404, "Not found"));
    if (err instanceof ConflictError) return reply.code(409).type("application/problem+json").send(problem(409, "Conflict"));
    if (err instanceof ForbiddenError) return reply.code(403).type("application/problem+json").send(problem(403, "Forbidden"));
    req.log.error({ err }, "unhandled error");
    return reply.code(500).type("application/problem+json").send(problem(500, "Internal error"));
  });

  app.get("/health/live", async () => ({ status: "ok" }));
  app.get("/health/ready", async (_req, reply) => {
    try {
      await deps.ping();
      return { status: "ok" };
    } catch {
      return reply.code(503).send({ status: "unavailable" });
    }
  });

  // await app.register(itemRoutes, { prefix: "/items", service: deps.items });
  return app;
}
```

## server.ts

```ts
import { buildApp } from "./app.js";
import { loadConfig } from "./config.js";

const config = loadConfig();
const app = await buildApp(config, { ping: async () => {} /* replace with the real checks */ });
await app.listen({ host: "0.0.0.0", port: config.PORT });

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, async () => {
    await app.close(); // runs onClose hooks: close pools there
    process.exit(0);
  });
}
process.on("unhandledRejection", (err) => {
  app.log.fatal({ err }, "unhandled rejection");
  process.exit(1);
});
```

## A feature route

```ts
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";

const Item = z.object({ id: z.string().uuid(), name: z.string() });
const Page = z.object({ items: z.array(Item), nextCursor: z.string().nullable() });

export const itemRoutes: FastifyPluginAsyncZod<{ service: ItemService }> = async (app, { service }) => {
  app.get("/", {
    schema: {
      querystring: z.object({ cursor: z.string().optional(), limit: z.coerce.number().int().min(1).max(100).default(20) }),
      response: { 200: Page },
    },
  }, async (req) => service.list(req.query));

  app.get("/:id", { schema: { params: z.object({ id: z.string().uuid() }), response: { 200: Item } } }, async (req) => service.get(req.params.id));
};
```

## A route test

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildApp } from "../app.js";
import { loadConfig } from "../config.js";

test("GET /health/live answers without a dependency", async () => {
  const app = await buildApp(loadConfig({ DATABASE_URL: "postgres://unused" }), { ping: async () => {} });
  const res = await app.inject({ method: "GET", url: "/health/live" });
  assert.equal(res.statusCode, 200);
  await app.close();
});
```
