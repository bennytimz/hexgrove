/**
 * Sky condition from the user's own delegation validator, read from
 * getActiveValidators — a deviation from the spec's score-based sunny/
 * cloudy/stormy/dusk table, recorded in docs/SPEC.md. There is no
 * reliability score available (open question 9), so this is a plain
 * active/not-active signal. Never call it a "reliability score".
 */

export type SkyCondition = 'sunny' | 'stormy' | 'dusk'

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
 * `validator` is the getActiveValidators entry matching the delegation
 * address, or null if the lookup failed or no match was found — both
 * cases read as Dusk, never Stormy, per the spec's "no data" rule.
 */
export function computeSkyState(validator: ValidatorFields | null): SkyState {
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
