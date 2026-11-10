import { describe, expect, it } from 'vitest'
import { formatNim, lunaToNim, nimToLuna, shortfallLuna } from './luna'

describe('lunaToNim and nimToLuna', () => {
  it('converts Luna to NIM', () => {
    expect(lunaToNim(100_000n)).toBe('1')
    expect(lunaToNim(150_000n)).toBe('1.5')
    expect(lunaToNim(123_456_780n)).toBe('1234.5678')
  })

  it('converts NIM to Luna', () => {
    expect(nimToLuna('1')).toBe(100_000n)
    expect(nimToLuna('1.5')).toBe(150_000n)
    expect(nimToLuna('1234.5678')).toBe(123_456_780n)
  })

  it('round-trips an amount in both directions', () => {
    const nim = '42.013'
    expect(lunaToNim(nimToLuna(nim))).toBe(nim)

    const luna = 9_876_543n
    expect(nimToLuna(lunaToNim(luna))).toBe(luna)
  })

  it('supports exactly 5 decimal places and rejects more', () => {
    expect(nimToLuna('0.00001')).toBe(1n)
    expect(lunaToNim(1n)).toBe('0.00001')
    expect(() => nimToLuna('0.000001')).toThrow(RangeError)
  })

  it('handles zero', () => {
    expect(lunaToNim(0n)).toBe('0')
    expect(lunaToNim(0)).toBe('0')
    expect(nimToLuna('0')).toBe(0n)
  })

  it('handles a very large balance without losing precision', () => {
    // Nimiq's total supply is on the order of 2.1e10 NIM, i.e. ~2.1e15 Luna.
    const hugeNim = '21000000000.00001'
    const hugeLuna = nimToLuna(hugeNim)
    expect(hugeLuna).toBe(2_100_000_000_000_001n)
    expect(lunaToNim(hugeLuna)).toBe(hugeNim)

    // getBalance() returns a plain `number`; it must still round-trip correctly
    // as long as it stays within Number.MAX_SAFE_INTEGER.
    const safeIntegerLuna = Number(hugeLuna)
    expect(Number.isSafeInteger(safeIntegerLuna)).toBe(true)
    expect(lunaToNim(safeIntegerLuna)).toBe(hugeNim)
  })

  it('rejects a negative Luna amount', () => {
    expect(() => lunaToNim(-1n)).toThrow(RangeError)
  })

  it('formats NIM amounts with thousands separators', () => {
    expect(formatNim(0n)).toBe('0')
    expect(formatNim(100_000n)).toBe('1')
    expect(formatNim(11_000_000_000n)).toBe('110,000')
    expect(formatNim(12_345_678n)).toBe('123.45678')
    expect(formatNim(2_100_000_000_000_001n)).toBe('21,000,000,000.00001')
  })
})

describe('shortfallLuna', () => {
  const minimumLuna = 10_000_000n // 100 NIM

  it('is the gap between the minimum and what is available', () => {
    expect(shortfallLuna(minimumLuna, 4_000_000n)).toBe(6_000_000n) // have 40, need 60 more
    expect(shortfallLuna(minimumLuna, 4_000_000)).toBe(6_000_000n) // accepts a plain number too
  })

  it('is zero once the minimum is met or exceeded', () => {
    expect(shortfallLuna(minimumLuna, minimumLuna)).toBe(0n)
    expect(shortfallLuna(minimumLuna, 15_000_000n)).toBe(0n)
  })

  it('is zero when nothing is needed at all', () => {
    expect(shortfallLuna(0n, 0n)).toBe(0n)
  })
})
