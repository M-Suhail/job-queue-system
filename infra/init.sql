CREATE TABLE IF NOT EXISTS jobs (
  id UUID PRIMARY KEY,
  type TEXT NOT NULL,
  payload JSONB,
  status TEXT NOT NULL,
  attempts INT DEFAULT 0,
  max_attempts INT DEFAULT 5,
  priority INT DEFAULT 5,  -- 1 (lowest) to 10 (highest), default 5
  timeout_ms INT DEFAULT NULL,  -- Job timeout in milliseconds, NULL = no timeout
  idempotency_key TEXT,
  last_error TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);

-- Index for cursor-based pagination (created_at DESC, id DESC)
CREATE INDEX IF NOT EXISTS idx_jobs_created_at_id ON jobs(created_at DESC, id DESC);

-- Index for priority-based fetching
CREATE INDEX IF NOT EXISTS idx_jobs_priority ON jobs(priority DESC, created_at ASC);

ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS next_run_at TIMESTAMPTZ DEFAULT now();

-- Add priority column if not exists
ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS priority INT DEFAULT 5;

-- Add timeout_ms column if not exists  
ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS timeout_ms INT DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_jobs_next_run_at ON jobs(next_run_at);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_jobs_idempotency_key
  ON jobs(idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- Worker registration table for fleet monitoring
CREATE TABLE IF NOT EXISTS workers (
  id TEXT PRIMARY KEY,
  hostname TEXT NOT NULL,
  pid INT NOT NULL,
  concurrency INT DEFAULT 4,
  status TEXT DEFAULT 'active',  -- active, idle, draining
  jobs_processed INT DEFAULT 0,
  jobs_failed INT DEFAULT 0,
  current_job_id UUID,
  last_heartbeat TIMESTAMPTZ DEFAULT now(),
  started_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_workers_status ON workers(status);
CREATE INDEX IF NOT EXISTS idx_workers_last_heartbeat ON workers(last_heartbeat);

