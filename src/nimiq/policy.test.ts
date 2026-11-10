import { describe, expect, it } from 'vitest'
import { parsePolicyConstants } from './policy'

describe('parsePolicyConstants', () => {
  it('parses a real-shaped response, confirmed on testnet, 2026-11-09', () => {
    expect(parsePolicyConstants({ minimumStake: 10_000_000, blocksPerEpoch: 43_200 })).toEqual({
      minimumStakeLuna: 10_000_000n,
      blocksPerEpoch: 43_200,
    })
  })

  it('defaults missing or malformed fields to null rather than throwing', () => {
    expect(parsePolicyConstants({})).toEqual({ minimumStakeLuna: null, blocksPerEpoch: null })
    expect(parsePolicyConstants(null)).toEqual({ minimumStakeLuna: null, blocksPerEpoch: null })
    expect(parsePolicyConstants(undefined)).toEqual({ minimumStakeLuna: null, blocksPerEpoch: null })
    expect(parsePolicyConstants('not an object')).toEqual({ minimumStakeLuna: null, blocksPerEpoch: null })
    expect(parsePolicyConstants({ minimumStake: '10000000', blocksPerEpoch: '43200' })).toEqual({ minimumStakeLuna: null, blocksPerEpoch: null })
  })

  it('handles each field being present without the other', () => {
    expect(parsePolicyConstants({ minimumStake: 10_000_000 })).toEqual({ minimumStakeLuna: 10_000_000n, blocksPerEpoch: null })
    expect(parsePolicyConstants({ blocksPerEpoch: 43_200 })).toEqual({ minimumStakeLuna: null, blocksPerEpoch: 43_200 })
  })
})
