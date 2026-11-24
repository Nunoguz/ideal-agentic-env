# Docker Compose rules (devops-selfhosted)

- Compose files describe local development and single-host deployments. Pin images by digest, as in Dockerfiles.
- Secrets come from an `.env` file that is git-ignored (commit a `.env.example` with placeholder values) or from Compose `secrets:`. Never write a password into the Compose file.
- Bind published ports to `127.0.0.1` for local development (`"127.0.0.1:55432:5432"`), so a database is not exposed on the network. Pick host ports that do not clash with other projects on the machine.
- Every service has a `healthcheck`, and dependents wait with `depends_on: { db: { condition: service_healthy } }`.
- Data lives in named volumes. Removing them (`docker compose down -v`) deletes the data; core's shell guard asks first.
- Set resource limits (`deploy.resources.limits`) and `restart: unless-stopped` for single-host production use.
- Containers run read-only where possible (`read_only: true` with a `tmpfs` for scratch), with `cap_drop: [ALL]` and `security_opt: [no-new-privileges:true]`.
