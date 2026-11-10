import { describe, expect, it } from 'vitest'
import {
  estimatedYearlyRewardLuna,
  GENESIS_SUPPLY_LUNA,
  GENESIS_TIME_MS,
  networkRate,
  supplyAtLuna,
  TOTAL_SUPPLY_LUNA,
  totalActiveStakeLuna,
  validatorRate,
} from './yield'

describe('supplyAtLuna', () => {
  it('is exactly the genesis supply at the genesis time', () => {
    expect(supplyAtLuna(GENESIS_TIME_MS)).toBe(GENESIS_SUPPLY_LUNA)
  })

  it('increases over time, approaching the total supply', () => {
    const oneYearLater = GENESIS_TIME_MS + 365 * 24 * 60 * 60 * 1000
    const supply = supplyAtLuna(oneYearLater)
    expect(supply).toBeGreaterThan(GENESIS_SUPPLY_LUNA)
    expect(supply).toBeLessThan(TOTAL_SUPPLY_LUNA)
  })

  it('never exceeds the total supply, even far in the future', () => {
    const farFuture = GENESIS_TIME_MS + 200 * 365 * 24 * 60 * 60 * 1000
    expect(supplyAtLuna(farFuture)).toBeLessThanOrEqual(TOTAL_SUPPLY_LUNA)
  })

  it('rejects a time before the PoS genesis', () => {
    expect(() => supplyAtLuna(GENESIS_TIME_MS - 1)).toThrow(RangeError)
  })

  it('matches a hand-computed value one year after genesis', () => {
    // supply(t) = total - (total - genesis) * decay^t, t = 1 year in ms.
    const t = 365 * 24 * 60 * 60 * 1000
    const expected = TOTAL_SUPPLY_LUNA - Math.trunc((TOTAL_SUPPLY_LUNA - GENESIS_SUPPLY_LUNA) * 0.9999999999960264 ** t)
    expect(supplyAtLuna(GENESIS_TIME_MS + t)).toBe(expected)
  })
})

describe('totalActiveStakeLuna', () => {
  const isHealthy = (v: { retired?: boolean, inactivityFlag?: unknown, jailedFrom?: unknown }) =>
    v.jailedFrom == null && !v.retired && v.inactivityFlag == null

  it('sums balances of healthy validators only', () => {
    const validators = [
      { balance: 1000, retired: false, inactivityFlag: null, jailedFrom: null },
      { balance: 500, retired: true, inactivityFlag: null, jailedFrom: null }, // excluded
      { balance: 2000, retired: false, inactivityFlag: null, jailedFrom: 123 }, // excluded
      { balance: 300, retired: false, inactivityFlag: null, jailedFrom: null },
    ]
    expect(totalActiveStakeLuna(validators, isHealthy)).toBe(1300)
  })

  it('ignores entries with a missing or non-numeric balance', () => {
    const validators = [
      { retired: false, inactivityFlag: null, jailedFrom: null },
      { balance: 'nope' as unknown, retired: false, inactivityFlag: null, jailedFrom: null },
      { balance: 100, retired: false, inactivityFlag: null, jailedFrom: null },
    ]
    expect(totalActiveStakeLuna(validators, isHealthy)).toBe(100)
  })

  it('is zero for an empty list', () => {
    expect(totalActiveStakeLuna([], isHealthy)).toBe(0)
  })
})

describe('networkRate', () => {
  it('is null when active stake is zero, negative, or missing', () => {
    expect(networkRate(GENESIS_TIME_MS, 0)).toBeNull()
    expect(networkRate(GENESIS_TIME_MS, -1)).toBeNull()
  })

  it('is positive and well under 100% for a realistic active stake', () => {
    // ~9.29 billion NIM, in Luna — the real total staked, 2026-11-10 (see src/lib/yield.ts).
    const realisticActiveStakeLuna = 9_290_000_000 * 100_000
    const now = Date.parse('2026-11-10T00:00:00Z')
    const rate = networkRate(now, realisticActiveStakeLuna)
    expect(rate).not.toBeNull()
    expect(rate!).toBeGreaterThan(0)
    expect(rate!).toBeLessThan(1)
    // Cross-checked against stakingrewards.com's published ~8.11% APY (2026-11-10): ~8.03%, see src/lib/yield.ts.
    expect(rate!).toBeGreaterThan(0.07)
    expect(rate!).toBeLessThan(0.09)
  })

  it('scales inversely with active stake', () => {
    const now = Date.parse('2026-11-10T00:00:00Z')
    const smaller = networkRate(now, 1_000_000 * 100_000)!
    const larger = networkRate(now, 2_000_000 * 100_000)!
    expect(smaller).toBeCloseTo(larger * 2, 5)
  })
})

describe('validatorRate', () => {
  it('reduces the network rate by the validator fee', () => {
    expect(validatorRate(0.08, 0.05)).toBeCloseTo(0.076, 10)
    expect(validatorRate(0.08, 0)).toBeCloseTo(0.08, 10)
  })

  it('is null when either input is missing', () => {
    expect(validatorRate(null, 0.05)).toBeNull()
    expect(validatorRate(0.08, null)).toBeNull()
    expect(validatorRate(null, null)).toBeNull()
  })
})

describe('estimatedYearlyRewardLuna', () => {
  it('multiplies stake by rate', () => {
    expect(estimatedYearlyRewardLuna(100_000_000, 0.08)).toBeCloseTo(8_000_000, 5)
  })

  it('is null when the rate is unknown', () => {
    expect(estimatedYearlyRewardLuna(100_000_000, null)).toBeNull()
  })

  it('is zero for zero stake, not null — a real, known answer', () => {
    expect(estimatedYearlyRewardLuna(0, 0.08)).toBe(0)
  })
})
