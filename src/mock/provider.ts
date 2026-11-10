import type { NimiqPayHostContext } from '@nimiq/mini-app-sdk'
import { NimiqProviderError } from '@nimiq/mini-app-sdk'

/**
 * Dev-only mock of the Nimiq Pay provider. Enabled by ?mock=1 (see README).
 * Never imported outside a `import.meta.env.DEV` branch, so it never reaches
 * the production bundle.
 */

export type MockFailMode =
  | 'notinpay' | 'timeout' | 'syncing' | 'declined'
  | 'stakeDeclined' | 'stakeNotSent' | 'stakeNetworkDown' | 'stakeMaybeSent' | 'stakeBlocked' | 'stakeTimedOut'
  | null

export const MOCK_ADDRESSES = [
  'NQ07 MOCK 0000 0000 0001 0000 0000 0000 0001', // earning
  'NQ26 MOCK 0000 0000 0002 0000 0000 0000 0002', // empty
  'NQ48 MOCK 0000 0000 0003 0000 0000 0000 0003', // waiting
] as const

export const MOCK_BALANCES_LUNA: Readonly<Record<string, number>> = {
  [MOCK_ADDRESSES[0]]: 11_000_000_000, // 110,000 NIM
  [MOCK_ADDRESSES[1]]: 0,
  [MOCK_ADDRESSES[2]]: 0,
}

/** The validator MOCK_ADDRESSES[0] delegates to — active, highest stakers, so sky reads Sunny and the chooser defaults to it. */
export const MOCK_VALIDATOR_ADDRESS = 'NQ35 MOCK VALD 0000 0000 0000 0000 0000 0001'
/** A second, retired validator, so the chooser's "browse" list has more than one entry. */
export const MOCK_VALIDATOR_ADDRESS_2 = 'NQ58 MOCK VALD 0000 0000 0000 0000 0000 0002'

export const MOCK_BLOCK_NUMBER = 1_000_000
/** Inactive balance for MOCK_ADDRESSES[2]: 50 NIM, released about an hour from MOCK_BLOCK_NUMBER (1 block ~ 1 second). */
export const MOCK_WAITING_INACTIVE_LUNA = 5_000_000
export const MOCK_WAITING_INACTIVE_FROM = MOCK_BLOCK_NUMBER + 3600

/** Just past provider.ts's default 10s init() timeout, so the first connect fails. */
export const MOCK_TIMEOUT_DELAY_MS = 11_000

/** getPolicyConstants().minimumStake, confirmed on testnet, 2026-11-09: 10,000,000 Luna = 100 NIM. */
export const MOCK_MINIMUM_STAKE_LUNA = 10_000_000

function notImplemented(method: string) {
  return async (): Promise<never> => {
    throw new Error(`Mock provider: "${method}" is not mocked yet.`)
  }
}

interface MockStakerRecord {
  balance: number
  delegation: string | null
  inactiveBalance: number
  inactiveFrom: number | null
  retiredBalance: number
}

/**
 * `?mock=1&nostake=1` forces every mock address to report no staker, so the
 * create-staker flow (normally unreachable since MOCK_ADDRESSES[0] is
 * pre-staked) can be exercised. Independent of `fail`/`&fail=`.
 */
function initialStakerState(noStake: boolean): Record<string, MockStakerRecord | null> {
  if (noStake) {
    return {
      [MOCK_ADDRESSES[0]]: null,
      [MOCK_ADDRESSES[1]]: null,
      [MOCK_ADDRESSES[2]]: null,
    }
  }
  return {
    [MOCK_ADDRESSES[0]]: {
      balance: MOCK_BALANCES_LUNA[MOCK_ADDRESSES[0]],
      delegation: MOCK_VALIDATOR_ADDRESS,
      inactiveBalance: 0,
      inactiveFrom: null,
      retiredBalance: 0,
    },
    [MOCK_ADDRESSES[1]]: null,
    [MOCK_ADDRESSES[2]]: {
      balance: 0,
      delegation: null,
      inactiveBalance: MOCK_WAITING_INACTIVE_LUNA,
      inactiveFrom: MOCK_WAITING_INACTIVE_FROM,
      retiredBalance: 0,
    },
  }
}

/**
 * The six TxOutcome failure shapes (see docs/SPEC.md, Errors and copy, and
 * src/lib/txOutcome.ts). Thrown by the staking calls below when `failMode`
 * requests one of them.
 *
 * `stakeTimedOut`'s message mirrors the one actually seen on testnet,
 * 2026-11-09 — from the probe's `sendSetActiveStakeTransaction`, not from
 * a real stake approval. Its cause is unconfirmed: leaving a real approval
 * open 2+ minutes did not reproduce it (2026-11-10). Simulated here only
 * so the "never an immediate retry" UI behavior stays testable.
 */
function throwStakeFailure(failMode: MockFailMode): void {
  switch (failMode) {
    case 'stakeDeclined':
      throw new NimiqProviderError('PERMISSION_DENIED', 'The user declined the request.', 4001)
    case 'stakeNotSent':
      throw new NimiqProviderError('INVALID_TRANSACTION', 'Bad params.', -32602)
    case 'stakeNetworkDown':
      throw new NimiqProviderError('NETWORK_ERROR', 'The network could not be reached.', -32000)
    case 'stakeMaybeSent':
      throw new NimiqProviderError('TRANSACTION_OUTCOME_UNKNOWN', 'Submission may have occurred.', -32001)
    case 'stakeBlocked':
      throw new NimiqProviderError('INTERNAL_ERROR', 'A transaction is still pending. Wait for it to resolve before sending another.', -32603)
    case 'stakeTimedOut':
      throw new NimiqProviderError('INTERNAL_ERROR', 'Failed to send payment transaction: Operation timed out after 30000 milliseconds', -32603)
  }
}

/**
 * Builds the fake provider object. Typed loosely (not as the SDK's full
 * NimiqProvider interface) because that interface is structurally tied to a
 * class with a private field, which a plain mock object can never satisfy;
 * the cast happens once, at the point this gets assigned to window.nimiq.
 */
export function createMockProvider(failMode: MockFailMode, noStake = false) {
  let consensusCalls = 0
  const stakerState = initialStakerState(noStake)

  const provider = {
    async listAccounts(): Promise<string[]> {
      if (failMode === 'declined') {
        throw new NimiqProviderError('PERMISSION_DENIED', 'The user declined the request.', 4001)
      }
      return [...MOCK_ADDRESSES]
    },
    async getBalance(address: string): Promise<number> {
      return MOCK_BALANCES_LUNA[address] ?? 0
    },
    async isConsensusEstablished(): Promise<boolean> {
      consensusCalls += 1
      if (failMode === 'syncing') {
        return consensusCalls > 1
      }
      return true
    },
    async getBlockNumber(): Promise<number> {
      return MOCK_BLOCK_NUMBER
    },
    getNetwork(): string {
      return 'testnet'
    },
    get connected(): boolean {
      return true
    },
    async connect(): Promise<void> {},
    disconnect(): void {},
    setRPCUrl(): void {},
    on() {
      return provider
    },
    once() {
      return provider
    },
    sign: notImplemented('sign'),
    sendBasicTransaction: notImplemented('sendBasicTransaction'),
    sendBasicTransactionWithData: notImplemented('sendBasicTransactionWithData'),
    payLightningInvoice: notImplemented('payLightningInvoice'),
    async sendNewStakerTransaction({ delegation, value }: { delegation: string, value: number }): Promise<string> {
      throwStakeFailure(failMode)
      const existing = stakerState[MOCK_ADDRESSES[0]]
      stakerState[MOCK_ADDRESSES[0]] = {
        balance: (existing?.balance ?? 0) + value,
        delegation,
        inactiveBalance: existing?.inactiveBalance ?? 0,
        inactiveFrom: existing?.inactiveFrom ?? null,
        retiredBalance: existing?.retiredBalance ?? 0,
      }
      return 'mock-tx-hash-new-staker'
    },
    async sendStakeTransaction({ value }: { value: number }): Promise<string> {
      throwStakeFailure(failMode)
      const existing = stakerState[MOCK_ADDRESSES[0]]
      stakerState[MOCK_ADDRESSES[0]] = {
        balance: (existing?.balance ?? 0) + value,
        delegation: existing?.delegation ?? MOCK_VALIDATOR_ADDRESS,
        inactiveBalance: existing?.inactiveBalance ?? 0,
        inactiveFrom: existing?.inactiveFrom ?? null,
        retiredBalance: existing?.retiredBalance ?? 0,
      }
      return 'mock-tx-hash-add-stake'
    },
    sendSetActiveStakeTransaction: notImplemented('sendSetActiveStakeTransaction'),
    sendUpdateStakerTransaction: notImplemented('sendUpdateStakerTransaction'),
    sendRetireStakeTransaction: notImplemented('sendRetireStakeTransaction'),
    sendRemoveStakeTransaction: notImplemented('sendRemoveStakeTransaction'),
    async request<T>(args: { method: string, params?: unknown[] | object }): Promise<T> {
      if (args.method === 'getStakerByAddress') {
        const address = Array.isArray(args.params) ? args.params[0] : undefined
        const record = typeof address === 'string' ? stakerState[address] : undefined
        if (record) {
          return { ...record } as T
        }
        // Mirrors the real node's reporting of "never staked" as an RPC error.
        throw new Error(`getStakerByAddress: no staker with address ${address}`)
      }
      if (args.method === 'getActiveValidators') {
        return [
          { address: MOCK_VALIDATOR_ADDRESS, numStakers: 420, retired: false, inactivityFlag: null, jailedFrom: null },
          { address: MOCK_VALIDATOR_ADDRESS_2, numStakers: 12, retired: true, inactivityFlag: null, jailedFrom: null },
        ] as T
      }
      if (args.method === 'getPolicyConstants') {
        return { minimumStake: MOCK_MINIMUM_STAKE_LUNA } as T
      }
      return notImplemented('request')()
    },
    getRPC: notImplemented('getRPC'),
    setRPC: notImplemented('setRPC'),
  }

  return provider
}

function mockHostContext(): NimiqPayHostContext {
  return {
    network: 'testnet',
    requestFullscreen: async () => {},
    exitFullscreen: async () => {},
    getFullscreen: async () => false,
    onFullscreenChange: () => () => {},
    requestDeviceIdentifier: async () => '0'.repeat(64),
  }
}

export function installMockProvider(failMode: MockFailMode, noStake = false): void {
  // A plain mock object can never satisfy window.nimiq's declared type (a
  // class with a private field), so the escape hatch is local to this file.
  const win = window as unknown as { nimiq?: unknown, nimiqPay?: unknown }

  if (failMode === 'notinpay') {
    console.info('[mock] Simulating "not inside Nimiq Pay": window.nimiq will never be injected.')
    return
  }

  if (failMode === 'timeout') {
    console.info(`[mock] Simulating a slow provider: window.nimiq appears after ${MOCK_TIMEOUT_DELAY_MS}ms.`)
    setTimeout(() => {
      win.nimiq = createMockProvider(failMode, noStake)
      win.nimiqPay = mockHostContext()
    }, MOCK_TIMEOUT_DELAY_MS)
    return
  }

  win.nimiq = createMockProvider(failMode, noStake)
  win.nimiqPay = mockHostContext()
}
