import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '../test/test-utils'
import userEvent from '@testing-library/user-event'
import Controls from './Controls'
import * as client from '../api/client'

vi.mock('../api/client', () => ({
  pauseQueue: vi.fn(),
  resumeQueue: vi.fn(),
}))

describe('Controls', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows Pause button initially', () => {
    render(<Controls />)

    expect(screen.getByText('Pause')).toBeInTheDocument()
    expect(screen.queryByText('Resume')).not.toBeInTheDocument()
  })

  it('calls pauseQueue and shows Resume button after clicking Pause', async () => {
    const user = userEvent.setup()
    vi.mocked(client.pauseQueue).mockResolvedValueOnce(undefined)

    render(<Controls />)

    await user.click(screen.getByText('Pause'))

    await waitFor(() => {
      expect(client.pauseQueue).toHaveBeenCalledTimes(1)
    })

    expect(screen.getByText('Resume')).toBeInTheDocument()
    expect(screen.queryByText('Pause')).not.toBeInTheDocument()
  })

  it('calls resumeQueue and shows Pause button after clicking Resume', async () => {
    const user = userEvent.setup()
    vi.mocked(client.pauseQueue).mockResolvedValueOnce(undefined)
    vi.mocked(client.resumeQueue).mockResolvedValueOnce(undefined)

    render(<Controls />)

    // First pause
    await user.click(screen.getByText('Pause'))
    await waitFor(() => {
      expect(screen.getByText('Resume')).toBeInTheDocument()
    })

    // Then resume
    await user.click(screen.getByText('Resume'))

    await waitFor(() => {
      expect(client.resumeQueue).toHaveBeenCalledTimes(1)
    })

    expect(screen.getByText('Pause')).toBeInTheDocument()
    expect(screen.queryByText('Resume')).not.toBeInTheDocument()
  })

  it('Pause button has correct styling', () => {
    render(<Controls />)

    const pauseButton = screen.getByText('Pause')
    expect(pauseButton).toHaveClass('bg-yellow-500', 'text-white')
  })

  it('Resume button has correct styling', async () => {
    const user = userEvent.setup()
    vi.mocked(client.pauseQueue).mockResolvedValueOnce(undefined)

    render(<Controls />)

    await user.click(screen.getByText('Pause'))

    await waitFor(() => {
      const resumeButton = screen.getByText('Resume')
      expect(resumeButton).toHaveClass('bg-green-600', 'text-white')
    })
  })
})
