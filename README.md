# Job Queue System (API + Worker + Scheduling + Retries + Metrics + Logging + Phase 4 Controls)

A fully functioning distributed job queue built with:

- Node.js (TypeScript)
- Express
- PostgreSQL
- Redis
- Pino (structured logging)
- Prometheus (metrics)
- Docker
- GitHub Actions CI

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

## Phase 1 — Core Queue
- API for creating jobs
- Worker processes jobs
- Redis ready queue
- PostgreSQL jobs table

## Phase 2 — Scheduling + Retries
- next_run_at column
- delayed ZSET queue
- sweeper loop
- exponential retry backoff
- dead-letter tracking

## Phase 3 — Observability
- Pino logging
- Prometheus metrics
- /metrics in API + worker
- stale job reaper
- GitHub Actions CI pipeline

## Phase 4 — Control Layer (LATEST)
### Idempotency
- POST /jobs supports `idempotencyKey`
- Prevents duplicate job creation
- Unique partial index added

### Cancellation
- POST /jobs/:id/cancel
- Only allowed if job not in_progress/succeeded/dead_letter
- Removes from Redis queues

### Pause / Resume Fleet
- POST /control/pause
- POST /control/resume
- Workers check Redis key `queue:paused`

### Worker Concurrency
- WORKER_CONCURRENCY env var
- Default: 4

### Optimistic Claim
- UPDATE ... WHERE status = 'pending'
- Prevents multiple workers claiming same job

## Running Infra

```
docker compose -f infra/docker-compose.yml up -d
```

## Running API

```
cd packages/api
npm run dev
```

**Endpoints**
- POST /jobs
- POST /jobs/:id/cancel
- POST /control/pause
- POST /control/resume
- GET /jobs/:id
- GET /health
- GET /metrics

## Running Worker

```
cd packages/worker
npm run dev
```

Metrics at:
```
http://localhost:9100/metrics
```

## Idempotent Job Example

```json
{
  "type": "sendEmail",
  "payload": { "to": "user@example.com" },
  "idempotencyKey": "email-123"
}
```

## Cancel Job Example

POST /jobs/:id/cancel → `{ "status": "cancelled" }`

## Pause / Resume

```
POST /control/pause
POST /control/resume
```

## Testing Checklist (Postman)
1. Submit job with idempotencyKey, repeat — same ID returned.
2. Cancel pending job — should be cancelled.
3. Pause workers → submit jobs → queue grows.
4. Resume workers → queue drains.
5. Concurrency check with long-running jobs.
6. Optimistic claim: two workers should never double-process.

## CI Pipeline
GitHub Actions workflow:

```
.github/workflows/ci.yml
```

- install deps  
- lint  
- build  
- typecheck  

## Environment Variables

```
REDIS_HOST=redis
REDIS_PORT=6379
WORKER_CONCURRENCY=4
SWEEP_INTERVAL_MS=1000
DATABASE_URL=postgres://dev:dev@postgres:5432/jobs
```

## Next Step — Phase 5 UI Dashboard
- React (Vite + Tailwind)
- Real-time job feed
- Pause/resume controls
- Job explorer
