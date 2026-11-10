import { describe, expect, it } from 'vitest'
import { directoryUrlForNetwork, isRecommendedValidator, parseDirectoryEntry, VALIDATORS_API_MAINNET_URL, VALIDATORS_API_TESTNET_URL } from './validatorsApi'

describe('directoryUrlForNetwork', () => {
  it('picks the mainnet directory for \'mainnet\', testnet otherwise', () => {
    expect(directoryUrlForNetwork('mainnet')).toBe(VALIDATORS_API_MAINNET_URL)
    expect(directoryUrlForNetwork('testnet')).toBe(VALIDATORS_API_TESTNET_URL)
    expect(directoryUrlForNetwork(undefined)).toBe(VALIDATORS_API_TESTNET_URL)
  })
})

describe('parseDirectoryEntry', () => {
  it('parses a real-shaped entry, confirmed on testnet, 2026-11-10', () => {
    const raw = {
      id: 40,
      name: 'Siam Testnet Pool',
      address: 'NQ35 YFBF ES7X R9PS 36R4 11FG 3HQF YL9Q NL2S',
      fee: 0.05,
      payoutType: 'restake',
      isListed: true,
      score: { total: 0.9965594716191067, reliability: 0.9965595034311523 },
      dominanceRatio: 0.015027442418276927,
      logo: 'data:image/svg+xml;base64,...',
    }
    expect(parseDirectoryEntry(raw)).toEqual({
      address: 'NQ35 YFBF ES7X R9PS 36R4 11FG 3HQF YL9Q NL2S',
      feeFraction: 0.05,
      scoreTotal: 0.9965594716191067,
      dominanceRatio: 0.015027442418276927,
      payoutType: 'restake',
    })
  })

  it('treats a missing or malformed address as unparseable', () => {
    expect(parseDirectoryEntry({})).toBeNull()
    expect(parseDirectoryEntry({ address: 123 })).toBeNull()
    expect(parseDirectoryEntry(null)).toBeNull()
    expect(parseDirectoryEntry('a string')).toBeNull()
    expect(parseDirectoryEntry(undefined)).toBeNull()
  })

  it('defaults missing fee, score and dominance to null rather than throwing (seen on mainnet: a validator with no fee)', () => {
    const raw = { address: 'NQ00 0000 0000 0000 0000 0000 0000 0000 0000', payoutType: 'none' }
    expect(parseDirectoryEntry(raw)).toEqual({
      address: 'NQ00 0000 0000 0000 0000 0000 0000 0000 0000',
      feeFraction: null,
      scoreTotal: null,
      dominanceRatio: null,
      payoutType: 'none',
    })
  })

  it('handles a missing or malformed score object without throwing', () => {
    const address = 'NQ00 0000 0000 0000 0000 0000 0000 0000 0000'
    expect(parseDirectoryEntry({ address, score: null })?.scoreTotal).toBeNull()
    expect(parseDirectoryEntry({ address, score: 'bad' })?.scoreTotal).toBeNull()
    expect(parseDirectoryEntry({ address, score: { total: 'bad' } })?.scoreTotal).toBeNull()
  })
})

describe('isRecommendedValidator', () => {
  const qualifying = { address: 'a', feeFraction: 0.05, scoreTotal: 0.9, dominanceRatio: 0.05, payoutType: 'direct' }

  it('is recommended when it meets every spec criterion', () => {
    expect(isRecommendedValidator(qualifying)).toBe(true)
  })

  it('is not recommended below the sunny score threshold', () => {
    expect(isRecommendedValidator({ ...qualifying, scoreTotal: 0.5 })).toBe(false)
  })

  it('is not recommended above the 6% fee cap', () => {
    expect(isRecommendedValidator({ ...qualifying, feeFraction: 0.07 })).toBe(false)
  })

  it('is not recommended unless it pays directly to the wallet', () => {
    expect(isRecommendedValidator({ ...qualifying, payoutType: 'restake' })).toBe(false)
    expect(isRecommendedValidator({ ...qualifying, payoutType: 'none' })).toBe(false)
  })

  it('is not recommended at or above 10% of the network', () => {
    expect(isRecommendedValidator({ ...qualifying, dominanceRatio: 0.10 })).toBe(false)
  })

  it('is not recommended when any field is unknown (never assume the best case)', () => {
    expect(isRecommendedValidator({ ...qualifying, feeFraction: null })).toBe(false)
    expect(isRecommendedValidator({ ...qualifying, scoreTotal: null })).toBe(false)
    expect(isRecommendedValidator({ ...qualifying, dominanceRatio: null })).toBe(false)
  })
})
