import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useJobs } from './useJobs'
import * as client from '../api/client'
import { mockPaginatedJobs } from '../test/mocks'

vi.mock('../api/client', () => ({
  fetchJobs: vi.fn(),
}))

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
      },
    },
  })
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
}

describe('useJobs', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.resetAllMocks()
  })

  it('returns jobs data on success', async () => {
    vi.mocked(client.fetchJobs).mockResolvedValueOnce(mockPaginatedJobs)

    const { result } = renderHook(() => useJobs(), {
      wrapper: createWrapper(),
    })

    expect(result.current.isLoading).toBe(true)

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })

    expect(result.current.data).toEqual(mockPaginatedJobs)
    expect(client.fetchJobs).toHaveBeenCalledWith({ limit: 20 })
  })

  it('handles loading state', () => {
    vi.mocked(client.fetchJobs).mockImplementation(
      () => new Promise(() => {}) // Never resolves
    )

    const { result } = renderHook(() => useJobs(), {
      wrapper: createWrapper(),
    })

    expect(result.current.isLoading).toBe(true)
    expect(result.current.data).toBeUndefined()
  })

  it('handles error state', async () => {
    vi.mocked(client.fetchJobs).mockRejectedValueOnce(new Error('Failed to fetch'))

    const { result } = renderHook(() => useJobs(), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(result.current.isError).toBe(true)
    })

    expect(result.current.error).toBeInstanceOf(Error)
  })

  it('provides queryClient instance', () => {
    vi.mocked(client.fetchJobs).mockResolvedValueOnce(mockPaginatedJobs)

    const { result } = renderHook(() => useJobs(), {
      wrapper: createWrapper(),
    })

    expect(result.current.qc).toBeDefined()
  })
})
