import { describe, expect, it } from 'vitest'
import { nimToLuna } from './luna'
import { nextTier, plotsForStake } from './plots'

describe('plotsForStake', () => {
  it('returns 0 below the first tier', () => {
    expect(plotsForStake(0n)).toBe(0)
    expect(plotsForStake(nimToLuna('99.99999'))).toBe(0)
  })

  it('matches each tier boundary exactly', () => {
    expect(plotsForStake(nimToLuna('100'))).toBe(1)
    expect(plotsForStake(nimToLuna('4999.99999'))).toBe(1)
    expect(plotsForStake(nimToLuna('5000'))).toBe(3)
    expect(plotsForStake(nimToLuna('24999.99999'))).toBe(3)
    expect(plotsForStake(nimToLuna('25000'))).toBe(7)
    expect(plotsForStake(nimToLuna('99999.99999'))).toBe(7)
    expect(plotsForStake(nimToLuna('100000'))).toBe(12)
    expect(plotsForStake(nimToLuna('399999.99999'))).toBe(12)
    expect(plotsForStake(nimToLuna('400000'))).toBe(19)
  })

  it('caps at the highest tier for very large stakes', () => {
    expect(plotsForStake(nimToLuna('21000000000'))).toBe(19)
  })
})

describe('nextTier', () => {
  it('returns the first tier when nothing is staked', () => {
    expect(nextTier(0n)).toEqual({ plots: 1, thresholdLuna: nimToLuna('100') })
  })

  it('returns the next unreached tier from partway through one', () => {
    expect(nextTier(nimToLuna('100'))).toEqual({ plots: 3, thresholdLuna: nimToLuna('5000') })
    expect(nextTier(nimToLuna('100000'))).toEqual({ plots: 19, thresholdLuna: nimToLuna('400000') })
  })

  it('is null once at or above the top tier', () => {
    expect(nextTier(nimToLuna('400000'))).toBeNull()
    expect(nextTier(nimToLuna('21000000000'))).toBeNull()
  })
})
