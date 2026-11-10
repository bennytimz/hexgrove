/**
 * Estimated Nimiq staking reward rate. Non-compounded, 365-day annual
 * estimate — never a guarantee, never shown as a guaranteed figure.
 *
 * Method: the Staking Rewards Nimiq methodology
 * (docs.stakingrewards.com/staking-data/methodologies/nimiq-srb):
 *   network_rate = (supply(now + 365d) - supply(now)) / active_stake
 *   validator_rate = network_rate * (1 - fee)
 *
 * The supply curve, its constants, and active_stake's definition were all
 * verified against core-rs-albatross (branch `albatross`), not guessed:
 * - `primitives/src/policy.rs`: TOTAL_SUPPLY, SUPPLY_DECAY, and `supply_at`
 *   (`supply(t) = total_supply - (total_supply - genesis_supply) *
 *   supply_decay^t`, t in milliseconds since the PoS genesis block).
 * - `genesis/src/genesis/main-albatross.toml`: the mainnet genesis block's
 *   `supply` (1,289,310,965,406,244 Luna — matches this app's
 *   GENESIS_SUPPLY_LUNA exactly) and `timestamp`. The timestamp there is
 *   2024-11-19T16:45:20Z, not the 16:00:00Z commonly quoted elsewhere — a
 *   45m20s difference, which changes supply(t) by roughly 0.001% (utterly
 *   negligible against SUPPLY_DECAY's ~3.97e-12-per-ms rate). Used the
 *   exact on-chain value here since it was available.
 * - active_stake: "total stake of validators eligible for slot election
 *   (no inactivity flag, not retired)" — this app already has exactly that
 *   concept as `isValidatorHealthy()` (src/lib/sky.ts), so it's reused
 *   rather than redefined. Summed from `getActiveValidators`' `balance`
 *   field across every healthy entry.
 *
 * Cross-checked, 2026-11-10: this module's networkRate() against today's
 * real genesis constants and a live total-staked figure (9.29B NIM, from
 * stakingrewards.com/asset/nimiq) gives ~8.03%, against their own published
 * ~8.11% APY — 0.08 percentage points apart, well inside the ~1pp bar for
 * shipping this. See docs/SPEC.md for the full note.
 */

/** core-rs-albatross policy.rs TOTAL_SUPPLY, in Luna (21,000,000,000 NIM). */
export const TOTAL_SUPPLY_LUNA = 2_100_000_000_000_000
/** core-rs-albatross policy.rs SUPPLY_DECAY — the per-millisecond decay base. */
export const SUPPLY_DECAY_PER_MS = 0.9999999999960264
/** Mainnet genesis block's `supply` field, in Luna (12,893,109,654.06244 NIM). */
export const GENESIS_SUPPLY_LUNA = 1_289_310_965_406_244
/** Mainnet genesis block's `timestamp` field. */
export const GENESIS_TIME_MS = Date.parse('2024-11-19T16:45:20Z')

const MS_PER_YEAR = 365 * 24 * 60 * 60 * 1000

/**
 * supply(t) per policy.rs's `supply_at`, computed the same way the protocol
 * does: in f64, truncated toward zero at the end (Rust's `as u64`). Luna.
 * Always mainnet — this app has no reason to estimate yield on testnet.
 */
export function supplyAtLuna(nowMs: number): number {
  if (nowMs < GENESIS_TIME_MS)
    throw new RangeError('nowMs must be at or after the Nimiq PoS genesis time')
  const elapsedMs = nowMs - GENESIS_TIME_MS
  const decayed = (TOTAL_SUPPLY_LUNA - GENESIS_SUPPLY_LUNA) * SUPPLY_DECAY_PER_MS ** elapsedMs
  return TOTAL_SUPPLY_LUNA - Math.trunc(decayed)
}

export interface ActiveValidatorFields {
  balance?: unknown
  retired?: boolean
  inactivityFlag?: unknown
  jailedFrom?: unknown
}

/**
 * Total stake held by election-eligible validators (not jailed, not
 * retired, no inactivity flag) — the Staking Rewards methodology's
 * `active_stake`. Takes `isHealthy` as a parameter (callers pass this
 * app's own src/lib/sky.ts isValidatorHealthy) rather than importing it
 * here, so the two concepts share one definition without coupling this
 * pure module to sky.ts.
 */
export function totalActiveStakeLuna(
  validators: readonly ActiveValidatorFields[],
  isHealthy: (v: ActiveValidatorFields) => boolean,
): number {
  let sum = 0
  for (const v of validators) {
    if (typeof v.balance === 'number' && isHealthy(v))
      sum += v.balance
  }
  return sum
}

/**
 * Non-compounded annual network reward rate (a fraction, e.g. 0.08 = 8%).
 * Null when active_stake is missing or not positive (nothing to divide by)
 * — never shown as 0%, since that would read as "no yield" rather than
 * "unknown".
 */
export function networkRate(nowMs: number, activeStakeLuna: number): number | null {
  if (!(activeStakeLuna > 0))
    return null
  const supplyNow = supplyAtLuna(nowMs)
  const supplyInOneYear = supplyAtLuna(nowMs + MS_PER_YEAR)
  return (supplyInOneYear - supplyNow) / activeStakeLuna
}

/** A validator's own rate after its fee. Null if either input is missing. */
export function validatorRate(netRate: number | null, feeFraction: number | null): number | null {
  if (netRate === null || feeFraction === null)
    return null
  return netRate * (1 - feeFraction)
}

/** Estimated reward over one year for a given stake, at a given rate. Null if the rate is unknown. Luna in, Luna out. */
export function estimatedYearlyRewardLuna(stakeLuna: number, rate: number | null): number | null {
  if (rate === null)
    return null
  return stakeLuna * rate
}
