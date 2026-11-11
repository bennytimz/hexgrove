import type { Network } from '@nimiq/mini-app-sdk'
import { compactAddress, isValidatorHealthy, SCORE_SUNNY_THRESHOLD } from '../lib/sky'

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
 * The score is documented as 0-1, but the live testnet directory returns
 * `total: -1` (with `reliability: -1`, scoreVersion 1) for validators it
 * can't score yet, seen 2026-11-11 on NimiqHub Staking and ObsidianStake.
 * Anything outside 0-1 is treated as "no score", never as a terrible one,
 * so it can't turn the sky or the list Stormy (the no-false-storm rule).
 */
function isScoreInRange(total: unknown): total is number {
  return typeof total === 'number' && total >= 0 && total <= 1
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
    scoreTotal: score && isScoreInRange(score.total) ? score.total : null,
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

/** A validator as shown in the stake sheet's chooser: chain-RPC fields plus whatever the directory added. */
export interface ValidatorOption {
  address: string
  numStakers: number
  healthy: boolean
  /** From getActiveValidators, in Luna. Null when the chain didn't report one (used only for the active_stake total, src/lib/yield.ts). */
  balanceLuna: number | null
  feeFraction: number | null
  scoreTotal: number | null
  dominanceRatio: number | null
  recommended: boolean
}

/**
 * Turns a raw getActiveValidators result into chooser rows (chain-RPC fields
 * only; directory fields start null). Anything without a string address is
 * skipped; a non-array result gives an empty list.
 */
export function parseValidators(raw: unknown): ValidatorOption[] {
  if (!Array.isArray(raw))
    return []
  const out: ValidatorOption[] = []
  for (const entry of raw) {
    if (entry && typeof entry === 'object' && typeof (entry as { address?: unknown }).address === 'string') {
      const v = entry as { address: string, balance?: unknown, numStakers?: unknown, retired?: boolean, inactivityFlag?: unknown, jailedFrom?: unknown }
      out.push({
        address: v.address,
        numStakers: typeof v.numStakers === 'number' ? v.numStakers : 0,
        healthy: isValidatorHealthy(v),
        balanceLuna: typeof v.balance === 'number' ? v.balance : null,
        feeFraction: null,
        scoreTotal: null,
        dominanceRatio: null,
        recommended: false,
      })
    }
  }
  return out
}

/**
 * Layers the Validators API's fee, reliability score and pool size onto the
 * chain-RPC validator list, by address. Purely additive: a validator with
 * no matching directory entry (the API failed, or just doesn't list it)
 * keeps its chain-only fields untouched, exactly as before this existed.
 */
export function mergeDirectory(chainValidators: ValidatorOption[], directory: ValidatorDirectoryEntry[]): ValidatorOption[] {
  const byAddress = new Map(directory.map(d => [compactAddress(d.address), d]))
  return chainValidators.map((v) => {
    const entry = byAddress.get(compactAddress(v.address))
    if (!entry)
      return v
    return {
      ...v,
      feeFraction: entry.feeFraction,
      scoreTotal: entry.scoreTotal,
      dominanceRatio: entry.dominanceRatio,
      recommended: isRecommendedValidator(entry),
    }
  })
}

/** Shared tiebreak for "best": higher reliability score first (nulls last), then more stakers. */
function byBest(a: ValidatorOption, b: ValidatorOption): number {
  return (b.scoreTotal ?? -1) - (a.scoreTotal ?? -1) || b.numStakers - a.numStakers
}

/** Display order for the chooser: Recommended validators first, each group ordered by byBest. */
export function sortValidatorOptions(list: ValidatorOption[]): ValidatorOption[] {
  return [...list].sort((a, b) => {
    if (a.recommended !== b.recommended)
      return a.recommended ? -1 : 1
    return byBest(a, b)
  })
}

/**
 * The validator to preselect: the best Recommended one when any qualify —
 * the spec's Recommended tag is a hint, now also the default, not just a
 * label next to someone else's pick. Falls back, unchanged from before
 * Recommended existed, to the healthiest validator by stake count, then
 * the busiest validator overall.
 */
export function pickDefaultValidator(list: ValidatorOption[]): string {
  const recommended = list.filter(v => v.recommended).sort(byBest)
  if (recommended.length)
    return recommended[0].address
  const healthy = list.filter(v => v.healthy).sort((a, b) => b.numStakers - a.numStakers)
  if (healthy.length)
    return healthy[0].address
  return [...list].sort((a, b) => b.numStakers - a.numStakers)[0]?.address ?? ''
}

/**
 * Fetches the validator directory for the given network. Additive only:
 * never throws, and resolves to an empty array on any failure (network
 * error, non-OK status, unexpected shape) — callers fall back to whatever
 * they did before this existed, exactly as if the array were always empty.
 * Logs why, so a silent empty result is never a dead end to debug.
 *
 * Uses a manual AbortController rather than AbortSignal.timeout() — the
 * latter is a newer addition (Safari 16+, 2022) and this runs inside
 * whatever WebView engine Nimiq Pay embeds, which is unconfirmed; a plain
 * AbortController has been supported since Safari 11.1 (2018).
 */
export async function fetchValidatorsDirectory(network: Network | undefined): Promise<ValidatorDirectoryEntry[]> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 8000)
  try {
    const response = await fetch(`${directoryUrlForNetwork(network)}/api/v1/validators`, {
      signal: controller.signal,
    })
    if (!response.ok) {
      console.error(`Could not load the validator directory: answered ${response.status}`)
      return []
    }
    const body: unknown = await response.json()
    if (!Array.isArray(body)) {
      console.error('Could not load the validator directory: response was not an array')
      return []
    }
    const out: ValidatorDirectoryEntry[] = []
    for (const entry of body) {
      const parsed = parseDirectoryEntry(entry)
      if (parsed)
        out.push(parsed)
    }
    return out
  }
  catch (error) {
    console.error('Could not load the validator directory:', error instanceof Error ? `${error.name}: ${error.message}` : error)
    return []
  }
  finally {
    clearTimeout(timeoutId)
  }
}
