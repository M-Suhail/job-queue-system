import { describe, it, expect } from 'vitest'
import { render, screen } from '../../test/test-utils'
import Header from './Header'

describe('Header', () => {
  it('renders the title', () => {
    render(<Header />)

    expect(screen.getByText('Job Queue Dashboard')).toBeInTheDocument()
  })

  it('renders the subtitle', () => {
    render(<Header />)

    expect(screen.getByText('Real-time job processing overview')).toBeInTheDocument()
  })

  it('has proper structure with header element', () => {
    render(<Header />)

    const header = screen.getByRole('banner')
    expect(header).toBeInTheDocument()
    expect(header).toHaveClass('bg-white', 'shadow')
  })
})
