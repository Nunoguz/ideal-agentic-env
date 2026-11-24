---
name: scaffold
description: Create a new Node/TypeScript backend service or package (Fastify by default, NestJS on request) with strict TypeScript, validated config, schema-validated routes, health endpoints, structured logging, graceful shutdown and tests. Use only when the user runs /stack-node:scaffold or explicitly asks to create a new backend service, API app or Node package.
disable-model-invocation: true
argument-hint: "<directory> [--framework fastify|nest] [--name <package-name>]"
---

# Scaffold a Node backend service

The layout and code patterns are in `references/fastify-service.md`. Read it before writing files. For NestJS, use the Nest CLI's layout and apply the same rules (`.claude/rules/stack-node/nest.md`).

## 1. Agree on the shape

Confirm with the user:
- the target directory and package name (inside a workspace, add it to the root `workspaces`),
- the framework (Fastify unless they ask for NestJS),
- whether it needs a database (then `/data-sql:setup` follows) and which port it listens on.

## 2. Dependencies

Pick versions deliberately:
- `npm view <pkg> version time --json` shows the newest version and its publish date. Use a version published at least 14 days ago (the cooldown the project's Dependabot also uses).
- Pin exact versions in `package.json` for anything security-relevant. The lockfile pins the rest.
- Runtime: `fastify`, `zod`, `fastify-type-provider-zod`, `@fastify/helmet`, `@fastify/rate-limit`. Dev: `typescript`, `@types/node`, `tsx`, and the project's formatter and linter.
- Ask before running `npm install`.

## 3. Files

Create the files from the reference: `src/config.ts`, `src/app.ts` (a `buildApp()` factory), `src/server.ts` (listen and shutdown), one feature module, and tests next to the code. Add the `typecheck`, `lint`, `test` and `build` scripts.

## 4. Prove it

1. `npm run typecheck` and `npm test` pass.
2. Start the server and call `GET /health/ready`; show the response.
3. Re-run `/stack-node:setup` if this is a new package, so its rules and verify steps cover it.

Never put secrets in `.env.example`; list variable names with placeholder values only.
