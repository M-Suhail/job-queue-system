# Job Queue System (API + Worker + Scheduling + Retries + Metrics + Logging + Testing + UI Dashboard)

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
- React + Vite + Tailwind CSS (Phase 6)

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
- real-time UI dashboard (Phase 6)

## Repository Structure

```
job-queue/
  packages/
    common/
    api/
    worker/
    frontend/
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
- `backoffSeconds` utility function tests

### Integration Tests (Testcontainers)
```
tests/integration/
```
Runs:
- Postgres container
- Redis container
- API via supertest(server)

Tests:
- **POST /jobs** - create job, validation errors, idempotency key
- **GET /jobs/:id** - fetch job, 404 handling
- **POST /jobs/:id/cancel** - cancel pending job, status validation
- **POST /control/pause** - pause workers
- **POST /control/resume** - resume workers
- **GET /health** - health check
- **GET /metrics** - Prometheus metrics

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
npm run test:frontend    # Run frontend tests (Vitest)
npm run test:integration # Run integration tests (requires Docker)
npm test                 # Run all tests
```

# Phase 6 — UI Dashboard (NEW)
Full React dashboard for job queue management:

### Tech Stack
- React 19 + TypeScript
- Vite 7 (build tool)
- Tailwind CSS v4
- TanStack Query v5 (data fetching)
- Socket.io (real-time updates)
- Vitest + Testing Library (77 tests)

### Features
- **Dashboard** - Overview of all jobs with real-time updates
- **Job List** - Paginated list with status filters and search
- **Dead Letter Queue** - Dedicated tab for failed jobs
- **Job Details** - View payload, attempts, errors, cancel jobs
- **Metrics Panel** - Queue depth, in-progress, succeeded, failed counts
- **Controls** - Pause/Resume queue processing
- **Real-time** - Socket.io integration for live job updates

### Running Frontend
```bash
cd packages/frontend
npm run dev      # Development server (http://localhost:5173)
npm run build    # Production build
npm run test     # Run Vitest tests
npm run preview  # Preview production build
```

### API Proxy
The frontend proxies `/api` requests to the backend at `localhost:3000`.

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
- GET /jobs (with filters: status, q, limit)
- GET /jobs/:id
- GET /stats (dashboard metrics)
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
VITE_API_URL=http://localhost:3000  # Frontend only (optional)
```

# Screenshots

## Dashboard
The main dashboard shows:
- Tabs for All Jobs / Dead Letter queue
- Search and status filters
- Real-time job list with status pills
- Job details panel
- Metrics panel with queue statistics
- Pause/Resume controls

---

**Phase 6 Complete** ✓
```