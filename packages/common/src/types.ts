export type JobStatus = 'pending' | 'in_progress' | 'succeeded' | 'failed' | 'dead_letter';

export interface Job {
  id: string;
  type: string;
  payload: any;
  status: JobStatus;
  attempts: number;
  max_attempts: number;
  idempotency_key?: string | null;
  last_error?: string | null;
  created_at: string;
  updated_at: string;
}
