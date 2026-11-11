/**
 * Describes the current unstaking wait — confirmed on testnet, 2026-11-10
 * (docs/SPEC.md, "Unstaking timing", nimiq.dev/protocol/validators/
 * stakers): a stake change takes effect at the next election block
 * (`inactiveFrom` on the staker record), then the inactive funds are
 * locked for one further epoch (`blocksPerEpoch`, read live, never
 * hardcoded) counted from `inactiveFrom`.
 *
 * Never names the "release block" to the user — the two user-facing phases
 * are a plain time estimate ('locked') and a plain "it's ready now"
 * statement ('ready'), once the release block has passed.
 */

export type WaitingPhase = 'beforeInactive' | 'locked' | 'ready'

export interface WaitingState {
  phase: WaitingPhase
  text: string
  /** Only present for 'locked' — there's no time estimate to caveat before that. */
  caveat?: string
}

const JAIL_CAVEAT = 'This is an estimate. It can take longer if the validator is jailed.'

/** release block = inactiveFrom + blocksPerEpoch (the base case, no jailing). */
export function releaseBlock(inactiveFrom: number, blocksPerEpoch: number): number {
  return inactiveFrom + blocksPerEpoch
}

/** ~1 block ≈ 1 second (docs/SPEC.md, chain policy facts). An honest estimate, never an exact time. */
export function aboutDuration(blocks: number): string {
  const totalMinutes = Math.round(blocks / 60)
  if (totalMinutes < 60) {
    const minutes = Math.max(1, totalMinutes)
    return `${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`
  }
  const hours = Math.round(totalMinutes / 60)
  return `${hours} ${hours === 1 ? 'hour' : 'hours'}`
}

/**
 * `blockNumber` is the current chain height; `inactiveFrom` is the staker
 * record's field of the same name; `blocksPerEpoch` is read live from
 * getPolicyConstants, null if that read failed.
 */
export function describeWaitingState(blockNumber: number, inactiveFrom: number, blocksPerEpoch: number | null): WaitingState {
  if (blockNumber < inactiveFrom) {
    return { phase: 'beforeInactive', text: 'Starts at the next epoch.' }
  }
  if (blocksPerEpoch === null) {
    return { phase: 'locked', text: 'Locked. The wait time isn\'t available right now.' }
  }
  const blocksRemaining = releaseBlock(inactiveFrom, blocksPerEpoch) - blockNumber
  if (blocksRemaining <= 0) {
    return { phase: 'ready', text: 'Can move back to your wallet. This takes two approvals.' }
  }
  return { phase: 'locked', text: `Locked until about ${aboutDuration(blocksRemaining)} from now.`, caveat: JAIL_CAVEAT }
}
