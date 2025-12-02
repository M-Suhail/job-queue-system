CREATE TABLE IF NOT EXISTS jobs (
  id UUID PRIMARY KEY,
  type TEXT NOT NULL,
  payload JSONB,
  status TEXT NOT NULL,
  attempts INT DEFAULT 0,
  max_attempts INT DEFAULT 5,
  idempotency_key TEXT,
  last_error TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);

ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS next_run_at TIMESTAMPTZ DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_jobs_next_run_at ON jobs(next_run_at);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_jobs_idempotency_key
  ON jobs(idempotency_key)
  WHERE idempotency_key IS NOT NULL;

