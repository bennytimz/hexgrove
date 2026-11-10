import { describe, expect, it } from 'vitest'
import { compactAddress, computeSkyState, isValidatorHealthy, SCORE_CLOUDY_THRESHOLD, SCORE_SUNNY_THRESHOLD } from './sky'

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

  it('never produces a Cloudy state without a score (the Validators API unreachable or no entry) — falls back to plain active/not-active', () => {
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

  describe('with a Validators API score', () => {
    const healthy = { retired: false, inactivityFlag: null, jailedFrom: null }

    it('is Sunny at or above the sunny threshold', () => {
      expect(computeSkyState(healthy, SCORE_SUNNY_THRESHOLD).condition).toBe('sunny')
      expect(computeSkyState(healthy, 1).condition).toBe('sunny')
    })

    it('is Cloudy between the cloudy and sunny thresholds', () => {
      expect(computeSkyState(healthy, SCORE_CLOUDY_THRESHOLD).condition).toBe('cloudy')
      expect(computeSkyState(healthy, (SCORE_SUNNY_THRESHOLD + SCORE_CLOUDY_THRESHOLD) / 2).condition).toBe('cloudy')
    })

    it('is Stormy below the cloudy threshold', () => {
      expect(computeSkyState(healthy, SCORE_CLOUDY_THRESHOLD - 0.01).condition).toBe('stormy')
      expect(computeSkyState(healthy, 0).condition).toBe('stormy')
    })

    it('still overrides to Stormy with the specific reason when jailed, retired or inactive, regardless of a high score', () => {
      const perfectScore = 1
      expect(computeSkyState({ retired: false, inactivityFlag: null, jailedFrom: 1 }, perfectScore).label.toLowerCase()).toContain('jailed')
      expect(computeSkyState({ retired: true, inactivityFlag: null, jailedFrom: null }, perfectScore).label.toLowerCase()).toContain('retired')
      expect(computeSkyState({ retired: false, inactivityFlag: 1, jailedFrom: null }, perfectScore).label.toLowerCase()).toContain('inactive')
    })

    it('ignores the score when the validator lookup itself failed (still Dusk, not Cloudy)', () => {
      expect(computeSkyState(null, 1).condition).toBe('dusk')
    })
  })
})

describe('isValidatorHealthy', () => {
  it('agrees with computeSkyState\'s Sunny/Stormy split', () => {
    const cases = [
      { retired: false, inactivityFlag: null, jailedFrom: null },
      { retired: true, inactivityFlag: null, jailedFrom: null },
      { retired: false, inactivityFlag: 1, jailedFrom: null },
      { retired: false, inactivityFlag: null, jailedFrom: 1 },
    ]
    for (const v of cases) {
      expect(isValidatorHealthy(v)).toBe(computeSkyState(v).condition === 'sunny')
    }
  })
})

describe('compactAddress', () => {
  it('strips whitespace and uppercases for comparison', () => {
    expect(compactAddress('NQ07 0000 0000')).toBe('NQ0700000000')
    expect(compactAddress('nq07 0000 0000')).toBe('NQ0700000000')
  })
})
