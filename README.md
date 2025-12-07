# Job Queue System (API + Worker + Scheduling + Retries + Metrics + Logging + Phase 5 Testing Suite)

A fully functioning distributed job queue built with:

- Node.js (TypeScript)
- Express
- PostgreSQL
- Redis
- Pino (structured logging)
- Prometheus (metrics)
- Docker
- GitHub Actions CI
- Jest + Testcontainers (Phase 5)

Supports:
- background job processing
- retries with exponential backoff
- delayed jobs with scheduling
- dead-letter queue
- worker auto-scaling support
- metrics for monitoring
- structured JSON logging
- stale job reaper
- pause/resume workers (Phase 4)
- job cancellation (Phase 4)
- idempotency keys to prevent duplicates (Phase 4)
- optimistic job claiming + concurrency (Phase 4)
- automated unit + integration tests (Phase 5)

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
  tests/
    unit/
    integration/
  .github/
    workflows/
      ci.yml
  README.md
```

# Phase 1 — Core Queue
- API to create jobs
- Worker consumes jobs
- Redis ready queue
- PostgreSQL jobs table

# Phase 2 — Scheduling + Retries
- next_run_at column
- delayed ZSET queue
- sweeper loop
- exponential retry backoff
- dead-letter logic

# Phase 3 — Observability
- Pino JSON logging
- Prometheus metrics
- worker stale-job reaper
- GitHub Actions CI (build + lint + typecheck)

# Phase 4 — Control Layer
### Idempotency
- POST /jobs supports idempotencyKey
- unique partial index prevents duplicates

### Cancellation
- POST /jobs/:id/cancel
- only allowed when safe
- removes job from Redis queues

### Pause / Resume Workers
- POST /control/pause
- POST /control/resume
- workers read Redis flag queue:paused

### Worker Concurrency
- WORKER_CONCURRENCY env
- default: 4

### Optimistic Claim
- UPDATE ... WHERE status='pending'
- guarantees single-claim behavior

# Phase 5 — Automated Testing (NEW)
Full testing suite added:

### Unit Tests (Jest + ts-jest)
Located in:
```
tests/unit/
```

### Integration Tests (Testcontainers)
```
tests/integration/
```
Runs:
- Postgres container
- Redis container
- API via supertest(server)

Tests:
- job creation → DB + Redis

### Updated GitHub Actions Pipeline
Runs:
- install deps
- build
- lint
- unit tests
- integration tests (with Docker)

### Test Commands
```bash
npm run test:unit        # Run unit tests only
npm run test:integration # Run integration tests (requires Docker)
npm test                 # Run all tests
```

# Running Infrastructure
```
docker compose -f infra/docker-compose.yml up -d
```

# Running API
```bash
cd packages/api
npm run dev    # Development with hot reload
npm run start  # Production (requires build first)
```

Endpoints:
- POST /jobs
- POST /jobs/:id/cancel
- POST /control/pause
- POST /control/resume
- GET /jobs/:id
- GET /health
- GET /metrics

# Running Worker
```bash
cd packages/worker
npm run dev
```

Worker metrics:
```
http://localhost:9100/metrics
```

# Examples

## Idempotent Job
```json
{
  "type": "sendEmail",
  "payload": { "to": "user@example.com" },
  "idempotencyKey": "email-123"
}
```

## Cancel Job
```
POST /jobs/:id/cancel
→ { "status": "cancelled" }
```

## Pause / Resume
```
POST /control/pause
POST /control/resume
```

# Testing Checklist (Postman)
1. Idempotency — same ID returned for repeated submissions.
2. Cancel pending job.
3. Pause workers → queue grows.
4. Resume workers → queue drains.
5. Concurrency validation with slow handlers.
6. Optimistic claim behavior validated.

# CI Pipeline
```
.github/workflows/ci.yml
```

Runs:
- lint
- typecheck
- build
- unit + integration tests

# Environment Variables
```
REDIS_HOST=redis
REDIS_PORT=6379
WORKER_CONCURRENCY=4
SWEEP_INTERVAL_MS=1000
DATABASE_URL=postgres://dev:dev@postgres:5432/jobs
```

# Next Step — Phase 6 UI Dashboard
- React (Vite + Tailwind)
- real-time job stream
- queue explorer
- dead-letter view
- pause/resume controls
```