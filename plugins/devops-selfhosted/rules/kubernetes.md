# Kubernetes and Helm rules (devops-selfhosted)

- Every container sets `resources.requests` and `resources.limits` for memory, and a CPU request.
- `readinessProbe` (dependencies ready) and `livenessProbe` (process alive) on different endpoints. A failing dependency never fails liveness, or the pod restarts in a loop. Use a `startupProbe` for slow starts.
- Security context on every pod: `runAsNonRoot: true`, `readOnlyRootFilesystem: true`, `allowPrivilegeEscalation: false`, `capabilities.drop: [ALL]`, `seccompProfile.type: RuntimeDefault`.
- Images are referenced by digest or an immutable tag, never `latest`.
- Zero-downtime rollouts: `RollingUpdate` with `maxUnavailable: 0`, at least two replicas, a `PodDisruptionBudget`, and `terminationGracePeriodSeconds` longer than the app's shutdown.
- A `NetworkPolicy` denies by default; allow only the traffic each workload needs.
- Secrets never sit in plain manifests or `values.yaml`: Sealed Secrets, SOPS-encrypted files or an external secret store. ConfigMaps hold no secrets.
- Database migrations run as a separate Job (or a Helm pre-upgrade hook) before the new version rolls out, never from every replica at startup.
- Applying to a cluster is a deploy: core's shell guard asks before `kubectl apply`, `helm upgrade` and similar commands.
