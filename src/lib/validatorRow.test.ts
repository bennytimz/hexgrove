import { describe, expect, it } from 'vitest'
import { SCORE_CLOUDY_THRESHOLD, SCORE_SUNNY_THRESHOLD } from './sky'
import { describeValidatorStatus, formatFeePercent, formatFraction, formatRatePercent, isCurrentValidator, validatorFacts } from './validatorRow'

const base = { address: 'NQ07 0000 0000', healthy: true, feeFraction: null, scoreTotal: null, dominanceRatio: null }

describe('describeValidatorStatus', () => {
  it('uses the sky\'s Sunny/Cloudy/Stormy thresholds, with the score as text', () => {
    expect(describeValidatorStatus({ healthy: true, scoreTotal: SCORE_SUNNY_THRESHOLD })).toEqual({ condition: 'sunny', text: 'Sunny, 85% reliability' })
    expect(describeValidatorStatus({ healthy: true, scoreTotal: SCORE_CLOUDY_THRESHOLD })).toEqual({ condition: 'cloudy', text: 'Cloudy, 60% reliability' })
    expect(describeValidatorStatus({ healthy: true, scoreTotal: 0.3 })).toEqual({ condition: 'stormy', text: 'Stormy, 30% reliability' })
  })

  it('never reads as unhealthy just because the score is missing (no-false-storm rule)', () => {
    const status = describeValidatorStatus({ healthy: true, scoreTotal: null })
    expect(status.condition).toBeNull()
    expect(status.text).toBe('Active')
  })

  it('is Not active when the chain says so, whatever the score', () => {
    expect(describeValidatorStatus({ healthy: false, scoreTotal: 1 })).toEqual({ condition: 'stormy', text: 'Not active' })
    expect(describeValidatorStatus({ healthy: false, scoreTotal: null })).toEqual({ condition: 'stormy', text: 'Not active' })
  })
})

describe('validatorFacts', () => {
  it('lists fee, network share and yearly estimate when all are known', () => {
    const facts = validatorFacts({ ...base, feeFraction: 0.05, dominanceRatio: 0.015 }, 0.08)
    expect(facts).toEqual(['5% fee', '2% of network', '~7.6% a year'])
  })

  it('shows the yearly rate with one decimal, so fee differences are visible', () => {
    expect(validatorFacts({ ...base, feeFraction: 0.05 }, 0.0853)).toContain('~8.1% a year')
    expect(validatorFacts({ ...base, feeFraction: 0.1 }, 0.0853)).toContain('~7.7% a year')
  })

  it('leaves out anything unknown rather than showing 0', () => {
    expect(validatorFacts(base, 0.08)).toEqual([])
    expect(validatorFacts({ ...base, feeFraction: 0.05 }, null)).toEqual(['5% fee'])
  })
})

describe('formatters', () => {
  it('formatFeePercent keeps one decimal only when needed', () => {
    expect(formatFeePercent(0.05)).toBe('5%')
    expect(formatFeePercent(0.025)).toBe('2.5%')
  })

  it('formatFraction shows one decimal below 1%', () => {
    expect(formatFraction(0.004)).toBe('0.4%')
    expect(formatFraction(0.0523)).toBe('5%')
  })
})

describe('formatRatePercent', () => {
  it('always shows one decimal', () => {
    expect(formatRatePercent(0.0811)).toBe('8.1%')
    expect(formatRatePercent(0.08)).toBe('8.0%')
  })
})

describe('isCurrentValidator', () => {
  it('matches ignoring spacing and case', () => {
    expect(isCurrentValidator('NQ07 0000 0000', 'nq0700000000')).toBe(true)
    expect(isCurrentValidator('NQ07 0000 0000', 'NQ07 0000 0001')).toBe(false)
    expect(isCurrentValidator('NQ07 0000 0000', null)).toBe(false)
  })
})
