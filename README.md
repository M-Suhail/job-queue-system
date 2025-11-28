# Job Queue System (Phase 2)

A distributed job queue system built with Node.js, TypeScript, Postgres, and Redis. Supports job creation, delayed scheduling, retries with exponential backoff, dead-letter handling, and multiple job types.

## Overview

This project is structured as a monorepo containing:
- packages/common – shared db code
- packages/api – REST API
- packages/worker – background job processor

Phase 2 adds:
- Handler registry
- next_run_at scheduling
- Redis delayed ZSET
- Sweeper loop
- Exponential retry with jitter
- Dead letter queue

## Project Structure
```
job-queue/
  package.json
  tsconfig.json
  packages/
    common/
    api/
    worker/
  infra/
    docker-compose.yml
    init.sql
    .env.example
  README.md
```

## Setup

### 1. Copy env
```
cp infra/.env.example .env
```

### 2. Start Postgres + Redis
```
docker compose -f infra/docker-compose.yml up -d
```

### 3. Apply DB Migration
```
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS next_run_at TIMESTAMPTZ DEFAULT now();
CREATE INDEX IF NOT EXISTS idx_jobs_next_run_at ON jobs(next_run_at);
```

### 4. Install dependencies
```
npm install
```

### 5. Start API
```
cd packages/api
npm run dev
```

### 6. Start Worker
```
cd packages/worker
npm run dev
```

## Usage (Postman)

### Create job (sendEmail)
```
POST /jobs
{
  "type": "sendEmail",
  "payload": { "to": "user@example.com" }
}
```

### Create job (failOnce)
```
POST /jobs
{
  "type": "failOnce",
  "payload": { "failUntil": 3 }
}
```

### Get job
```
GET /jobs/:id
```

## Queries

### SQL
```
SELECT id, type, status, attempts, next_run_at, last_error
FROM jobs ORDER BY created_at DESC LIMIT 20;
```

### Redis
```
LLEN queue:jobs
ZCARD delayed:jobs
```

## Troubleshooting
- Sweeper not running: check worker logs
- Jobs stuck in_progress: worker crash; needs stale job reaper
- Different Postgres instances: check DATABASE_URL

## Phase 2 Changes
- Added handler registry
- Added retries + backoff
- Added sweeper
- Added delayed ZSET
- API sets next_run_at
- Updated init.sql

## Next: Phase 3
- Logging
- Metrics
- Reaper
- CI
- Dashboard

