import type { NimiqProvider } from './provider'

export interface PolicyConstants {
  /** getPolicyConstants().minimumStake, in Luna. Confirmed on testnet, 2026-11-09: 10,000,000 (100 NIM). */
  minimumStakeLuna: bigint | null
  /**
   * getPolicyConstants().blocksPerEpoch — one epoch, confirmed on testnet,
   * 2026-11-09: 43,200 blocks (about 12 hours). Used as the unstaking
   * reporting window (docs/SPEC.md, "Unstaking timing" — DOCUMENTED, NOT
   * YET VERIFIED ON CHAIN). Never hardcode this value; always read it live.
   */
  blocksPerEpoch: number | null
}

/** Pure parse, so it's unit-tested directly rather than only through a live fetch. */
export function parsePolicyConstants(raw: unknown): PolicyConstants {
  const v = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {}
  return {
    minimumStakeLuna: typeof v.minimumStake === 'number' ? BigInt(v.minimumStake) : null,
    blocksPerEpoch: typeof v.blocksPerEpoch === 'number' ? v.blocksPerEpoch : null,
  }
}

/** Reads getPolicyConstants fresh every call — cheap, and this app never hardcodes chain policy. Resolves with nulls (never throws) if the read fails. */
export async function readPolicyConstants(nimiq: NimiqProvider): Promise<PolicyConstants> {
  try {
    const raw = await nimiq.request<unknown>({ method: 'getPolicyConstants' })
    return parsePolicyConstants(raw)
  }
  catch (error) {
    console.error('Could not load policy constants:', error)
    return { minimumStakeLuna: null, blocksPerEpoch: null }
  }
}
