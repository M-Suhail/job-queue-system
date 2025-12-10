import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '../../test/test-utils'
import userEvent from '@testing-library/user-event'
import JobRow from './JobRow'
import { mockJob } from '../../test/mocks'

describe('JobRow', () => {
  it('renders job information', () => {
    const onView = vi.fn()
    render(<JobRow job={mockJob} onView={onView} />)

    expect(screen.getByText('email')).toBeInTheDocument()
    expect(screen.getByText('id: job-123')).toBeInTheDocument()
    expect(screen.getByText('pending')).toBeInTheDocument()
  })

  it('calls onView when View button is clicked', async () => {
    const user = userEvent.setup()
    const onView = vi.fn()
    render(<JobRow job={mockJob} onView={onView} />)

    await user.click(screen.getByText('View'))

    expect(onView).toHaveBeenCalledTimes(1)
  })

  it('displays correct status pill for pending', () => {
    render(<JobRow job={{ ...mockJob, status: 'pending' }} onView={vi.fn()} />)
    const pill = screen.getByText('pending')
    expect(pill).toHaveClass('bg-yellow-100', 'text-yellow-800')
  })

  it('displays correct status pill for in_progress', () => {
    render(<JobRow job={{ ...mockJob, status: 'in_progress' }} onView={vi.fn()} />)
    const pill = screen.getByText('in_progress')
    expect(pill).toHaveClass('bg-blue-100', 'text-blue-800')
  })

  it('displays correct status pill for succeeded', () => {
    render(<JobRow job={{ ...mockJob, status: 'succeeded' }} onView={vi.fn()} />)
    const pill = screen.getByText('succeeded')
    expect(pill).toHaveClass('bg-green-100', 'text-green-800')
  })

  it('displays correct status pill for failed', () => {
    render(<JobRow job={{ ...mockJob, status: 'failed' }} onView={vi.fn()} />)
    const pill = screen.getByText('failed')
    expect(pill).toHaveClass('bg-amber-100', 'text-amber-800')
  })

  it('displays correct status pill for dead_letter', () => {
    render(<JobRow job={{ ...mockJob, status: 'dead_letter' }} onView={vi.fn()} />)
    const pill = screen.getByText('dead_letter')
    expect(pill).toHaveClass('bg-red-100', 'text-red-800')
  })

  it('displays correct status pill for cancelled', () => {
    render(<JobRow job={{ ...mockJob, status: 'cancelled' }} onView={vi.fn()} />)
    const pill = screen.getByText('cancelled')
    expect(pill).toHaveClass('bg-gray-100', 'text-gray-800')
  })

  it('formats created_at time', () => {
    render(<JobRow job={mockJob} onView={vi.fn()} />)
    // The time should be displayed (exact format depends on locale)
    const timeElement = screen.getByText(/\d{1,2}:\d{2}/)
    expect(timeElement).toBeInTheDocument()
  })

  it('handles missing created_at gracefully', () => {
    const jobWithoutDate = { ...mockJob, created_at: undefined }
    render(<JobRow job={jobWithoutDate} onView={vi.fn()} />)
    // Should not throw and should render
    expect(screen.getByText('email')).toBeInTheDocument()
  })
})
