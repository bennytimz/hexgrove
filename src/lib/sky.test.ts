import { describe, expect, it } from 'vitest'
import { compactAddress, computeSkyState } from './sky'

describe('computeSkyState', () => {
  it('is Dusk with no reliability-score wording when the validator is null (lookup failed or not found)', () => {
    const state = computeSkyState(null)
    expect(state.condition).toBe('dusk')
    expect(state.label.toLowerCase()).not.toContain('score')
  })

  it('is Sunny when active, not retired, not inactive, not jailed', () => {
    const state = computeSkyState({ retired: false, inactivityFlag: null, jailedFrom: null })
    expect(state.condition).toBe('sunny')
    expect(state.label).toBe('Your validator is active')
  })

  it('is Stormy and says why when jailed', () => {
    const state = computeSkyState({ retired: false, inactivityFlag: null, jailedFrom: 12345 })
    expect(state.condition).toBe('stormy')
    expect(state.label.toLowerCase()).toContain('jailed')
  })

  it('is Stormy and says why when retired', () => {
    const state = computeSkyState({ retired: true, inactivityFlag: null, jailedFrom: null })
    expect(state.condition).toBe('stormy')
    expect(state.label.toLowerCase()).toContain('retired')
  })

  it('is Stormy and says why when inactive', () => {
    const state = computeSkyState({ retired: false, inactivityFlag: 98765, jailedFrom: null })
    expect(state.condition).toBe('stormy')
    expect(state.label.toLowerCase()).toContain('inactive')
  })

  it('never produces a Cloudy state', () => {
    const inputs: Array<Parameters<typeof computeSkyState>[0]> = [
      null,
      { retired: false, inactivityFlag: null, jailedFrom: null },
      { retired: true, inactivityFlag: null, jailedFrom: null },
      { retired: false, inactivityFlag: 1, jailedFrom: null },
      { retired: false, inactivityFlag: null, jailedFrom: 1 },
    ]
    for (const input of inputs) {
      expect(computeSkyState(input).condition).not.toBe('cloudy')
    }
  })
})

describe('compactAddress', () => {
  it('strips whitespace and uppercases for comparison', () => {
    expect(compactAddress('NQ07 0000 0000')).toBe('NQ0700000000')
    expect(compactAddress('nq07 0000 0000')).toBe('NQ0700000000')
  })
})
