---
name: deploy
description: Prepare and run a deployment to a self-hosted target (a VPS with Docker Compose, Coolify, or Kubernetes with Helm or Kustomize) with a written plan - prerequisites, migrations first, zero-downtime rollout, smoke test and rollback - where the user approves every step that touches the target. Use only when the user runs /devops-selfhosted:deploy or explicitly asks to deploy or release to an environment.
disable-model-invocation: true
argument-hint: "<environment> [--version <git sha or tag>]"
---

# Deploy

Deploying changes a running system. Every command that touches the target needs the user's explicit yes; core's shell guard asks for `kubectl apply`, `helm upgrade`, `ssh` and the others. Never deploy from an unmerged branch or a red default branch.

## 1. Preflight

- The version is a commit on the default branch with green `ci`, `security`, `container` and `change-audit` checks: `gh run list --branch <default> --commit <sha>`.
- The image for that commit exists in the registry and is referenced by digest.
- Migrations in this release are backward compatible with the running version (expand/contract). If not, stop and plan two releases.
- A recent backup exists and a restore was tested (`backup-restore`).
- Write the plan in the PR or the change ticket: version, steps, smoke test, rollback, who approves.

## 2. Run, step by step

1. **Migrations first:** run the migration job or bundle against the target. Stop if it fails.
2. **Roll out:**
   - Compose on a VPS: pull the new image digest, `docker compose up -d --no-deps <service>`, wait for the healthcheck.
   - Coolify: trigger the deployment for the digest and watch its log.
   - Kubernetes: `helm upgrade --install <release> <chart> --set image.digest=<digest> --atomic --wait --timeout 10m` (or `kubectl apply -k` and `kubectl rollout status`).
3. **Smoke test:** the readiness endpoint, one read and one write path, and the error rate in the logs or metrics for a few minutes.

## 3. Roll back when a check fails

- Compose: start the previous image digest. Kubernetes: `helm rollback <release> <revision>` or `kubectl rollout undo`.
- A migration is never rolled back by dropping data. Fix forward with a new migration.

## 4. Record

Note the version, time, approver, the smoke test result and anything unusual in the change record. That is change-management evidence for SOC 2 and ISO 27001.
