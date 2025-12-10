import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useMetrics } from './useMetrics'
import * as client from '../api/client'
import { mockMetrics } from '../test/mocks'

vi.mock('../api/client', () => ({
  api: {
    get: vi.fn(),
  },
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

describe('useMetrics', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.resetAllMocks()
  })

  it('returns metrics data on success', async () => {
    vi.mocked(client.api.get).mockResolvedValueOnce({ data: mockMetrics })

    const { result } = renderHook(() => useMetrics(), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })

    expect(result.current.data).toEqual(mockMetrics)
  })

  it('returns null on error', async () => {
    vi.mocked(client.api.get).mockRejectedValueOnce(new Error('Failed'))

    const { result } = renderHook(() => useMetrics(), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })

    // The hook catches errors and returns null
    expect(result.current.data).toBeNull()
  })
})
