// NIM has up to 5 decimal places. 1 NIM = 100,000 Luna.
// All conversions here use BigInt so no amount is ever represented as a float.
export const LUNA_PER_NIM = 100_000n

/**
 * Converts a Luna amount to a NIM display string, trimmed of trailing zeros.
 * Accepts a bigint or a safe-integer number (e.g. the value returned by the
 * provider's getBalance, which is typed as `number`).
 */
export function lunaToNim(luna: bigint | number): string {
  const value = typeof luna === 'bigint' ? luna : BigInt(Math.trunc(luna))
  if (value < 0n) {
    throw new RangeError('Luna amount cannot be negative')
  }

  const whole = value / LUNA_PER_NIM
  const fraction = value % LUNA_PER_NIM
  if (fraction === 0n) {
    return whole.toString()
  }

  const fractionDigits = fraction.toString().padStart(5, '0').replace(/0+$/, '')
  return `${whole}.${fractionDigits}`
}

/**
 * Formats a Luna amount as a NIM display string with thousands separators,
 * e.g. 11_000_000_000n -> "110,000". Built on lunaToNim's integer-safe digits,
 * so the separators are inserted by string splitting, never by float math.
 */
export function formatNim(luna: bigint | number): string {
  const [whole, fraction] = lunaToNim(luna).split('.')
  const wholeWithSeparators = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return fraction ? `${wholeWithSeparators}.${fraction}` : wholeWithSeparators
}

/**
 * How much more Luna is needed to reach a minimum, given what's already
 * available. 0n when the minimum is already met. Accepts a bigint or a
 * safe-integer number for `haveLuna` (e.g. getBalance's return type).
 */
export function shortfallLuna(minimumLuna: bigint, haveLuna: bigint | number): bigint {
  const have = typeof haveLuna === 'bigint' ? haveLuna : BigInt(Math.trunc(haveLuna))
  const diff = minimumLuna - have
  return diff > 0n ? diff : 0n
}

/**
 * Parses a NIM amount string (up to 5 decimal places) into an integer Luna amount.
 */
export function nimToLuna(nim: string): bigint {
  const trimmed = nim.trim()
  if (!/^\d+(\.\d{1,5})?$/.test(trimmed)) {
    throw new RangeError(`"${nim}" is not a valid NIM amount with up to 5 decimal places`)
  }

  const [wholePart, fractionPart = ''] = trimmed.split('.')
  const paddedFraction = fractionPart.padEnd(5, '0')
  return BigInt(wholePart) * LUNA_PER_NIM + BigInt(paddedFraction)
}
