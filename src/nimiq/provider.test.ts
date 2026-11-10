import { describe, expect, it } from 'vitest'
import { DEFAULT_MAINNET_RPC_URL, DEFAULT_TESTNET_RPC_URL, rpcUrlForNetwork } from './provider'

describe('rpcUrlForNetwork', () => {
  it('picks the mainnet RPC for \'mainnet\'', () => {
    expect(rpcUrlForNetwork('mainnet')).toBe(DEFAULT_MAINNET_RPC_URL)
  })

  it('picks the testnet RPC for \'testnet\'', () => {
    expect(rpcUrlForNetwork('testnet')).toBe(DEFAULT_TESTNET_RPC_URL)
  })

  it('falls back to the testnet RPC when the network is unknown, matching the existing testnet-first default', () => {
    expect(rpcUrlForNetwork(undefined)).toBe(DEFAULT_TESTNET_RPC_URL)
  })

  it('the two endpoints are never the same URL', () => {
    expect(DEFAULT_MAINNET_RPC_URL).not.toBe(DEFAULT_TESTNET_RPC_URL)
  })
})
