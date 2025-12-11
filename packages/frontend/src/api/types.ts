export type Job = {
  id: string;
  type: string;
  status: 'pending' | 'in_progress' | 'succeeded' | 'failed' | 'dead_letter' | 'cancelled';
  attempts?: number;
  max_attempts?: number;
  priority?: number;
  timeout_ms?: number | null;
  payload?: Record<string, any>;
  idempotency_key?: string | null;
  last_error?: string | null;
  created_at?: string; // ISO
  updated_at?: string; // ISO
  next_run_at?: string | null;
};

export type Worker = {
  id: string;
  hostname: string;
  pid: number;
  concurrency: number;
  status: 'active' | 'idle' | 'draining' | 'offline';
  jobs_processed: number;
  jobs_failed: number;
  current_job_id: string | null;
  last_heartbeat: string;
  started_at: string;
};

export type WorkersResponse = {
  workers: Worker[];
  total: number;
  active: number;
};