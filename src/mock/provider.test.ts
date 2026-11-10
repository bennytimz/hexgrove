import { NimiqProviderError } from '@nimiq/mini-app-sdk'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { describeWaitingState, releaseBlock } from '../lib/waiting'
import { classifyTxError } from '../lib/txOutcome'
import {
  isMockWaitScenario,
  installMockProvider,
  MOCK_ADDRESSES,
  MOCK_BLOCK_NUMBER,
  MOCK_BLOCKS_PER_EPOCH,
  MOCK_MINIMUM_STAKE_LUNA,
  MOCK_TIMEOUT_DELAY_MS,
  MOCK_VALIDATOR_ADDRESS,
  MOCK_VALIDATOR_ADDRESS_2,
  MOCK_VALIDATOR_ADDRESS_3,
  MOCK_WAITING_INACTIVE_LUNA,
} from './provider'

interface StubWindow {
  nimiq?: unknown
  nimiqPay?: unknown
  fetch: unknown
}

let win: StubWindow

beforeEach(() => {
  // A real window always has fetch; installMockFetch() wraps it. The exact
  // response here doesn't matter — every test either hits the Validators
  // API (intercepted) or doesn't call fetch at all.
  win = { fetch: vi.fn().mockResolvedValue(new Response('[]', { status: 200 })) }
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

  it('answers request("getStakerByAddress") with a waiting balance for the third mock address, in the "locked" phase by default', async () => {
    installMockProvider(null)
    const nimiq = win.nimiq as any

    const staker = await nimiq.request({ method: 'getStakerByAddress', params: [MOCK_ADDRESSES[2]] })
    expect(staker.balance).toBe(0)
    expect(staker.inactiveBalance).toBe(MOCK_WAITING_INACTIVE_LUNA)
    // "locked": inactiveFrom has passed, but the release block (+blocksPerEpoch) hasn't.
    expect(staker.inactiveFrom).toBeLessThan(MOCK_BLOCK_NUMBER)
    expect(releaseBlock(staker.inactiveFrom, MOCK_BLOCKS_PER_EPOCH)).toBeGreaterThan(MOCK_BLOCK_NUMBER)
    expect(describeWaitingState(MOCK_BLOCK_NUMBER, staker.inactiveFrom, MOCK_BLOCKS_PER_EPOCH).phase).toBe('locked')
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
      { address: MOCK_VALIDATOR_ADDRESS_3, numStakers: 90, retired: false, inactivityFlag: null, jailedFrom: null },
    ])
  })

  describe('mocked Validators API (installMockFetch)', () => {
    it('answers a validators-api fetch with mock directory data, mirroring the reported mainnet inconsistency', async () => {
      installMockProvider(null)

      const response = await window.fetch('https://validators-api-main.je-cf9.workers.dev/api/v1/validators')
      const body = await response.json()

      expect(body).toEqual([
        { address: MOCK_VALIDATOR_ADDRESS, fee: 0.05, payoutType: 'restake', dominanceRatio: 0.08, score: { total: 0.99 } },
        { address: MOCK_VALIDATOR_ADDRESS_3, fee: 0.04, payoutType: 'direct', dominanceRatio: 0.02, score: { total: 0.92 } },
      ])
      // The higher-scored validator isn't Recommended (payoutType "restake"); the lower-scored one is ("direct").
      expect(body[0].score.total).toBeGreaterThan(body[1].score.total)
      expect(body[0].payoutType).not.toBe('direct')
      expect(body[1].payoutType).toBe('direct')
    })

    it('leaves non-Validators-API fetches untouched', async () => {
      // Captured before installMockProvider wraps window.fetch — the wrapper
      // delegates to this same underlying mock, whose call history we check.
      const originalFetchMock = win.fetch as ReturnType<typeof vi.fn>
      installMockProvider(null)

      await window.fetch('https://example.com/something-else')

      expect(originalFetchMock).toHaveBeenCalledWith('https://example.com/something-else', undefined)
    })
  })

  it('answers getPolicyConstants with the confirmed testnet minimum stake and blocksPerEpoch', async () => {
    installMockProvider(null)
    const nimiq = win.nimiq as any

    const policy = await nimiq.request({ method: 'getPolicyConstants' })
    expect(policy.minimumStake).toBe(MOCK_MINIMUM_STAKE_LUNA)
    expect(policy.blocksPerEpoch).toBe(MOCK_BLOCKS_PER_EPOCH)
  })

  describe('isMockWaitScenario', () => {
    it('accepts exactly the four known scenarios', () => {
      expect(isMockWaitScenario('before')).toBe(true)
      expect(isMockWaitScenario('locked')).toBe(true)
      expect(isMockWaitScenario('ready')).toBe(true)
      expect(isMockWaitScenario('stuck')).toBe(true)
    })

    it('rejects anything else, including null', () => {
      expect(isMockWaitScenario('bogus')).toBe(false)
      expect(isMockWaitScenario(null)).toBe(false)
    })
  })

  describe('wait scenarios', () => {
    it('"before": inactiveFrom is still in the future — describeWaitingState says beforeInactive', async () => {
      installMockProvider(null, false, 'before')
      const nimiq = win.nimiq as any
      const staker = await nimiq.request({ method: 'getStakerByAddress', params: [MOCK_ADDRESSES[2]] })
      expect(describeWaitingState(MOCK_BLOCK_NUMBER, staker.inactiveFrom, MOCK_BLOCKS_PER_EPOCH).phase).toBe('beforeInactive')
    })

    it('"ready": the release block has passed — describeWaitingState says locked, but it\'s actually withdrawable', async () => {
      installMockProvider(null, false, 'ready')
      const nimiq = win.nimiq as any
      const staker = await nimiq.request({ method: 'getStakerByAddress', params: [MOCK_ADDRESSES[2]] })
      expect(staker.inactiveBalance).toBeGreaterThan(0)
      expect(releaseBlock(staker.inactiveFrom, MOCK_BLOCKS_PER_EPOCH)).toBeLessThanOrEqual(MOCK_BLOCK_NUMBER)
    })

    it('"stuck": already retired, nothing inactive — the resume-withdraw case', async () => {
      installMockProvider(null, false, 'stuck')
      const nimiq = win.nimiq as any
      const staker = await nimiq.request({ method: 'getStakerByAddress', params: [MOCK_ADDRESSES[2]] })
      expect(staker.inactiveBalance).toBe(0)
      expect(staker.retiredBalance).toBe(MOCK_WAITING_INACTIVE_LUNA)
    })
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

    it('sendSetActiveStakeTransaction moves the stopped amount from active to inactive, effective immediately in the mock', async () => {
      installMockProvider(null)
      const nimiq = win.nimiq as any

      const before = await nimiq.request({ method: 'getStakerByAddress', params: [MOCK_ADDRESSES[0]] })
      await nimiq.sendSetActiveStakeTransaction({ newActiveBalance: before.balance - 10_000_000 })

      const after = await nimiq.request({ method: 'getStakerByAddress', params: [MOCK_ADDRESSES[0]] })
      expect(after.balance).toBe(before.balance - 10_000_000)
      expect(after.inactiveBalance).toBe(before.inactiveBalance + 10_000_000)
      expect(after.inactiveFrom).toBe(MOCK_BLOCK_NUMBER)
    })

    it('sendRetireStakeTransaction moves inactive to retired on the waiting address', async () => {
      installMockProvider(null, false, 'ready')
      const nimiq = win.nimiq as any

      const before = await nimiq.request({ method: 'getStakerByAddress', params: [MOCK_ADDRESSES[2]] })
      await nimiq.sendRetireStakeTransaction({ retireStake: before.inactiveBalance })

      const after = await nimiq.request({ method: 'getStakerByAddress', params: [MOCK_ADDRESSES[2]] })
      expect(after.inactiveBalance).toBe(0)
      expect(after.retiredBalance).toBe(before.inactiveBalance)
    })

    it('sendRemoveStakeTransaction clears the retired balance on the waiting address', async () => {
      installMockProvider(null, false, 'stuck')
      const nimiq = win.nimiq as any

      const before = await nimiq.request({ method: 'getStakerByAddress', params: [MOCK_ADDRESSES[2]] })
      expect(before.retiredBalance).toBeGreaterThan(0)
      await nimiq.sendRemoveStakeTransaction({ value: before.retiredBalance })

      const after = await nimiq.request({ method: 'getStakerByAddress', params: [MOCK_ADDRESSES[2]] })
      expect(after.retiredBalance).toBe(0)
    })

    it('the full cycle composes: stop earning, retire, remove, in order', async () => {
      installMockProvider(null)
      const nimiq = win.nimiq as any

      const earning = await nimiq.request({ method: 'getStakerByAddress', params: [MOCK_ADDRESSES[0]] })
      await nimiq.sendSetActiveStakeTransaction({ newActiveBalance: earning.balance - 10_000_000 })
      const afterStop = await nimiq.request({ method: 'getStakerByAddress', params: [MOCK_ADDRESSES[0]] })
      expect(afterStop.inactiveBalance).toBe(10_000_000)

      await nimiq.sendRetireStakeTransaction({ retireStake: afterStop.inactiveBalance })
      const afterRetire = await nimiq.request({ method: 'getStakerByAddress', params: [MOCK_ADDRESSES[0]] })
      expect(afterRetire.inactiveBalance).toBe(0)
      expect(afterRetire.retiredBalance).toBe(10_000_000)

      await nimiq.sendRemoveStakeTransaction({ value: afterRetire.retiredBalance })
      const afterRemove = await nimiq.request({ method: 'getStakerByAddress', params: [MOCK_ADDRESSES[0]] })
      expect(afterRemove.retiredBalance).toBe(0)
    })

    const stakeFailModes = [
      ['stakeDeclined', 'declined'],
      ['stakeNotSent', 'notSent'],
      ['stakeNetworkDown', 'networkDown'],
      ['stakeMaybeSent', 'maybeSent'],
      ['stakeBlocked', 'blocked'],
      ['stakeTimedOut', 'timedOut'],
      ['stakeNoAnswer', 'timedOut'],
    ] as const

    it.each(stakeFailModes)('"%s" makes every staking call throw an error that classifies as "%s"', async (failMode, expectedOutcome) => {
      installMockProvider(failMode, true, 'ready')
      const nimiq = win.nimiq as any

      await expect(nimiq.sendNewStakerTransaction({ delegation: MOCK_VALIDATOR_ADDRESS, value: 10_000_000 }))
        .rejects.toSatisfy((error: unknown) => classifyTxError(error) === expectedOutcome)
      await expect(nimiq.sendStakeTransaction({ value: 10_000_000 }))
        .rejects.toSatisfy((error: unknown) => classifyTxError(error) === expectedOutcome)
      await expect(nimiq.sendSetActiveStakeTransaction({ newActiveBalance: 0 }))
        .rejects.toSatisfy((error: unknown) => classifyTxError(error) === expectedOutcome)
      await expect(nimiq.sendRetireStakeTransaction({ retireStake: MOCK_WAITING_INACTIVE_LUNA }))
        .rejects.toSatisfy((error: unknown) => classifyTxError(error) === expectedOutcome)
      await expect(nimiq.sendRemoveStakeTransaction({ value: MOCK_WAITING_INACTIVE_LUNA }))
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
