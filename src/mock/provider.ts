import type { NimiqPayHostContext } from '@nimiq/mini-app-sdk'
import { NimiqProviderError } from '@nimiq/mini-app-sdk'

/**
 * Dev-only mock of the Nimiq Pay provider. Enabled by ?mock=1 (see README).
 * Never imported outside a `import.meta.env.DEV` branch, so it never reaches
 * the production bundle.
 *
 * Staking methods are intentionally left unmocked: they will be mocked only
 * after their real behavior is confirmed on testnet.
 */

export type MockFailMode = 'notinpay' | 'timeout' | 'syncing' | 'declined' | null

export const MOCK_ADDRESSES = [
  'NQ07 MOCK 0000 0000 0001 0000 0000 0000 0001',
  'NQ26 MOCK 0000 0000 0002 0000 0000 0000 0002',
] as const

export const MOCK_BALANCES_LUNA: Readonly<Record<string, number>> = {
  [MOCK_ADDRESSES[0]]: 11_000_000_000, // 110,000 NIM
  [MOCK_ADDRESSES[1]]: 0,
}

/** Just past provider.ts's default 10s init() timeout, so the first connect fails. */
export const MOCK_TIMEOUT_DELAY_MS = 11_000

function notImplemented(method: string) {
  return async (): Promise<never> => {
    throw new Error(
      `Mock provider: "${method}" is not mocked yet. Staking calls are mocked only after their real behavior is confirmed on testnet.`,
    )
  }
}

/**
 * Builds the fake provider object. Typed loosely (not as the SDK's full
 * NimiqProvider interface) because that interface is structurally tied to a
 * class with a private field, which a plain mock object can never satisfy;
 * the cast happens once, at the point this gets assigned to window.nimiq.
 */
export function createMockProvider(failMode: MockFailMode) {
  let consensusCalls = 0

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
      return 1_000_000
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
    sendNewStakerTransaction: notImplemented('sendNewStakerTransaction'),
    sendStakeTransaction: notImplemented('sendStakeTransaction'),
    sendSetActiveStakeTransaction: notImplemented('sendSetActiveStakeTransaction'),
    sendUpdateStakerTransaction: notImplemented('sendUpdateStakerTransaction'),
    sendRetireStakeTransaction: notImplemented('sendRetireStakeTransaction'),
    sendRemoveStakeTransaction: notImplemented('sendRemoveStakeTransaction'),
    async request<T>(args: { method: string, params?: unknown[] | object }): Promise<T> {
      if (args.method === 'getStakerByAddress') {
        const address = Array.isArray(args.params) ? args.params[0] : undefined
        const balance = MOCK_BALANCES_LUNA[address as string] ?? 0
        if (balance > 0) {
          return { balance, delegation: null, inactiveBalance: 0, retiredBalance: 0 } as T
        }
        // Mirrors the real node's reporting of "never staked" as an RPC error.
        throw new Error(`getStakerByAddress: no staker with address ${address}`)
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

export function installMockProvider(failMode: MockFailMode): void {
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
      win.nimiq = createMockProvider(failMode)
      win.nimiqPay = mockHostContext()
    }, MOCK_TIMEOUT_DELAY_MS)
    return
  }

  win.nimiq = createMockProvider(failMode)
  win.nimiqPay = mockHostContext()
}
