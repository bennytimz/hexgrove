import { NimiqProviderError } from '@nimiq/mini-app-sdk'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { classifyTxError } from '../lib/txOutcome'
import {
  installMockProvider,
  MOCK_ADDRESSES,
  MOCK_BLOCK_NUMBER,
  MOCK_MINIMUM_STAKE_LUNA,
  MOCK_TIMEOUT_DELAY_MS,
  MOCK_VALIDATOR_ADDRESS,
  MOCK_VALIDATOR_ADDRESS_2,
  MOCK_WAITING_INACTIVE_FROM,
  MOCK_WAITING_INACTIVE_LUNA,
} from './provider'

interface StubWindow {
  nimiq?: unknown
  nimiqPay?: unknown
}

let win: StubWindow

beforeEach(() => {
  win = {}
  vi.stubGlobal('window', win)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('installMockProvider', () => {
  it('installs a working provider by default', async () => {
    installMockProvider(null)
    const nimiq = win.nimiq as any

    expect(nimiq).toBeDefined()
    await expect(nimiq.listAccounts()).resolves.toEqual([...MOCK_ADDRESSES])
    await expect(nimiq.getBalance(MOCK_ADDRESSES[0])).resolves.toBe(11_000_000_000)
    await expect(nimiq.getBalance(MOCK_ADDRESSES[1])).resolves.toBe(0)
    await expect(nimiq.isConsensusEstablished()).resolves.toBe(true)
    expect((win.nimiqPay as any).network).toBe('testnet')
  })

  it('rejects listAccounts with a declined NimiqProviderError in "declined" mode', async () => {
    installMockProvider('declined')
    const nimiq = win.nimiq as any

    await expect(nimiq.listAccounts()).rejects.toSatisfy((error: unknown) => {
      return NimiqProviderError.is(error) && error.type === 'PERMISSION_DENIED'
    })
  })

  it('reports consensus as not established once, then established, in "syncing" mode', async () => {
    installMockProvider('syncing')
    const nimiq = win.nimiq as any

    await expect(nimiq.isConsensusEstablished()).resolves.toBe(false)
    await expect(nimiq.isConsensusEstablished()).resolves.toBe(true)
    await expect(nimiq.isConsensusEstablished()).resolves.toBe(true)
  })

  it('never injects window.nimiq in "notinpay" mode', () => {
    vi.useFakeTimers()
    installMockProvider('notinpay')

    expect(win.nimiq).toBeUndefined()
    vi.advanceTimersByTime(60_000)
    expect(win.nimiq).toBeUndefined()
  })

  it('injects window.nimiq only after the timeout delay in "timeout" mode', () => {
    vi.useFakeTimers()
    installMockProvider('timeout')

    expect(win.nimiq).toBeUndefined()

    vi.advanceTimersByTime(MOCK_TIMEOUT_DELAY_MS - 1)
    expect(win.nimiq).toBeUndefined()

    vi.advanceTimersByTime(1)
    expect(win.nimiq).toBeDefined()
    expect((win.nimiqPay as any).network).toBe('testnet')
  })

  it('throws a clear "not mocked yet" error for calls with no staking-flow use', async () => {
    installMockProvider(null)
    const nimiq = win.nimiq as any

    await expect(nimiq.sign('hello')).rejects.toThrow(/not mocked yet/i)
  })

  it('answers request("getStakerByAddress") for the staked and the empty mock address', async () => {
    installMockProvider(null)
    const nimiq = win.nimiq as any

    const staker = await nimiq.request({ method: 'getStakerByAddress', params: [MOCK_ADDRESSES[0]] })
    expect(staker.balance).toBe(11_000_000_000)

    await expect(nimiq.request({ method: 'getStakerByAddress', params: [MOCK_ADDRESSES[1]] }))
      .rejects.toThrow(/no staker with address/i)
  })

  it('answers request("getStakerByAddress") with a waiting balance for the third mock address', async () => {
    installMockProvider(null)
    const nimiq = win.nimiq as any

    const staker = await nimiq.request({ method: 'getStakerByAddress', params: [MOCK_ADDRESSES[2]] })
    expect(staker.balance).toBe(0)
    expect(staker.inactiveBalance).toBe(MOCK_WAITING_INACTIVE_LUNA)
    expect(staker.inactiveFrom).toBe(MOCK_WAITING_INACTIVE_FROM)
    expect(staker.inactiveFrom).toBeGreaterThan(MOCK_BLOCK_NUMBER)
    await expect(nimiq.getBlockNumber()).resolves.toBe(MOCK_BLOCK_NUMBER)
  })

  it('throws "not mocked yet" for any other request() method', async () => {
    installMockProvider(null)
    const nimiq = win.nimiq as any

    await expect(nimiq.request({ method: 'getAccountByAddress' })).rejects.toThrow(/not mocked yet/i)
  })

  it('delegates the staked mock address to an active validator, for sky testing', async () => {
    installMockProvider(null)
    const nimiq = win.nimiq as any

    const staker = await nimiq.request({ method: 'getStakerByAddress', params: [MOCK_ADDRESSES[0]] })
    expect(staker.delegation).toBe(MOCK_VALIDATOR_ADDRESS)

    const validators = await nimiq.request({ method: 'getActiveValidators' })
    expect(validators).toEqual([
      { address: MOCK_VALIDATOR_ADDRESS, numStakers: 420, retired: false, inactivityFlag: null, jailedFrom: null },
      { address: MOCK_VALIDATOR_ADDRESS_2, numStakers: 12, retired: true, inactivityFlag: null, jailedFrom: null },
    ])
  })

  it('answers getPolicyConstants with the confirmed testnet minimum stake', async () => {
    installMockProvider(null)
    const nimiq = win.nimiq as any

    const policy = await nimiq.request({ method: 'getPolicyConstants' })
    expect(policy.minimumStake).toBe(MOCK_MINIMUM_STAKE_LUNA)
  })

  describe('nostake', () => {
    it('reports no staker for every address when noStake is true, for the create flow', async () => {
      installMockProvider(null, true)
      const nimiq = win.nimiq as any

      for (const address of MOCK_ADDRESSES) {
        await expect(nimiq.request({ method: 'getStakerByAddress', params: [address] }))
          .rejects.toThrow(/no staker with address/i)
      }
      // Spendable balance is untouched, so a create-stake transaction is still testable.
      await expect(nimiq.getBalance(MOCK_ADDRESSES[0])).resolves.toBe(11_000_000_000)
    })
  })

  describe('staking transactions', () => {
    it('creates a staker, visible to a later getStakerByAddress, when none exists yet', async () => {
      installMockProvider(null, true)
      const nimiq = win.nimiq as any

      await nimiq.sendNewStakerTransaction({ delegation: MOCK_VALIDATOR_ADDRESS_2, value: 10_000_000 })

      const staker = await nimiq.request({ method: 'getStakerByAddress', params: [MOCK_ADDRESSES[0]] })
      expect(staker.balance).toBe(10_000_000)
      expect(staker.delegation).toBe(MOCK_VALIDATOR_ADDRESS_2)
    })

    it('adds to the existing staker, keeping its delegation', async () => {
      installMockProvider(null)
      const nimiq = win.nimiq as any

      const before = await nimiq.request({ method: 'getStakerByAddress', params: [MOCK_ADDRESSES[0]] })
      await nimiq.sendStakeTransaction({ value: 10_000_000 })

      const after = await nimiq.request({ method: 'getStakerByAddress', params: [MOCK_ADDRESSES[0]] })
      expect(after.balance).toBe(before.balance + 10_000_000)
      expect(after.delegation).toBe(before.delegation)
    })

    const stakeFailModes = [
      ['stakeDeclined', 'declined'],
      ['stakeNotSent', 'notSent'],
      ['stakeNetworkDown', 'networkDown'],
      ['stakeMaybeSent', 'maybeSent'],
      ['stakeBlocked', 'blocked'],
      ['stakeTimedOut', 'timedOut'],
    ] as const

    it.each(stakeFailModes)('"%s" makes both staking calls throw an error that classifies as "%s"', async (failMode, expectedOutcome) => {
      installMockProvider(failMode, true)
      const nimiq = win.nimiq as any

      await expect(nimiq.sendNewStakerTransaction({ delegation: MOCK_VALIDATOR_ADDRESS, value: 10_000_000 }))
        .rejects.toSatisfy((error: unknown) => classifyTxError(error) === expectedOutcome)
      await expect(nimiq.sendStakeTransaction({ value: 10_000_000 }))
        .rejects.toSatisfy((error: unknown) => classifyTxError(error) === expectedOutcome)
    })

    it('leaves listAccounts and getBalance unaffected by stake-specific fail modes', async () => {
      installMockProvider('stakeDeclined')
      const nimiq = win.nimiq as any

      await expect(nimiq.listAccounts()).resolves.toEqual([...MOCK_ADDRESSES])
      await expect(nimiq.getBalance(MOCK_ADDRESSES[0])).resolves.toBe(11_000_000_000)
    })
  })
})
