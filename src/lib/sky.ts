/**
 * Sky condition from the user's own delegation validator.
 *
 * The chain-RPC active/jailed/retired check (`getActiveValidators`) is
 * always the first word: a currently jailed, retired or inactive validator
 * is always Stormy, with the specific reason. When Nimiq's validator
 * directory (the Validators API — see src/nimiq/validatorsApi.ts) also has
 * a reliability score for the validator, on top of that it's used for the
 * spec's original Sunny/Cloudy/Stormy score table, confirmed reachable on
 * both networks 2026-11-10 (docs/SPEC.md, open question 9). Without a
 * score, this falls back to the plain active/not-active signal this app
 * has used since the score wasn't available — additive, not a replacement.
 */

export type SkyCondition = 'sunny' | 'cloudy' | 'stormy' | 'dusk'

export interface SkyState {
  condition: SkyCondition
  label: string
}

export interface ValidatorFields {
  retired?: boolean
  inactivityFlag?: unknown
  jailedFrom?: unknown
}

const DUSK: SkyState = { condition: 'dusk', label: "Can't check your validator right now" }

/**
 * The Validators API's score is 0-1; the spec's original table was written
 * as 0-100 (Sunny 85+, Cloudy 60-84, Stormy below 60) — scaled here, not
 * re-derived.
 */
export const SCORE_SUNNY_THRESHOLD = 0.85
export const SCORE_CLOUDY_THRESHOLD = 0.60

/**
 * `validator` is the getActiveValidators entry matching the delegation
 * address, or null if the lookup failed or no match was found — both
 * cases read as Dusk, never Stormy, per the spec's "no data" rule.
 *
 * `scoreTotal` is the Validators API's 0-1 reliability score for the same
 * validator, or null/omitted when that API is unreachable or has no entry
 * for it — falls back to the plain active signal, unchanged from before
 * the score existed.
 */
export function computeSkyState(validator: ValidatorFields | null, scoreTotal: number | null = null): SkyState {
  if (!validator) {
    return DUSK
  }
  if (validator.jailedFrom != null) {
    return { condition: 'stormy', label: 'Your validator is jailed right now' }
  }
  if (validator.retired) {
    return { condition: 'stormy', label: 'Your validator has retired' }
  }
  if (validator.inactivityFlag != null) {
    return { condition: 'stormy', label: 'Your validator is inactive right now' }
  }
  if (scoreTotal != null) {
    if (scoreTotal >= SCORE_SUNNY_THRESHOLD) {
      return { condition: 'sunny', label: 'Your validator is reliable' }
    }
    if (scoreTotal >= SCORE_CLOUDY_THRESHOLD) {
      return { condition: 'cloudy', label: 'Worth a second look' }
    }
    return { condition: 'stormy', label: "Your validator's reliability has dropped" }
  }
  return { condition: 'sunny', label: 'Your validator is active' }
}

/** Nimiq addresses can have inconsistent spacing; compare them ignoring it. */
export function compactAddress(address: string): string {
  return address.replace(/\s+/g, '').toUpperCase()
}

/** Same rule as computeSkyState's Sunny branch, as a plain boolean — used to pick a sensible default in the validator chooser. */
export function isValidatorHealthy(validator: ValidatorFields): boolean {
  return validator.jailedFrom == null && !validator.retired && validator.inactivityFlag == null
}
