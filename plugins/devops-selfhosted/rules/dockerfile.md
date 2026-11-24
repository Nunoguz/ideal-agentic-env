# Dockerfile rules (devops-selfhosted)

- Multi-stage: build in an SDK image, run in a minimal runtime image (distroless, .NET `-chiseled`, `nginx-unprivileged` for static sites). The runtime stage has no compiler, package manager or shell unless it needs one.
- Pin every base image by digest: `FROM node:22.19-alpine@sha256:…`. Dependabot (`docker` ecosystem) proposes digest updates with the 14-day cooldown. A same-line patch image that fixes a finding the container gate blocks may be taken at once; name the finding in the pull request.
- Run as a non-root user (`USER 10001`, or the image's `app` / `nonroot` user). The container scan fails a root runtime image (Trivy DS-0002).
- A `.dockerignore` excludes `.git`, `node_modules`, `bin`, `obj`, build output, `.env*` and test data, so neither secrets nor junk reach the build context.
- No secrets in the image: no `ENV` or `ARG` with keys, no copied `.env`. Build-time secrets use `RUN --mount=type=secret`. The container scan fails on secrets found in image layers.
- Restore dependencies in their own layer before copying the source (`COPY package*.json ./` then `npm ci`; `COPY *.csproj` then `dotnet restore`), so source changes do not invalidate the cache.
- Install exactly what the lockfile says (`npm ci --omit=dev`, `dotnet restore --locked-mode`).
- Fix base image vulnerabilities by updating the base image. Only when the newest base image still ships packages with fixed HIGH/CRITICAL CVEs (upstream has not rebuilt yet), upgrade them in the runtime stage (`apk upgrade --no-cache`, `apt-get upgrade -y`) with a comment saying why, and remove the step once the base catches up.
- One process per container, started in exec form (`CMD ["node", "server.js"]`) so it receives SIGTERM. The app shuts down gracefully within the orchestrator's grace period.
- Liveness and readiness are probes of the orchestrator (`/health/live`, `/health/ready`). Add a `HEALTHCHECK` only where the runtime image has a way to run it.
- Labels: `org.opencontainers.image.source` and `org.opencontainers.image.revision` (the commit) on every image.
