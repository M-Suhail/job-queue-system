import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '../test/test-utils'
import MetricsPanel from './MetricsPanel'
import * as client from '../api/client'
import { mockMetrics } from '../test/mocks'

vi.mock('../api/client', () => ({
  api: {
    get: vi.fn(),
  },
}))

describe('MetricsPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('displays metrics values when data is available', async () => {
    vi.mocked(client.api.get).mockResolvedValueOnce({ data: mockMetrics })

    render(<MetricsPanel />)

    await waitFor(() => {
      expect(screen.getByText('15')).toBeInTheDocument() // queue_depth
    })

    expect(screen.getByText('3')).toBeInTheDocument() // in_progress
    expect(screen.getByText('142')).toBeInTheDocument() // succeeded
    expect(screen.getByText('2')).toBeInTheDocument() // dead_letter
  })

  it('displays labels for each metric', async () => {
    vi.mocked(client.api.get).mockResolvedValueOnce({ data: mockMetrics })

    render(<MetricsPanel />)

    await waitFor(() => {
      expect(screen.getByText('Queue depth')).toBeInTheDocument()
    })

    expect(screen.getByText('In progress')).toBeInTheDocument()
    expect(screen.getByText('Succeeded')).toBeInTheDocument()
    expect(screen.getByText('Dead letter')).toBeInTheDocument()
  })

  it('shows "-" when no data is available', async () => {
    vi.mocked(client.api.get).mockRejectedValueOnce(new Error('Failed'))

    render(<MetricsPanel />)

    await waitFor(() => {
      const dashes = screen.getAllByText('-')
      expect(dashes.length).toBeGreaterThanOrEqual(4)
    })
  })

  it('displays Metrics title', () => {
    vi.mocked(client.api.get).mockResolvedValueOnce({ data: mockMetrics })

    render(<MetricsPanel />)

    expect(screen.getByText('Metrics')).toBeInTheDocument()
  })

  it('shows Prometheus hint', () => {
    vi.mocked(client.api.get).mockResolvedValueOnce({ data: mockMetrics })

    render(<MetricsPanel />)

    expect(screen.getByText(/For full metrics use Prometheus/)).toBeInTheDocument()
  })
})
