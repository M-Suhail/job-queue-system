import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { QueryClient } from '@tanstack/react-query'
import { connectSocket, disconnectSocket } from './socket'
import { mockJob, mockJobs } from '../test/mocks'

// Mock socket.io-client
const mockSocket = {
  on: vi.fn(),
  disconnect: vi.fn(),
}

vi.mock('socket.io-client', () => ({
  io: vi.fn(() => mockSocket),
}))

describe('socket', () => {
  let queryClient: QueryClient

  beforeEach(() => {
    vi.clearAllMocks()
    queryClient = new QueryClient()
    // Reset the module's internal socket state
    disconnectSocket()
  })

  afterEach(() => {
    disconnectSocket()
  })

  describe('connectSocket', () => {
    it('creates a socket connection with baseUrl', async () => {
      const { io } = await import('socket.io-client')

      connectSocket('http://localhost:3000', queryClient)

      expect(io).toHaveBeenCalledWith('http://localhost:3000')
    })

    it('creates a socket connection without baseUrl', async () => {
      const { io } = await import('socket.io-client')

      connectSocket(undefined, queryClient)

      expect(io).toHaveBeenCalledWith()
    })

    it('returns existing socket if already connected', async () => {
      const { io } = await import('socket.io-client')

      const socket1 = connectSocket('http://localhost:3000', queryClient)
      const socket2 = connectSocket('http://localhost:3000', queryClient)

      expect(socket1).toBe(socket2)
      expect(io).toHaveBeenCalledTimes(1)
    })

    it('registers job_created event handler', () => {
      connectSocket('http://localhost:3000', queryClient)

      expect(mockSocket.on).toHaveBeenCalledWith('job_created', expect.any(Function))
    })

    it('registers job_updated event handler', () => {
      connectSocket('http://localhost:3000', queryClient)

      expect(mockSocket.on).toHaveBeenCalledWith('job_updated', expect.any(Function))
    })

    it('registers queue_paused event handler', () => {
      connectSocket('http://localhost:3000', queryClient)

      expect(mockSocket.on).toHaveBeenCalledWith('queue_paused', expect.any(Function))
    })

    it('registers queue_resumed event handler', () => {
      connectSocket('http://localhost:3000', queryClient)

      expect(mockSocket.on).toHaveBeenCalledWith('queue_resumed', expect.any(Function))
    })
  })

  describe('disconnectSocket', () => {
    it('disconnects the socket', () => {
      connectSocket('http://localhost:3000', queryClient)
      disconnectSocket()

      expect(mockSocket.disconnect).toHaveBeenCalled()
    })

    it('does nothing if socket is not connected', () => {
      disconnectSocket() // Should not throw

      expect(mockSocket.disconnect).not.toHaveBeenCalled()
    })

    it('allows reconnection after disconnect', async () => {
      const { io } = await import('socket.io-client')

      connectSocket('http://localhost:3000', queryClient)
      disconnectSocket()
      connectSocket('http://localhost:3000', queryClient)

      expect(io).toHaveBeenCalledTimes(2)
    })
  })

  describe('event handlers', () => {
    it('job_created prepends new job to query cache', () => {
      queryClient.setQueryData(['jobs'], mockJobs)
      connectSocket('http://localhost:3000', queryClient)

      // Get the job_created handler
      const jobCreatedHandler = mockSocket.on.mock.calls.find(
        (call) => call[0] === 'job_created'
      )?.[1]

      const newJob = { ...mockJob, id: 'new-job' }
      jobCreatedHandler(newJob)

      const cachedJobs = queryClient.getQueryData(['jobs']) as typeof mockJobs
      expect(cachedJobs[0].id).toBe('new-job')
    })

    it('job_updated updates existing job in cache', () => {
      queryClient.setQueryData(['jobs'], mockJobs)
      connectSocket('http://localhost:3000', queryClient)

      const jobUpdatedHandler = mockSocket.on.mock.calls.find(
        (call) => call[0] === 'job_updated'
      )?.[1]

      const updatedJob = { ...mockJobs[0], status: 'succeeded' as const }
      jobUpdatedHandler(updatedJob)

      const cachedJobs = queryClient.getQueryData(['jobs']) as typeof mockJobs
      const updated = cachedJobs.find((j) => j.id === mockJobs[0].id)
      expect(updated?.status).toBe('succeeded')
    })

    it('queue_paused updates paused state in cache', () => {
      connectSocket('http://localhost:3000', queryClient)

      const queuePausedHandler = mockSocket.on.mock.calls.find(
        (call) => call[0] === 'queue_paused'
      )?.[1]

      queuePausedHandler({ paused: true })

      expect(queryClient.getQueryData(['queue', 'paused'])).toBe(true)
    })

    it('queue_resumed updates paused state in cache', () => {
      queryClient.setQueryData(['queue', 'paused'], true)
      connectSocket('http://localhost:3000', queryClient)

      const queueResumedHandler = mockSocket.on.mock.calls.find(
        (call) => call[0] === 'queue_resumed'
      )?.[1]

      queueResumedHandler({ paused: false })

      expect(queryClient.getQueryData(['queue', 'paused'])).toBe(false)
    })
  })
})
