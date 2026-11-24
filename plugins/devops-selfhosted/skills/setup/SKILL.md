---
name: setup
description: Wire devops-selfhosted into the current project - path-scoped Dockerfile, Compose and Kubernetes/Helm rules, guarded deploy and secret commands for core's shell guard, the docker Dependabot entry for base image digests, and the container workflow (Trivy image and misconfiguration scan). Add-only for project files. Use only when the user runs /devops-selfhosted:setup or explicitly asks to set up container or deployment tooling.
disable-model-invocation: true
argument-hint: "[--profiles docker,compose,kubernetes] [--refresh] [--adopt a,b]"
---

# Set up self-hosted DevOps

`scripts/setup.mjs` in this skill's directory applies the plugin's `stack.json` contract deterministically. It never overwrites a file you own.

Run `/core:init` and `/governance:setup` first. A project without a Dockerfile yet: run `/devops-selfhosted:dockerize` first, then this setup.

## 1. Dry run

Run `node "<this skill's directory>/scripts/setup.mjs" --target . --dry-run`. Pass on `--profiles` or `--refresh` if the user gave them. Show the user the detected profiles, every `create`, `merge`, `update` and `skip` line, and every `note`. Ask them to confirm.

## 2. Apply

Run the same command without `--dry-run`. It installs:
- rules under `.claude/rules/devops-selfhosted/` for Dockerfiles, Compose files and Kubernetes manifests or Helm charts,
- `guardedCommands` in `.claude/ideal-agentic-env.json`. core's shell guard then asks before `docker push`, `sops --decrypt`, reading Kubernetes secrets, `kubectl apply`, `helm upgrade`, `ssh`/`scp`/`rsync` to a server, `pg_restore --clean` and deleting backup snapshots,
- the `docker` Dependabot entry, so pinned base image digests get updates with the 14-day cooldown,
- `.github/workflows/container.yml` and `.github/scripts/container-scan.mjs`: every image is built and scanned with Trivy, and the deployment files are scanned for misconfigurations.

## 3. Explain the container gate

- **Fails:** HIGH/CRITICAL vulnerabilities that have a fix, secrets baked into an image, HIGH/CRITICAL misconfigurations (for example a root user).
- **Reported only:** vulnerabilities without a published fix (they turn red once a fix exists), lower severities, an end-of-life base OS. The weekly run keeps one `[vulnerability-report]` issue for them.
- **Images:** every Dockerfile, built from the repository root. If an image needs another build context, set `devops.images` in `.claude/ideal-agentic-env.json`.
- **Exceptions:** `.trivyignore` entries with a reason and `exp:YYYY-MM-DD`. They are the repository owner's decision; propose them, never add them yourself.

## Updating after a plugin upgrade

Run the dry run with `--refresh`. It rewrites this plugin's rule files and the unedited managed workflow and script (ADR-0008). For a `skip` that says a file was edited or has no marker, show the difference with `--print <path>` and adopt it only on the user's yes (`--adopt <path>`).
