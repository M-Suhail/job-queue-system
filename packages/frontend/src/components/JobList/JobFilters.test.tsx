import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '../../test/test-utils'
import userEvent from '@testing-library/user-event'
import JobFilters from './JobFilters'

describe('JobFilters', () => {
  it('renders search input', () => {
    render(<JobFilters />)

    expect(screen.getByPlaceholderText('Search by id, type, or payload')).toBeInTheDocument()
  })

  it('renders status select with all options', () => {
    render(<JobFilters />)

    const select = screen.getByRole('combobox')
    expect(select).toBeInTheDocument()

    expect(screen.getByText('All Statuses')).toBeInTheDocument()
    expect(screen.getByText('Pending')).toBeInTheDocument()
    expect(screen.getByText('In progress')).toBeInTheDocument()
    expect(screen.getByText('Succeeded')).toBeInTheDocument()
    expect(screen.getByText('Failed')).toBeInTheDocument()
    expect(screen.getByText('Dead letter')).toBeInTheDocument()
    expect(screen.getByText('Cancelled')).toBeInTheDocument()
  })

  it('calls onChange with query when typing in search', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()

    render(<JobFilters onChange={onChange} />)

    const input = screen.getByPlaceholderText('Search by id, type, or payload')
    await user.type(input, 'email')

    expect(onChange).toHaveBeenCalled()
    expect(onChange).toHaveBeenLastCalledWith({ q: 'email' })
  })

  it('calls onChange with status when selecting from dropdown', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()

    render(<JobFilters onChange={onChange} />)

    const select = screen.getByRole('combobox')
    await user.selectOptions(select, 'pending')

    expect(onChange).toHaveBeenCalledWith({ status: 'pending' })
  })

  it('shows advanced filters when clicking More Filters button', async () => {
    const user = userEvent.setup()
    render(<JobFilters />)

    // Advanced filters should be hidden initially
    expect(screen.queryByText('Created after:')).not.toBeInTheDocument()

    // Click to show
    await user.click(screen.getByText('▶ More Filters'))

    // Advanced filters should now be visible
    expect(screen.getByText('Created after:')).toBeInTheDocument()
    expect(screen.getByText('Created before:')).toBeInTheDocument()
    expect(screen.getByText('Min attempts:')).toBeInTheDocument()
    expect(screen.getByText('Max attempts:')).toBeInTheDocument()
  })

  it('works without onChange prop', async () => {
    const user = userEvent.setup()

    render(<JobFilters />)

    const input = screen.getByPlaceholderText('Search by id, type, or payload')
    // Should not throw
    await user.type(input, 'test')

    expect(input).toHaveValue('test')
  })
})
