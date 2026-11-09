import { describe, expect, it } from 'vitest'
import { formatWaitRemaining } from './waiting'

describe('formatWaitRemaining', () => {
  it('says "Ready soon" once the block has passed, with no time promised', () => {
    expect(formatWaitRemaining(0)).toBe('Ready soon')
    expect(formatWaitRemaining(-100)).toBe('Ready soon')
  })

  it('formats sub-hour gaps in minutes', () => {
    expect(formatWaitRemaining(10)).toBe('Ready in about 1 minute')
    expect(formatWaitRemaining(60)).toBe('Ready in about 1 minute')
    expect(formatWaitRemaining(59 * 60)).toBe('Ready in about 59 minutes')
  })

  it('formats hour-plus gaps in hours, singular and plural', () => {
    expect(formatWaitRemaining(3600)).toBe('Ready in about 1 hour')
    expect(formatWaitRemaining(11 * 3600)).toBe('Ready in about 11 hours')
  })
})
