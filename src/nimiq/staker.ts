import type { NimiqProvider } from './provider'

/**
 * Combined staker state across every address from listAccounts. Shared by
 * the home screen (what to show) and the stake sheet (create-vs-add, and
 * polling for confirmation) so both read chain state the same way.
 */
export interface CombinedStaker {
  earningLuna: bigint
  waitingLuna: bigint
  releasedLuna: bigint
  /** Latest inactiveFrom among holders with a waiting balance, for the countdown. */
  latestInactiveFrom: number | null
  /** The delegation of whichever holder is actively earning, or any holder with one set. */
  delegation: string | null
  holders: string[]
  /** True if any address's lookup failed for a reason other than "never staked". */
  anyError: boolean
}

interface StakerLookup {
  address: string
  active: bigint
  inactive: bigint
  retired: bigint
  inactiveFrom: number | null
  delegation: string | null
  error: boolean
}

async function lookupOne(nimiq: NimiqProvider, address: string): Promise<StakerLookup> {
  try {
    const staker = await nimiq.request<{
      balance?: number
      inactiveBalance?: number
      inactiveFrom?: number | null
      retiredBalance?: number
      delegation?: string | null
    } | null>({ method: 'getStakerByAddress', params: [address] })

    return {
      address,
      active: BigInt(staker?.balance ?? 0),
      inactive: BigInt(staker?.inactiveBalance ?? 0),
      retired: BigInt(staker?.retiredBalance ?? 0),
      inactiveFrom: staker?.inactiveFrom ?? null,
      delegation: staker?.delegation ?? null,
      error: false,
    }
  }
  catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const noStaker = /no staker with address/i.test(message)
    if (!noStaker) {
      console.error(`Could not load staker state for ${address}:`, error)
    }
    return { address, active: 0n, inactive: 0n, retired: 0n, inactiveFrom: null, delegation: null, error: !noStaker }
  }
}

/**
 * Reads getStakerByAddress for every given address and combines them. Only
 * checks what listAccounts gave us — a stake can be registered under a
 * different address entirely (see docs/SPEC.md, testnet observations, NQ59
 * vs NQ41).
 */
export async function readCombinedStaker(nimiq: NimiqProvider, addresses: string[]): Promise<CombinedStaker> {
  const results = await Promise.all(addresses.map(addr => lookupOne(nimiq, addr)))

  let earningLuna = 0n
  let waitingLuna = 0n
  let releasedLuna = 0n
  let latestInactiveFrom: number | null = null
  const holders: string[] = []
  let anyError = false

  for (const r of results) {
    if (r.error)
      anyError = true
    if (r.active > 0n || r.inactive > 0n || r.retired > 0n)
      holders.push(r.address)
    earningLuna += r.active
    waitingLuna += r.inactive
    releasedLuna += r.retired
    if (r.inactive > 0n && r.inactiveFrom !== null) {
      latestInactiveFrom = latestInactiveFrom === null ? r.inactiveFrom : Math.max(latestInactiveFrom, r.inactiveFrom)
    }
  }

  const delegation = results.find(r => r.active > 0n && r.delegation)?.delegation
    ?? results.find(r => r.delegation)?.delegation
    ?? null

  return { earningLuna, waitingLuna, releasedLuna, latestInactiveFrom, delegation, holders, anyError }
}
