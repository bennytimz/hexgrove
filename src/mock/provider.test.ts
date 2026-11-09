import { NimiqProviderError } from '@nimiq/mini-app-sdk'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  installMockProvider,
  MOCK_ADDRESSES,
  MOCK_TIMEOUT_DELAY_MS,
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

  it('throws a clear "not mocked yet" error for staking calls', async () => {
    installMockProvider(null)
    const nimiq = win.nimiq as any

    await expect(nimiq.sendNewStakerTransaction({ delegation: MOCK_ADDRESSES[0], value: 100_000 }))
      .rejects.toThrow(/not mocked yet/i)
    await expect(nimiq.sendStakeTransaction({ value: 100_000 })).rejects.toThrow(/not mocked yet/i)
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

  it('throws "not mocked yet" for any other request() method', async () => {
    installMockProvider(null)
    const nimiq = win.nimiq as any

    await expect(nimiq.request({ method: 'getActiveValidators' })).rejects.toThrow(/not mocked yet/i)
  })
})
