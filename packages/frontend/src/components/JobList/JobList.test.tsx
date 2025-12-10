import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '../../test/test-utils'
import JobList from './JobList'
import { mockJobs } from '../../test/mocks'

describe('JobList', () => {
  it('renders list of jobs', () => {
    const onSelect = vi.fn()
    render(<JobList jobs={mockJobs} onSelect={onSelect} />)

    expect(screen.getByText('email')).toBeInTheDocument()
    expect(screen.getByText('sms')).toBeInTheDocument()
    expect(screen.getByText('webhook')).toBeInTheDocument()
    expect(screen.getByText('process')).toBeInTheDocument()
  })

  it('shows "No jobs found" when jobs array is empty', () => {
    const onSelect = vi.fn()
    render(<JobList jobs={[]} onSelect={onSelect} />)

    expect(screen.getByText('No jobs found')).toBeInTheDocument()
  })

  it('shows "No jobs found" when jobs is null/undefined', () => {
    const onSelect = vi.fn()
    // @ts-expect-error Testing null case
    render(<JobList jobs={null} onSelect={onSelect} />)

    expect(screen.getByText('No jobs found')).toBeInTheDocument()
  })

  it('handles non-array input gracefully', () => {
    const onSelect = vi.fn()
    // @ts-expect-error Testing invalid input
    render(<JobList jobs={{ not: 'an array' }} onSelect={onSelect} />)

    expect(screen.getByText('No jobs found')).toBeInTheDocument()
  })

  it('renders correct number of job rows', () => {
    const onSelect = vi.fn()
    render(<JobList jobs={mockJobs} onSelect={onSelect} />)

    const viewButtons = screen.getAllByText('View')
    expect(viewButtons).toHaveLength(mockJobs.length)
  })
})
