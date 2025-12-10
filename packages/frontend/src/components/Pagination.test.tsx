import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '../test/test-utils'
import userEvent from '@testing-library/user-event'
import Pagination from './Pagination'

describe('Pagination', () => {
  it('renders nothing when totalPages is 1', () => {
    const onPageChange = vi.fn()
    const { container } = render(
      <Pagination currentPage={1} totalPages={1} onPageChange={onPageChange} />
    )

    expect(container.firstChild).toBeNull()
  })

  it('renders pagination controls when totalPages > 1', () => {
    const onPageChange = vi.fn()
    render(
      <Pagination currentPage={1} totalPages={5} onPageChange={onPageChange} />
    )

    expect(screen.getByText('Page 1 of 5')).toBeInTheDocument()
    expect(screen.getByText('Previous')).toBeInTheDocument()
    expect(screen.getByText('Next')).toBeInTheDocument()
  })

  it('disables Previous button on first page', () => {
    const onPageChange = vi.fn()
    render(
      <Pagination currentPage={1} totalPages={5} onPageChange={onPageChange} />
    )

    expect(screen.getByText('Previous')).toBeDisabled()
    expect(screen.getByText('Next')).not.toBeDisabled()
  })

  it('disables Next button on last page', () => {
    const onPageChange = vi.fn()
    render(
      <Pagination currentPage={5} totalPages={5} onPageChange={onPageChange} />
    )

    expect(screen.getByText('Previous')).not.toBeDisabled()
    expect(screen.getByText('Next')).toBeDisabled()
  })

  it('calls onPageChange with correct page when clicking Next', async () => {
    const user = userEvent.setup()
    const onPageChange = vi.fn()
    render(
      <Pagination currentPage={2} totalPages={5} onPageChange={onPageChange} />
    )

    await user.click(screen.getByText('Next'))

    expect(onPageChange).toHaveBeenCalledWith(3)
  })

  it('calls onPageChange with correct page when clicking Previous', async () => {
    const user = userEvent.setup()
    const onPageChange = vi.fn()
    render(
      <Pagination currentPage={3} totalPages={5} onPageChange={onPageChange} />
    )

    await user.click(screen.getByText('Previous'))

    expect(onPageChange).toHaveBeenCalledWith(2)
  })

  it('calls onPageChange when clicking a page number', async () => {
    const user = userEvent.setup()
    const onPageChange = vi.fn()
    render(
      <Pagination currentPage={1} totalPages={5} onPageChange={onPageChange} />
    )

    await user.click(screen.getByText('3'))

    expect(onPageChange).toHaveBeenCalledWith(3)
  })

  it('highlights current page', () => {
    const onPageChange = vi.fn()
    render(
      <Pagination currentPage={3} totalPages={5} onPageChange={onPageChange} />
    )

    const currentPageButton = screen.getByText('3')
    expect(currentPageButton).toHaveClass('bg-blue-600', 'text-white')
  })

  it('disables buttons when loading', () => {
    const onPageChange = vi.fn()
    render(
      <Pagination currentPage={2} totalPages={5} onPageChange={onPageChange} isLoading={true} />
    )

    expect(screen.getByText('Previous')).toBeDisabled()
    expect(screen.getByText('Next')).toBeDisabled()
  })

  it('shows ellipsis for many pages', () => {
    const onPageChange = vi.fn()
    render(
      <Pagination currentPage={5} totalPages={10} onPageChange={onPageChange} />
    )

    const ellipses = screen.getAllByText('...')
    expect(ellipses.length).toBeGreaterThanOrEqual(1)
  })
})
