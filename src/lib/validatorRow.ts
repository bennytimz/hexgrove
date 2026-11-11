/**
 * Read-only wording for one row of the Validators list (ValidatorsSheet.vue).
 * Pure, so the honesty rules below are unit-tested rather than living in a
 * template.
 *
 * No-false-storm rule, same as the garden sky (src/lib/sky.ts): only the
 * chain RPC can make a validator look unhealthy. A missing reliability
 * score (Validators API unreachable, or no entry for this validator) never
 * reads as Stormy or "Not active"; it falls back to the plain chain answer.
 */

import { compactAddress, conditionForScore } from './sky'
import { validatorRate } from './yield'

export interface ValidatorRowInput {
  address: string
  /** From getActiveValidators: not jailed, not retired, no inactivity flag. */
  healthy: boolean
  feeFraction: number | null
  scoreTotal: number | null
  dominanceRatio: number | null
}

export interface ValidatorRowStatus {
  /** Null when there's no score to grade, so no weather color is shown. */
  condition: 'sunny' | 'cloudy' | 'stormy' | null
  /** Always present: the text label that goes with any color. */
  text: string
}

/** 0.0523 → "5%", 0.004 → "0.4%". Same format the stake sheet uses for reliability and network share. */
export function formatFraction(fraction: number): string {
  return `${(fraction * 100).toFixed(fraction < 0.01 ? 1 : 0)}%`
}

/** 0.025 → "2.5%", 0.05 → "5%". One decimal only when the fee isn't a whole percent. */
export function formatFeePercent(fraction: number): string {
  const percent = Math.round(fraction * 1000) / 10
  return `${Number.isInteger(percent) ? percent : percent.toFixed(1)}%`
}

/** 0.0811 → "8.1%". Always one decimal, so fee differences between validators stay visible. Only for the list's yearly rate; the home screen's NIM estimate is rounded separately. */
export function formatRatePercent(rate: number): string {
  return `${(rate * 100).toFixed(1)}%`
}

const WORD = { sunny: 'Sunny', cloudy: 'Cloudy', stormy: 'Stormy' } as const

export function describeValidatorStatus(v: Pick<ValidatorRowInput, 'healthy' | 'scoreTotal'>): ValidatorRowStatus {
  if (!v.healthy)
    return { condition: 'stormy', text: 'Not active' }
  if (v.scoreTotal === null)
    return { condition: null, text: 'Active' }
  const condition = conditionForScore(v.scoreTotal)
  return { condition, text: `${WORD[condition]}, ${formatFraction(v.scoreTotal)} reliability` }
}

/** Fee, network share and estimated yearly rate, whichever are known. Missing ones are left out, never shown as 0. */
export function validatorFacts(v: ValidatorRowInput, netRate: number | null): string[] {
  const facts: string[] = []
  if (v.feeFraction !== null)
    facts.push(`${formatFeePercent(v.feeFraction)} fee`)
  if (v.dominanceRatio !== null)
    facts.push(`${formatFraction(v.dominanceRatio)} of network`)
  const rate = validatorRate(netRate, v.feeFraction)
  if (rate !== null)
    facts.push(`~${formatRatePercent(rate)} a year`)
  return facts
}

/** True when this row is the validator the user's stake is delegated to. */
export function isCurrentValidator(address: string, delegation: string | null): boolean {
  return delegation !== null && compactAddress(address) === compactAddress(delegation)
}
