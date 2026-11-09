import { describe, expect, it } from 'vitest'
import { computeWateringState, localDayKey, waterToday } from './watering'

describe('localDayKey', () => {
  it('formats a zero-padded local date', () => {
    expect(localDayKey(new Date(2026, 0, 5))).toBe('2026-01-05')
    expect(localDayKey(new Date(2026, 10, 30))).toBe('2026-11-30')
  })
})

describe('computeWateringState', () => {
  const now = new Date(2026, 10, 9, 15, 0, 0)

  it('is unwatered with no streak when nothing is stored', () => {
    expect(computeWateringState(null, now)).toEqual({ watered: false, streak: 0 })
  })

  it('is watered and keeps the streak when already watered today', () => {
    expect(computeWateringState({ lastWateredDay: '2026-11-09', streak: 5 }, now))
      .toEqual({ watered: true, streak: 5 })
  })

  it('is unwatered but keeps the streak when the last tap was yesterday', () => {
    expect(computeWateringState({ lastWateredDay: '2026-11-08', streak: 5 }, now))
      .toEqual({ watered: false, streak: 5 })
  })

  it('resets the streak to zero when more than a day was missed', () => {
    expect(computeWateringState({ lastWateredDay: '2026-11-06', streak: 5 }, now))
      .toEqual({ watered: false, streak: 0 })
  })
})

describe('waterToday', () => {
  const now = new Date(2026, 10, 9, 15, 0, 0)

  it('starts a streak of 1 from nothing', () => {
    expect(waterToday(null, now)).toEqual({ lastWateredDay: '2026-11-09', streak: 1 })
  })

  it('continues the streak from yesterday', () => {
    expect(waterToday({ lastWateredDay: '2026-11-08', streak: 6 }, now))
      .toEqual({ lastWateredDay: '2026-11-09', streak: 7 })
  })

  it('restarts the streak at 1 after a missed day', () => {
    expect(waterToday({ lastWateredDay: '2026-11-06', streak: 6 }, now))
      .toEqual({ lastWateredDay: '2026-11-09', streak: 1 })
  })

  it('is a no-op if already watered today', () => {
    const stored = { lastWateredDay: '2026-11-09', streak: 3 }
    expect(waterToday(stored, now)).toEqual(stored)
  })
})
