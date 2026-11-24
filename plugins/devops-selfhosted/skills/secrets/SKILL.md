---
name: secrets
description: Handle deployment secrets safely - SOPS with age for encrypted files in git, Sealed Secrets or an external secret store on Kubernetes, rotation, and keeping secrets out of images, logs and the session. Use when adding or rotating a secret, configuring how an environment gets its credentials, or when a secret was exposed.
---

# Secrets

## Where secrets live

- **Local development:** `.env` files that are git-ignored, with a committed `.env.example`. .NET: user secrets.
- **CI:** GitHub Actions secrets, read only by the jobs that need them. Never print them.
- **Servers (Compose):** an `.env` file on the host with `0600` permissions, or Docker secrets. In git, only as SOPS-encrypted files.
- **Kubernetes:** Sealed Secrets, SOPS (with a GitOps tool) or an external secret store (External Secrets Operator). Never a plain `Secret` manifest in git.

## SOPS with age

- One age key per environment. The private key never enters the repository or the session. `.sops.yaml` lists which public key encrypts which path.
- Encrypt only the values (`sops --encrypt --encrypted-regex '^(data|stringData|password|.*_KEY)$'`), so diffs stay readable.
- Decrypting prints secrets. core's shell guard asks before `sops --decrypt`; prefer `sops exec-env` or applying the file directly.

## Rotation and exposure

- Every secret has an owner and a rotation date in `docs/compliance/access-matrix.md`.
- If a secret reached git, a log, an image or a chat: rotate it first, then remove it, then follow `incident-response` (governance). Removing it from history alone is not enough.

## Never

- Bake a secret into an image (`ENV`, `ARG`, a copied file). The container scan fails on it.
- Put a secret into a URL, a command-line argument (visible in the process list) or a log line.
- Read a secret's value in this session to "check" it. Check that it is set instead.
