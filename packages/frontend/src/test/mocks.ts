import type { Job } from '../api/types'

export const mockJob: Job = {
  id: 'job-123',
  type: 'email',
  status: 'pending',
  attempts: 0,
  max_attempts: 5,
  payload: { to: 'test@example.com', subject: 'Hello' },
  idempotency_key: 'idem-123',
  last_error: null,
  created_at: '2025-12-10T10:00:00Z',
  updated_at: '2025-12-10T10:00:00Z',
  next_run_at: null,
}

export const mockJobs: Job[] = [
  mockJob,
  {
    id: 'job-456',
    type: 'sms',
    status: 'in_progress',
    attempts: 1,
    max_attempts: 3,
    payload: { phone: '+1234567890' },
    idempotency_key: null,
    last_error: null,
    created_at: '2025-12-10T09:00:00Z',
    updated_at: '2025-12-10T09:30:00Z',
    next_run_at: null,
  },
  {
    id: 'job-789',
    type: 'webhook',
    status: 'succeeded',
    attempts: 1,
    max_attempts: 5,
    payload: { url: 'https://example.com/hook' },
    idempotency_key: 'webhook-1',
    last_error: null,
    created_at: '2025-12-10T08:00:00Z',
    updated_at: '2025-12-10T08:05:00Z',
    next_run_at: null,
  },
  {
    id: 'job-dead',
    type: 'process',
    status: 'dead_letter',
    attempts: 5,
    max_attempts: 5,
    payload: {},
    idempotency_key: null,
    last_error: 'Max retries exceeded',
    created_at: '2025-12-09T10:00:00Z',
    updated_at: '2025-12-10T10:00:00Z',
    next_run_at: null,
  },
]

export const mockMetrics = {
  queue_depth: 15,
  in_progress: 3,
  succeeded: 142,
  dead_letter: 2,
}

export const mockPaginatedJobs = {
  data: mockJobs,
  pagination: {
    total: 4,
    limit: 20,
    hasMore: false,
    nextCursor: null
  }
}
