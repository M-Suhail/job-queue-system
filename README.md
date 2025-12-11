# Job Queue System

A production-ready distributed job queue built with Node.js, TypeScript, PostgreSQL, Redis, and React.

![Build Status](https://github.com/M-Suhail/job-queue-system/actions/workflows/ci.yml/badge.svg)

## Features

- ⚡ **High Performance** - Redis-backed queue with PostgreSQL persistence
- 🔢 **Priority Queues** - Jobs processed by priority (1-10, higher first)
- ⏱️ **Job Timeouts** - Configurable execution timeouts (1s-1h)
- 🔄 **Retries & Backoff** - Exponential backoff with configurable max attempts
- ⏰ **Delayed Jobs** - Schedule jobs for future execution
- 💀 **Dead Letter Queue** - Failed jobs moved to DLQ after max retries
- 👷 **Worker Fleet Monitoring** - Track active workers, their status, and metrics
- 📊 **Real-time Dashboard** - React UI with Socket.IO live updates
- 📈 **Monitoring** - Prometheus metrics + Grafana dashboard
- 🔒 **Security** - Rate limiting, input validation, API key auth
- 📝 **API Documentation** - Interactive Swagger UI
- 🧪 **Tested** - Unit, integration, and E2E tests
- 🐳 **Docker Ready** - Production Docker Compose included

## Quick Start

### Prerequisites

- Node.js 20+
- Docker & Docker Compose
- npm 10+

### Development Setup

```bash
# Clone the repository
git clone https://github.com/M-Suhail/job-queue-system.git
cd job-queue-system

# Install dependencies
npm install

# Start infrastructure (PostgreSQL + Redis)
docker compose -f infra/docker-compose.yml up -d

# Start API server
cd packages/api && npm run dev

# Start worker (in another terminal)
cd packages/worker && npm run dev

# Start frontend (in another terminal)
cd packages/frontend && npm run dev
```

### Access Points

| Service | URL | Description |
|---------|-----|-------------|
| Frontend | http://localhost:5173 | React Dashboard |
| API | http://localhost:3000 | REST API |
| Swagger | http://localhost:3000/api-docs | API Documentation |
| Metrics | http://localhost:3000/metrics | Prometheus metrics |
| Health | http://localhost:3000/health | Health check |

## Architecture

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Frontend  │────▶│     API     │────▶│  PostgreSQL │
│   (React)   │◀────│  (Express)  │◀────│   (Jobs)    │
└─────────────┘     └──────┬──────┘     └─────────────┘
       │                   │
       │ Socket.IO         │ Redis Pub/Sub
       ▼                   ▼
┌─────────────┐     ┌─────────────┐
│   Browser   │     │    Redis    │
│  (Live UI)  │     │   (Queue)   │
└─────────────┘     └──────┬──────┘
                           │
                           ▼
                    ┌─────────────┐
                    │   Workers   │
                    │ (Consumers) │
                    └─────────────┘
```

## API Endpoints

### Jobs

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/jobs` | Create a new job |
| `GET` | `/jobs` | List jobs (with filters & pagination) |
| `GET` | `/jobs/:id` | Get job details |
| `POST` | `/jobs/:id/cancel` | Cancel a pending job |
| `POST` | `/jobs/:id/retry` | Retry a failed/dead_letter job |
| `DELETE` | `/jobs/:id` | Delete a job (requires API key) |

### Control (requires API key)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/control/pause` | Pause all workers |
| `POST` | `/control/resume` | Resume all workers |

### Monitoring

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/stats` | Queue statistics (JSON) |
| `GET` | `/workers` | List active workers |
| `DELETE` | `/workers/:id` | Remove offline worker (requires API key) |
| `GET` | `/metrics` | Prometheus metrics |
| `GET` | `/health` | Health check (DB + Redis) |

### Job Creation Request Body

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `type` | string | Yes | - | Job type identifier (1-100 chars) |
| `payload` | object | No | `{}` | Job data to process |
| `idempotencyKey` | UUID | No | - | Prevents duplicate job creation |
| `maxAttempts` | number | No | 5 | Max retries before dead-letter (1-100) |
| `priority` | number | No | 5 | Priority level 1-10 (higher = processed first) |
| `timeout` | number | No | - | Execution timeout in ms (1000-3600000) |

### Query Parameters for `GET /jobs`

| Parameter | Type | Description |
|-----------|------|-------------|
| `limit` | number | Results per page (1-200, default: 20) |
| `status` | string | Filter: pending, running, succeeded, failed, cancelled, dead_letter |
| `q` | string | Search in job ID, type, or payload |
| `cursor` | string | Pagination cursor |
| `created_after` | ISO date | Filter jobs created after |
| `created_before` | ISO date | Filter jobs created before |
| `min_attempts` | number | Minimum attempts filter |
| `max_attempts` | number | Maximum attempts filter |

## Usage Examples

### Create a Job

```bash
curl -X POST http://localhost:3000/jobs \
  -H "Content-Type: application/json" \
  -d '{
    "type": "sendEmail",
    "payload": { "to": "user@example.com", "subject": "Hello" },
    "maxAttempts": 5
  }'
```

### Create High-Priority Job with Timeout

```bash
curl -X POST http://localhost:3000/jobs \
  -H "Content-Type: application/json" \
  -d '{
    "type": "urgentTask",
    "payload": { "data": "important" },
    "priority": 10,
    "timeout": 30000
  }'
```

### Create with Idempotency Key

```bash
curl -X POST http://localhost:3000/jobs \
  -H "Content-Type: application/json" \
  -d '{
    "type": "sendEmail",
    "payload": { "to": "user@example.com" },
    "idempotencyKey": "550e8400-e29b-41d4-a716-446655440000"
  }'
```

### List Jobs with Filters

```bash
# List failed jobs
curl "http://localhost:3000/jobs?status=failed&limit=10"

# Search jobs
curl "http://localhost:3000/jobs?q=sendEmail"

# Date range filter
curl "http://localhost:3000/jobs?created_after=2024-01-01T00:00:00Z"
```

### Pause/Resume Queue (with API key)

```bash
# Pause
curl -X POST http://localhost:3000/control/pause \
  -H "X-API-Key: your-api-key"

# Resume
curl -X POST http://localhost:3000/control/resume \
  -H "X-API-Key: your-api-key"
```

## Configuration

### Environment Variables

Create a `.env` file based on `.env.example`:

```bash
# Database (Required in production)
DATABASE_URL=postgresql://user:password@localhost:5432/jobs

# Redis
REDIS_HOST=127.0.0.1
REDIS_PORT=6379

# API
PORT=3000
NODE_ENV=development

# Security (Optional - enables auth for sensitive endpoints)
API_KEY=your-secret-api-key

# Worker
WORKER_CONCURRENCY=4
SWEEP_INTERVAL_MS=1000
SHUTDOWN_TIMEOUT_MS=30000

# Frontend
VITE_API_URL=http://localhost:3000
```

## Production Deployment

### Using Docker Compose

```bash
# Copy and configure environment
cp .env.example .env
# Edit .env with production values

# Deploy
cd infra
docker compose -f docker-compose.prod.yml up -d
```

### Production Features

- **Resource Limits** - CPU/memory constraints per service
- **Health Checks** - Automatic container health monitoring
- **Restart Policies** - Auto-restart on failure
- **Network Isolation** - Backend services not exposed externally
- **Graceful Shutdown** - Workers wait for in-flight jobs (30s timeout)
- **Persistent Volumes** - Data survives container restarts
- **Priority Queues** - High-priority jobs processed first
- **Job Timeouts** - Automatic timeout handling for hung jobs
- **Worker Fleet Monitoring** - Real-time worker status tracking

### Worker Fleet Monitoring

Workers automatically register themselves and send heartbeats every 5 seconds. The dashboard provides:

- **Worker Status** - Active, idle, draining, or offline
- **Worker Metrics** - Jobs processed, jobs failed, uptime
- **Current Job** - What job each worker is processing
- **Stale Detection** - Workers marked offline after 30s without heartbeat

```bash
# List active workers
curl http://localhost:3000/workers

# Response
{
  "workers": [
    {
      "id": "worker-macbook-12345-abc123",
      "hostname": "macbook",
      "pid": 12345,
      "status": "active",
      "concurrency": 4,
      "jobs_processed": 150,
      "jobs_failed": 2,
      "current_job_id": "550e8400-e29b-41d4-a716-446655440000",
      "last_heartbeat": "2024-01-15T10:30:00Z",
      "started_at": "2024-01-15T08:00:00Z"
    }
  ],
  "total": 1,
  "active": 1
}
```

### Monitoring Stack

The production setup includes:

- **Prometheus** (port 9090) - Metrics collection
- **Grafana** (port 3001) - Pre-configured dashboard

Access Grafana at `http://localhost:3001` (default: admin/admin)

## Testing

```bash
# Run all tests
npm test

# Run specific test suites
npm run test:unit        # Unit tests (Jest)
npm run test:frontend    # Frontend tests (Vitest) - 89 tests
npm run test:integration # Integration tests (requires Docker)

# E2E tests (Playwright)
cd packages/frontend && npx playwright test
```

## Project Structure

```
job-queue/
├── packages/
│   ├── api/                 # Express API server
│   │   └── src/
│   │       ├── server.ts    # Routes, validation, Swagger
│   │       ├── socket.ts    # Socket.IO setup
│   │       └── start.ts     # Server entry point
│   ├── worker/              # Job processor
│   │   └── src/
│   │       ├── worker.ts    # Main worker loop
│   │       ├── handlers/    # Job type handlers
│   │       └── utils/       # Backoff logic
│   ├── common/              # Shared code
│   │   └── src/
│   │       ├── db.ts        # PostgreSQL pool
│   │       ├── logger.ts    # Pino logger
│   │       ├── metrics.ts   # Prometheus metrics
│   │       └── types.ts     # TypeScript types
│   └── frontend/            # React dashboard
│       └── src/
│           ├── components/  # UI components
│           ├── hooks/       # React Query hooks
│           ├── api/         # API client
│           └── sockets/     # Socket.IO client
├── infra/
│   ├── docker-compose.yml      # Development
│   ├── docker-compose.prod.yml # Production
│   ├── init.sql                # Database schema
│   ├── prometheus.yml          # Prometheus config
│   └── grafana-dashboard.json  # Grafana dashboard
├── tests/
│   ├── unit/                # Unit tests
│   └── integration/         # Integration tests
└── .github/
    └── workflows/
        └── ci.yml           # GitHub Actions CI
```

## Real-time Events

The API broadcasts events via Socket.IO (with Redis pub/sub for multi-instance):

| Event | Payload | Description |
|-------|---------|-------------|
| `job_created` | Job object | New job submitted |
| `job_updated` | Job object | Job status changed |
| `job_deleted` | `{ jobId }` | Job was deleted |
| `queue_paused` | `{ paused: true }` | Queue paused |
| `queue_resumed` | `{ paused: false }` | Queue resumed |

### Connecting from Client

```typescript
import { io } from 'socket.io-client';

const socket = io('http://localhost:3000');

socket.on('job_created', (job) => console.log('New job:', job));
socket.on('job_updated', (job) => console.log('Job updated:', job));
```

## Job Lifecycle

```
┌─────────┐     ┌─────────┐     ┌───────────┐
│ pending │────▶│ running │────▶│ succeeded │
└─────────┘     └────┬────┘     └───────────┘
                     │
                     │ (error)
                     ▼
              ┌──────────┐     ┌─────────────┐
              │  failed  │────▶│ dead_letter │
              │ (retry)  │     │ (max attempts)
              └──────────┘     └─────────────┘
                     │
                     │ (backoff)
                     ▼
              ┌─────────┐
              │ pending │ (scheduled retry)
              └─────────┘
```

## Adding Job Handlers

Create a new handler in `packages/worker/src/handlers/index.ts`:

```typescript
const handlers: Record<string, Handler> = {
  sendEmail: async (jobId, payload) => {
    // Your logic here
    console.log(`Sending email to ${payload.to}`);
  },
  
  processImage: async (jobId, payload) => {
    // Image processing logic
  },
  
  // Add more handlers...
};
```

## Security

- **Helmet** - Security headers (XSS, clickjacking, etc.)
- **Rate Limiting** - 1000 req/15min general, 100 for control endpoints
- **Input Validation** - Zod schemas for all inputs
- **API Key Auth** - Optional protection for sensitive endpoints
- **UUID Validation** - Validates job IDs before database queries
- **Payload Size Limit** - 1MB max request body

## CI/CD Pipeline

GitHub Actions runs on every push/PR:

1. **Backend Tests** - Build, lint, unit tests
2. **Frontend Tests** - Vitest (89 tests)
3. **Integration Tests** - Docker-based API tests

## License

MIT

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run tests: `npm test`
5. Submit a pull request
