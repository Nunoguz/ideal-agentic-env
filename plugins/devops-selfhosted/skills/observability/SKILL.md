---
name: observability
description: Add or review observability for a self-hosted service - OpenTelemetry traces and metrics (.NET and Node), structured JSON logs without personal data, health and readiness endpoints, an OpenTelemetry Collector, and alerts tied to user-visible symptoms. Use when instrumenting a service, adding logging or metrics, setting up monitoring or alerts, or debugging production behaviour.
---

# Observability

## Instrument the service

- **Traces and metrics:** OpenTelemetry SDK with the framework's auto-instrumentation (.NET: `OpenTelemetry.Extensions.Hosting` with ASP.NET Core, HttpClient and EF Core; Node: `@opentelemetry/sdk-node` with HTTP, Fastify and pg). Export OTLP to a Collector, never straight to a vendor from the app.
- **Service identity:** `service.name`, `service.version` (the commit) and `deployment.environment` on every signal.
- **Logs:** structured JSON to stdout, with the trace id. Levels mean something: `Error` needs action, `Warning` might.
- **Health:** `/health/live` (the process) and `/health/ready` (dependencies). Both anonymous and without details.

## Personal data

- No personal data, tokens or full request bodies in logs, spans or metric labels. Identify a person by an internal id, never by name, email or phone.
- High-cardinality values (user ids, URLs with ids) never go into metric labels.
- Log retention follows `docs/compliance/retention-policy.md` (governance).

## Collector and alerts

- One OpenTelemetry Collector per environment, pinned by digest, with a `memory_limiter` and a `batch` processor. It forwards to the chosen backend (for example Grafana Tempo, Loki and Prometheus, self-hosted).
- Alert on symptoms the user sees: error rate, latency (p95) and saturation per service, plus certificate expiry and backup age. Each alert links a runbook.

## Prove it

Run the service locally with the Collector (for example in `compose.yaml`) and confirm a request shows up as one trace across services, with no personal data in the attributes.
