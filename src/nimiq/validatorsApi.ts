import type { Network } from '@nimiq/mini-app-sdk'
import { SCORE_SUNNY_THRESHOLD } from '../lib/sky'

/**
 * Nimiq's own validator directory — the service NimJar uses (found via its
 * src/server.js, not guessed), confirmed reachable cross-origin from a
 * browser on both networks, 2026-11-10 (see docs/SPEC.md, open question 9).
 * Not the chain RPC: a separate hosted API with fee, payout type, a
 * reliability score and pool size, none of which `getActiveValidators`
 * reports.
 */
export const VALIDATORS_API_MAINNET_URL = 'https://validators-api-main.je-cf9.workers.dev'
export const VALIDATORS_API_TESTNET_URL = 'https://validators-api-test.je-cf9.workers.dev'

export function directoryUrlForNetwork(network: Network | undefined): string {
  return network === 'mainnet' ? VALIDATORS_API_MAINNET_URL : VALIDATORS_API_TESTNET_URL
}

export interface ValidatorDirectoryEntry {
  address: string
  /** Fraction, e.g. 0.05 = 5%. Null when the directory doesn't report one. */
  feeFraction: number | null
  /** 0-1 overall reliability score. Null when unscored. */
  scoreTotal: number | null
  /** Fraction of total network stake this validator holds. Null when unknown. */
  dominanceRatio: number | null
  /** e.g. "restake", "direct", "none" — "none" means stake there earns nothing. */
  payoutType: string | null
}

/**
 * Defensive parse of one raw directory entry — pure, so it's unit-tested
 * directly rather than only exercised through a live fetch. Deliberately
 * ignores fields this app doesn't use (name, logo, website, id, ...).
 */
export function parseDirectoryEntry(raw: unknown): ValidatorDirectoryEntry | null {
  if (!raw || typeof raw !== 'object')
    return null
  const v = raw as Record<string, unknown>
  if (typeof v.address !== 'string')
    return null
  const score = v.score && typeof v.score === 'object' ? v.score as Record<string, unknown> : null
  return {
    address: v.address,
    feeFraction: typeof v.fee === 'number' ? v.fee : null,
    scoreTotal: score && typeof score.total === 'number' ? score.total : null,
    dominanceRatio: typeof v.dominanceRatio === 'number' ? v.dominanceRatio : null,
    payoutType: typeof v.payoutType === 'string' ? v.payoutType : null,
  }
}

/**
 * The spec's Recommended-tag criteria (docs/SPEC.md, Validator choice):
 * sunny by score, 6% fee or less, pays rewards directly to the wallet, and
 * holds under 10% of the network. A hint only — several pools can qualify.
 */
export function isRecommendedValidator(entry: ValidatorDirectoryEntry): boolean {
  return entry.scoreTotal !== null && entry.scoreTotal >= SCORE_SUNNY_THRESHOLD
    && entry.feeFraction !== null && entry.feeFraction <= 0.06
    && entry.payoutType === 'direct'
    && entry.dominanceRatio !== null && entry.dominanceRatio < 0.10
}

/**
 * Fetches the validator directory for the given network. Additive only:
 * never throws, and resolves to an empty array on any failure (network
 * error, non-OK status, unexpected shape) — callers fall back to whatever
 * they did before this existed, exactly as if the array were always empty.
 */
export async function fetchValidatorsDirectory(network: Network | undefined): Promise<ValidatorDirectoryEntry[]> {
  try {
    const response = await fetch(`${directoryUrlForNetwork(network)}/api/v1/validators`, {
      signal: AbortSignal.timeout(8000),
    })
    if (!response.ok)
      return []
    const body: unknown = await response.json()
    if (!Array.isArray(body))
      return []
    const out: ValidatorDirectoryEntry[] = []
    for (const entry of body) {
      const parsed = parseDirectoryEntry(entry)
      if (parsed)
        out.push(parsed)
    }
    return out
  }
  catch (error) {
    console.error('Could not load the validator directory:', error)
    return []
  }
}
