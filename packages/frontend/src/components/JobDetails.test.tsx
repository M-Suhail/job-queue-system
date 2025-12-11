import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '../test/test-utils'
import userEvent from '@testing-library/user-event'
import JobDetails from './JobDetails'
import * as client from '../api/client'
import { mockJob } from '../test/mocks'

vi.mock('../api/client', () => ({
  fetchJob: vi.fn(),
  cancelJob: vi.fn(),
}))

describe('JobDetails', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows placeholder when no job is selected', () => {
    render(<JobDetails jobId={null} />)

    expect(screen.getByText('Select a job to view details')).toBeInTheDocument()
  })

  it('shows loading state while fetching job', () => {
    vi.mocked(client.fetchJob).mockImplementation(
      () => new Promise(() => {}) // Never resolves
    )

    render(<JobDetails jobId="job-123" />)

    expect(screen.getByText('Loading...')).toBeInTheDocument()
  })

  it('displays job details when loaded', async () => {
    vi.mocked(client.fetchJob).mockResolvedValueOnce(mockJob)

    render(<JobDetails jobId="job-123" />)

    await waitFor(() => {
      expect(screen.getByText('ID: job-123')).toBeInTheDocument()
    })

    expect(screen.getByText('Type: email')).toBeInTheDocument()
    expect(screen.getByText('pending')).toBeInTheDocument()
    expect(screen.getByText('Attempts: 0/5')).toBeInTheDocument()
  })

  it('displays job payload as JSON', async () => {
    vi.mocked(client.fetchJob).mockResolvedValueOnce(mockJob)

    render(<JobDetails jobId="job-123" />)

    await waitFor(() => {
      expect(screen.getByText(/"to": "test@example.com"/)).toBeInTheDocument()
    })
  })

  it('shows error message on fetch error', async () => {
    vi.mocked(client.fetchJob).mockRejectedValueOnce(new Error('Not found'))

    render(<JobDetails jobId="job-123" />)

    await waitFor(() => {
      expect(screen.getByText('Error loading job')).toBeInTheDocument()
    })
  })

  it('displays last_error when present', async () => {
    const jobWithError = { ...mockJob, last_error: 'Connection timeout' }
    vi.mocked(client.fetchJob).mockResolvedValueOnce(jobWithError)

    render(<JobDetails jobId="job-123" />)

    await waitFor(() => {
      expect(screen.getByText('Last error: Connection timeout')).toBeInTheDocument()
    })
  })

  it('calls cancelJob when Cancel button is clicked', async () => {
    const user = userEvent.setup()
    vi.mocked(client.fetchJob).mockResolvedValueOnce(mockJob)
    vi.mocked(client.cancelJob).mockResolvedValueOnce({ id: 'job-123', status: 'cancelled' })

    render(<JobDetails jobId="job-123" />)

    await waitFor(() => {
      expect(screen.getByText('Cancel')).toBeInTheDocument()
    })

    await user.click(screen.getByText('Cancel'))

    expect(client.cancelJob).toHaveBeenCalledWith('job-123')
  })

  it('has Cancel button with correct styling', async () => {
    vi.mocked(client.fetchJob).mockResolvedValueOnce(mockJob)

    render(<JobDetails jobId="job-123" />)

    await waitFor(() => {
      const cancelButton = screen.getByText('Cancel')
      expect(cancelButton).toHaveClass('bg-yellow-600', 'text-white')
    })
  })

  it('shows Retry button for dead_letter jobs', async () => {
    vi.mocked(client.fetchJob).mockResolvedValueOnce({ ...mockJob, status: 'dead_letter' })

    render(<JobDetails jobId="job-123" />)

    await waitFor(() => {
      expect(screen.getByText('Retry')).toBeInTheDocument()
      expect(screen.getByText('Delete')).toBeInTheDocument()
    })
  })

  it('shows Delete button for completed jobs', async () => {
    vi.mocked(client.fetchJob).mockResolvedValueOnce({ ...mockJob, status: 'succeeded' })

    render(<JobDetails jobId="job-123" />)

    await waitFor(() => {
      expect(screen.getByText('Delete')).toBeInTheDocument()
      expect(screen.queryByText('Cancel')).not.toBeInTheDocument()
    })
  })
})
