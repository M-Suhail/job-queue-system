import { describe, it, expect } from 'vitest'
import { timeAgo } from './date'

describe('timeAgo', () => {
  it('returns empty string for undefined input', () => {
    expect(timeAgo(undefined)).toBe('')
  })

  it('returns empty string for empty string input', () => {
    expect(timeAgo('')).toBe('')
  })

  it('returns seconds for times less than 60 seconds ago', () => {
    const now = new Date()
    const thirtySecsAgo = new Date(now.getTime() - 30 * 1000).toISOString()
    expect(timeAgo(thirtySecsAgo)).toBe('30s')
  })

  it('returns minutes for times between 1-59 minutes ago', () => {
    const now = new Date()
    const fiveMinAgo = new Date(now.getTime() - 5 * 60 * 1000).toISOString()
    expect(timeAgo(fiveMinAgo)).toBe('5m')
  })

  it('returns hours for times 60+ minutes ago', () => {
    const now = new Date()
    const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString()
    expect(timeAgo(twoHoursAgo)).toBe('2h')
  })

  it('rounds to nearest second/minute/hour', () => {
    const now = new Date()
    const ninetyMinsAgo = new Date(now.getTime() - 90 * 60 * 1000).toISOString()
    // 90 mins = 1.5 hours, rounds to 2h
    expect(timeAgo(ninetyMinsAgo)).toBe('2h')
  })
})
