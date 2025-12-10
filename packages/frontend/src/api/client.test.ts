import { describe, it, expect, vi, beforeEach } from 'vitest'
import axios from 'axios'
import { fetchJobs, fetchJob, createJob, cancelJob, pauseQueue, resumeQueue } from './client'
import { mockJob, mockJobs, mockPaginatedJobs } from '../test/mocks'

vi.mock('axios', () => {
  const mockAxiosInstance = {
    get: vi.fn(),
    post: vi.fn(),
  }
  return {
    default: {
      create: vi.fn(() => mockAxiosInstance),
    },
  }
})

describe('API Client', () => {
  let mockApi: { get: ReturnType<typeof vi.fn>; post: ReturnType<typeof vi.fn> }

  beforeEach(() => {
    vi.clearAllMocks()
    mockApi = axios.create() as unknown as { get: ReturnType<typeof vi.fn>; post: ReturnType<typeof vi.fn> }
  })

  describe('fetchJobs', () => {
    it('fetches jobs with default (empty) filters', async () => {
      mockApi.get.mockResolvedValueOnce({ data: mockPaginatedJobs })

      const result = await fetchJobs()

      expect(mockApi.get).toHaveBeenCalledWith('/jobs?')
      expect(result.data).toEqual(mockJobs)
      expect(result.pagination.total).toBe(4)
    })

    it('fetches jobs with custom limit and offset', async () => {
      const paginatedResponse = {
        data: mockJobs.slice(0, 2),
        pagination: { total: 4, limit: 2, offset: 0, hasMore: true }
      }
      mockApi.get.mockResolvedValueOnce({ data: paginatedResponse })

      const result = await fetchJobs({ limit: 2, offset: 0 })

      expect(mockApi.get).toHaveBeenCalledWith('/jobs?limit=2')
      expect(result.data).toHaveLength(2)
      expect(result.pagination.hasMore).toBe(true)
    })

    it('throws on error', async () => {
      mockApi.get.mockRejectedValueOnce(new Error('Network error'))

      await expect(fetchJobs()).rejects.toThrow('Network error')
    })
  })

  describe('fetchJob', () => {
    it('fetches a single job by id', async () => {
      mockApi.get.mockResolvedValueOnce({ data: mockJob })

      const result = await fetchJob('job-123')

      expect(mockApi.get).toHaveBeenCalledWith('/jobs/job-123')
      expect(result).toEqual(mockJob)
    })

    it('throws on 404', async () => {
      mockApi.get.mockRejectedValueOnce({ response: { status: 404 } })

      await expect(fetchJob('nonexistent')).rejects.toEqual({ response: { status: 404 } })
    })
  })

  describe('createJob', () => {
    it('creates a job with payload', async () => {
      const newJob = { type: 'email', payload: { to: 'test@test.com' } }
      mockApi.post.mockResolvedValueOnce({ data: { id: 'new-job-id' } })

      const result = await createJob(newJob)

      expect(mockApi.post).toHaveBeenCalledWith('/jobs', newJob)
      expect(result).toEqual({ id: 'new-job-id' })
    })

    it('creates a job with idempotency key', async () => {
      const newJob = { type: 'sms', idempotencyKey: 'unique-key' }
      mockApi.post.mockResolvedValueOnce({ data: { id: 'new-job-id' } })

      await createJob(newJob)

      expect(mockApi.post).toHaveBeenCalledWith('/jobs', newJob)
    })
  })

  describe('cancelJob', () => {
    it('cancels a job by id', async () => {
      mockApi.post.mockResolvedValueOnce({ data: { id: 'job-123', status: 'cancelled' } })

      const result = await cancelJob('job-123')

      expect(mockApi.post).toHaveBeenCalledWith('/jobs/job-123/cancel')
      expect(result.status).toBe('cancelled')
    })
  })

  describe('pauseQueue', () => {
    it('pauses the queue', async () => {
      mockApi.post.mockResolvedValueOnce({ data: { paused: true } })

      await pauseQueue()

      expect(mockApi.post).toHaveBeenCalledWith('/control/pause')
    })
  })

  describe('resumeQueue', () => {
    it('resumes the queue', async () => {
      mockApi.post.mockResolvedValueOnce({ data: { paused: false } })

      await resumeQueue()

      expect(mockApi.post).toHaveBeenCalledWith('/control/resume')
    })
  })
})
