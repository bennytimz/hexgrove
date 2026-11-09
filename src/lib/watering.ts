/**
 * Watering is visual only and never changes rewards. One tap per day, the
 * day boundary is the user's local midnight. Missing a day dims the plants
 * and resets the streak to zero (see docs/SPEC.md, "Watering and streaks").
 */

export interface StoredWatering {
  /** Local calendar day of the last tap, as YYYY-MM-DD. */
  lastWateredDay: string
  streak: number
}

export interface WateringState {
  watered: boolean
  streak: number
}

export function localDayKey(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function dayBefore(dayKey: string): string {
  const [y, m, d] = dayKey.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  date.setDate(date.getDate() - 1)
  return localDayKey(date)
}

/** Derives today's watering state from what was stored and the current time. */
export function computeWateringState(stored: StoredWatering | null, now: Date): WateringState {
  const today = localDayKey(now)

  if (!stored) {
    return { watered: false, streak: 0 }
  }
  if (stored.lastWateredDay === today) {
    return { watered: true, streak: stored.streak }
  }
  if (stored.lastWateredDay === dayBefore(today)) {
    // Not watered yet today, but yesterday's tap keeps the streak alive.
    return { watered: false, streak: stored.streak }
  }
  // More than a day since the last tap: a day was missed.
  return { watered: false, streak: 0 }
}

/** Call when the user taps "Water garden". Watering twice in one day is a no-op. */
export function waterToday(stored: StoredWatering | null, now: Date): StoredWatering {
  const state = computeWateringState(stored, now)
  if (state.watered) {
    return stored as StoredWatering
  }
  return { lastWateredDay: localDayKey(now), streak: state.streak + 1 }
}
