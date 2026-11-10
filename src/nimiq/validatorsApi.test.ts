import type { ValidatorOption } from './validatorsApi'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { directoryUrlForNetwork, fetchValidatorsDirectory, isRecommendedValidator, parseDirectoryEntry, pickDefaultValidator, sortValidatorOptions, VALIDATORS_API_MAINNET_URL, VALIDATORS_API_TESTNET_URL } from './validatorsApi'

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

/**
 * Fixtures mirroring the real mainnet inconsistency reported 2026-11-10:
 * NQ05 had the highest reliability score (99%) and was the old default,
 * but wasn't Recommended (assume it doesn't pay out directly); NQ15 and
 * NQ32 were both Recommended but neither was the default.
 */
function option(overrides: Partial<ValidatorOption>): ValidatorOption {
  return {
    address: 'NQ00 0000 0000 0000 0000 0000 0000 0000 0000',
    numStakers: 10,
    healthy: true,
    feeFraction: null,
    scoreTotal: null,
    dominanceRatio: null,
    recommended: false,
    ...overrides,
  }
}

const nq05NotRecommended = option({ address: 'NQ05 U1RF QJNH JCS1 RDQX 4M3Y 60KR K6CN 5LKC', numStakers: 50, scoreTotal: 0.99, recommended: false })
const nq15Recommended = option({ address: 'NQ15 HNAH YRVH DFVM YHAG BSXG 0QHK KA0Q XDR7', numStakers: 20, scoreTotal: 0.90, recommended: true })
const nq32Recommended = option({ address: 'NQ32 1U9X 7P3X B2H5 XA00 5LC2 5KFE VBQE X3BU', numStakers: 30, scoreTotal: 0.95, recommended: true })

describe('sortValidatorOptions', () => {
  it('puts every Recommended validator before every non-Recommended one, regardless of score', () => {
    const sorted = sortValidatorOptions([nq05NotRecommended, nq15Recommended, nq32Recommended])
    expect(sorted.map(v => v.address)).toEqual([nq32Recommended.address, nq15Recommended.address, nq05NotRecommended.address])
  })

  it('orders within each group by score, highest first', () => {
    const lowerScoreRecommended = option({ address: 'b', recommended: true, scoreTotal: 0.86 })
    const sorted = sortValidatorOptions([lowerScoreRecommended, nq32Recommended])
    expect(sorted.map(v => v.address)).toEqual([nq32Recommended.address, lowerScoreRecommended.address])
  })

  it('breaks a score tie (including both null) by more stakers first', () => {
    const fewerStakers = option({ address: 'a', numStakers: 5 })
    const moreStakers = option({ address: 'b', numStakers: 50 })
    expect(sortValidatorOptions([fewerStakers, moreStakers]).map(v => v.address)).toEqual(['b', 'a'])
  })
})

describe('pickDefaultValidator', () => {
  it('picks the best Recommended validator over a higher-scored non-Recommended one (the reported mainnet case)', () => {
    expect(pickDefaultValidator([nq05NotRecommended, nq15Recommended, nq32Recommended])).toBe(nq32Recommended.address)
  })

  it('falls back to the healthiest validator by stake count when none are Recommended', () => {
    const unhealthyButBusy = option({ address: 'a', healthy: false, numStakers: 999 })
    const healthy = option({ address: 'b', healthy: true, numStakers: 10 })
    expect(pickDefaultValidator([unhealthyButBusy, healthy])).toBe('b')
  })

  it('falls back to the busiest validator overall when none are healthy or Recommended', () => {
    const lessBusy = option({ address: 'a', healthy: false, numStakers: 5 })
    const busier = option({ address: 'b', healthy: false, numStakers: 50 })
    expect(pickDefaultValidator([lessBusy, busier])).toBe('b')
  })

  it('returns an empty string for an empty list', () => {
    expect(pickDefaultValidator([])).toBe('')
  })
})

describe('fetchValidatorsDirectory', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('resolves to an empty array and logs the reason when fetch itself throws (network down, CORS, or blocked by the host)', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))

    const result = await fetchValidatorsDirectory('mainnet')

    expect(result).toEqual([])
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('validator directory'), expect.stringContaining('Failed to fetch'))
    consoleSpy.mockRestore()
  })

  it('resolves to an empty array and logs the status when the response is not ok', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }))

    const result = await fetchValidatorsDirectory('testnet')

    expect(result).toEqual([])
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('500'))
    consoleSpy.mockRestore()
  })

  it('resolves to an empty array without throwing when the response body is not an array', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ error: 'nope' }) }))

    const result = await fetchValidatorsDirectory('mainnet')

    expect(result).toEqual([])
  })

  it('parses a successful response into ValidatorDirectoryEntry objects, querying the right URL for the network', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [{ address: 'NQ00 0000 0000 0000 0000 0000 0000 0000 0000', fee: 0.05, payoutType: 'direct', dominanceRatio: 0.01, score: { total: 0.9 } }],
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await fetchValidatorsDirectory('mainnet')

    expect(result).toHaveLength(1)
    expect(result[0].feeFraction).toBe(0.05)
    expect(fetchMock.mock.calls[0][0]).toBe(`${VALIDATORS_API_MAINNET_URL}/api/v1/validators`)
  })
})
