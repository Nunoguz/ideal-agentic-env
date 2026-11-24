---
name: dockerize
description: Containerize a service - a multi-stage Dockerfile pinned by digest with a non-root runtime (distroless, .NET chiseled, nginx-unprivileged for static web apps), a .dockerignore, exec-form start and graceful shutdown, plus a Compose file for the local stack. Use only when the user runs /devops-selfhosted:dockerize or explicitly asks to containerize a service or add a Dockerfile or Compose file.
disable-model-invocation: true
argument-hint: "<service directory> [--compose]"
---

# Containerize a service

## 1. Agree on the shape

Confirm with the user: which services get an image, the build context (the repository root for a monorepo with shared packages), the ports, and whether a `compose.yaml` should run the local stack (app, database, other services).

## 2. Pick the images

Base images are pinned by digest. Find the digest with `docker buildx imagetools inspect <image>:<tag>` and choose a tag published at least 14 days ago.

| Service | Build stage | Runtime stage |
| --- | --- | --- |
| Node (Fastify, NestJS, Nuxt server) | `node:<lts>-alpine` (`npm ci`, build) | `gcr.io/distroless/nodejs<lts>-debian12:nonroot`, or `node:<lts>-alpine` with `USER node` |
| .NET (ASP.NET Core) | `mcr.microsoft.com/dotnet/sdk:10.0` (`dotnet publish -c Release`) | `mcr.microsoft.com/dotnet/aspnet:10.0-noble-chiseled` (non-root by default) |
| Static web (Vue + Vite, a React SPA) | `node:<lts>-alpine` (`npm ci && npm run build`) | `nginxinc/nginx-unprivileged:<stable>-alpine` with the built files and a config with security headers and SPA fallback |

## 3. Write the files

- **Dockerfile:** follow `.claude/rules/devops-selfhosted/dockerfile.md`. Dependencies in their own layer, then the source; `npm ci --omit=dev` / `dotnet restore --locked-mode`; `USER` non-root; exec-form `CMD`/`ENTRYPOINT`; OCI labels for source and revision.
- **.NET build stage:** copy `.editorconfig` together with `Directory.Build.props`. It sets analyzer severities and marks EF Core migrations as generated code; without it the image build fails on rules that pass locally.
- **nginx (static web):** set the security headers in the `server` block. An `add_header` inside a `location` replaces every header from the server block for that location, so cached assets would lose the CSP (Semgrep's `header-redefinition` rule catches it). Use `expires` for caching instead.
- **.dockerignore:** `.git`, `node_modules`, `bin`, `obj`, build output, `.env*`, test data, `artifacts`.
- **compose.yaml** (with `--compose`): follow `compose.md`. Ports bound to `127.0.0.1` and not clashing with other projects on the machine, healthchecks, `depends_on` on healthy services, named volumes, secrets from a git-ignored `.env` with a committed `.env.example`.

## 4. Prove it

1. `docker build` each image. If the machine cannot build (no Docker, or no disk space), say so: the `container` workflow builds and scans it in CI.
2. Run `/devops-selfhosted:setup` so the rules, the Dependabot entry and the container workflow are installed.
3. With Trivy installed locally, `node .github/scripts/container-scan.mjs` runs the same gate as CI.
