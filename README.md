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
- Jest + Testcontainers (Integration Tests)
- React + Vite + Tailwind CSS (UI Dashboard)
- Socket.IO + Redis Pub/Sub (Real-time Events)

Supports:
- background job processing
- retries with exponential backoff
- delayed jobs with scheduling
- dead-letter queue
- worker auto-scaling support
- metrics for monitoring
- structured JSON logging
- stale job reaper
- pause/resume workers
- job cancellation
- idempotency keys to prevent duplicates
- optimistic job claiming + concurrency
- automated unit + integration tests
- real-time UI dashboard with Socket.IO
- pagination for job lists

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

# Phase 5 — Automated Testing
Full testing suite:

### Unit Tests (Jest + ts-jest)
Located in:
```
tests/unit/
```
- `backoffSeconds` utility function tests

### Integration Tests (Jest + Testcontainers)
```
tests/integration/
```
Runs:
- Postgres container
- Redis container
- API via supertest(server)

Tests:
- **POST /jobs** - create job, validation errors, idempotency key
- **GET /jobs** - list jobs with pagination, filtering, search
- **GET /jobs/:id** - fetch job, 404 handling
- **POST /jobs/:id/cancel** - cancel pending job, status validation
- **POST /control/pause** - pause workers
- **POST /control/resume** - resume workers
- **GET /stats** - queue statistics
- **GET /health** - health check
- **GET /metrics** - Prometheus metrics

### Frontend Tests (Vitest + Testing Library)
```
packages/frontend/src/**/*.test.{ts,tsx}
```
- 86 tests covering components, hooks, API client, sockets

### Updated GitHub Actions Pipeline
Runs:
- install deps
- build
- lint
- unit tests
- frontend tests
- integration tests (with Docker)

### Test Commands
```bash
npm run test:unit        # Run unit tests only
npm run test:frontend    # Run frontend tests (Vitest)
npm run test:integration # Run integration tests (requires Docker)
npm test                 # Run all tests
```

# Phase 6 — UI Dashboard
Full React dashboard for job queue management:

### Tech Stack
- React 19 + TypeScript
- Vite 7 (build tool)
- Tailwind CSS v4
- TanStack Query v5 (data fetching)
- Socket.IO (real-time updates)
- Vitest + Testing Library (86 tests)

### Features
- **Dashboard** - Overview of all jobs with real-time updates
- **Job List** - Paginated list with status filters and search
- **Dead Letter Queue** - Dedicated tab for failed jobs
- **Job Details** - View payload, attempts, errors, cancel jobs
- **Metrics Panel** - Queue depth, in-progress, succeeded, failed counts
- **Controls** - Pause/Resume queue processing
- **Real-time** - Socket.IO integration with Redis pub/sub for live job updates
- **Pagination** - Navigate through large job lists with page controls

### Socket.IO Events
The API emits the following real-time events via Socket.IO:
- `job_created` - When a new job is created
- `job_updated` - When a job status changes (in_progress, succeeded, failed, dead_letter)
- `queue_paused` - When the queue is paused
- `queue_resumed` - When the queue is resumed

Worker events flow through Redis pub/sub (`jobs:events` channel) to the API, which broadcasts to connected clients.

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
- GET /jobs (with filters: status, q, limit, offset)
- GET /jobs/:id
- GET /stats (dashboard metrics)
- GET /health
- GET /metrics
- WebSocket: Socket.IO at /socket.io

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

Runs on push/PR to main:
1. **Build & Test Job:**
   - build (includes TypeScript compilation)
   - lint
   - unit tests
   - frontend tests (86 Vitest tests)

2. **Integration Tests Job:**
   - build
   - integration tests (with Docker containers)

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
- Pagination controls
- Job details panel
- Metrics panel with queue statistics
- Pause/Resume controls

---

**Complete** ✓