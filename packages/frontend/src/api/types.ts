export type Job = {
  id: string;
  type: string;
  status: 'pending' | 'in_progress' | 'succeeded' | 'failed' | 'dead_letter' | 'cancelled';
  attempts?: number;
  max_attempts?: number;
  payload?: Record<string, any>;
  idempotency_key?: string | null;
  last_error?: string | null;
  created_at?: string; // ISO
  updated_at?: string; // ISO
  next_run_at?: string | null;
};