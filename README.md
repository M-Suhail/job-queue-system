# Job Queue System (API + Worker + Retry + Delays + Metrics + Logging)

A fully functioning distributed job queue built with:

- Node.js (TypeScript)
- Express
- PostgreSQL
- Redis (queue + delayed ZSET)
- Pino (structured logging)
- Prometheus (metrics)
- Docker (infra)
- GitHub Actions (CI)

Supports:
- background job processing
- retries with exponential backoff
- delayed jobs
- dead-letter queue
- worker autoscaling support
- metrics for monitoring
- structured JSON logging
- stale job reaper
- API + Worker separation
- monorepo (npm workspaces)

## Repository Structure

```
job-queue/
  packages/
    common/
    api/
    worker/
  infra/
    docker-compose.yml
    init.sql
  .github/
    workflows/
      ci.yml
  README.md
```

## Phase Highlights

### Phase 1 — Core Queue
- API create jobs
- Worker processes jobs
- Redis list for ready queue
- PostgreSQL schema
- Base handlers

### Phase 2 — Scheduling + Retries
- next_run_at
- delayed jobs (Redis ZSET)
- sweeper
- exponential backoff
- dead-letter support

### Phase 3 — Observability + Reliability
- structured logging via Pino
- Prometheus metrics (API + worker)
- /metrics endpoints
- worker metrics server
- job counters + queue length gauge
- stale job reaper script
- GitHub Actions CI
- deep health check

## Running Infra

```
docker compose -f infra/docker-compose.yml up -d
```

## Running API

```
cd packages/api
npm run dev
```

Available endpoints:

- POST /jobs
- GET /jobs/:id
- GET /health
- GET /metrics

## Running Worker

```
cd packages/worker
npm run dev
```

Metrics server: http://localhost:9100/metrics

## Submit Job Example

POST /jobs
```json
{
  "type": "sendEmail",
  "payload": { "to": "user@example.com" }
}
```

## Check Job Status

GET /jobs/<id>

## Reaper

```
cd packages/worker
npm run reaper
```

## CI Pipeline

Located at:
```
.github/workflows/ci.yml
```

Runs:
- install
- typecheck
- build
- lint
