import { NimiqProviderError } from '../nimiq/provider'

/**
 * The outcomes a staking approval can end in, confirmed on testnet,
 * 2026-11-09 (see docs/SPEC.md, Errors and copy). Withdraw step 2 isn't
 * included: withdrawing isn't built yet.
 */
export type TxOutcome = 'declined' | 'notSent' | 'networkDown' | 'maybeSent' | 'blocked' | 'timedOut'

export interface TxOutcomeCopy {
  title: string
  message: string
}

export const TX_OUTCOME_COPY: Record<TxOutcome, TxOutcomeCopy> = {
  declined: {
    title: 'No problem',
    message: 'You declined the request in Nimiq Pay, so nothing was sent.',
  },
  notSent: {
    title: 'Couldn\'t send your stake',
    message: 'Something went wrong before the request reached the network. Nothing was sent.',
  },
  networkDown: {
    title: 'Can\'t reach the network',
    message: 'Check your connection. Nothing has been sent.',
  },
  maybeSent: {
    title: 'We couldn\'t confirm yet',
    message: 'Your stake may or may not have gone through. Check your Nimiq Pay history before trying again, so you don\'t stake twice.',
  },
  blocked: {
    title: 'One at a time',
    message: 'Nimiq Pay is still finishing your last request. Wait a moment, then try again.',
  },
  timedOut: {
    title: 'Timed out',
    message: 'Nimiq Pay didn\'t answer. If you closed the approval, nothing was sent. We\'ll check before you try again.',
  },
}

/**
 * Classifies a failed staking call into one of the outcomes above. Blocked
 * and Timed out share the same type/code (INTERNAL_ERROR, -32603) on
 * testnet, so they're told apart by the message text. Two different
 * messages have been seen mapping to Timed out: "Operation timed out
 * after 30000 milliseconds", and a swiped-away approval sheet's
 * `[birpc] timeout on calling "handleRequest"` — neither cause is
 * confirmed (see docs/SPEC.md), so both are treated the same: no answer
 * from Nimiq Pay, never shown as the raw message.
 */
export function classifyTxError(error: unknown): TxOutcome {
  if (NimiqProviderError.is(error)) {
    if (error.type === 'PERMISSION_DENIED')
      return 'declined'
    if (error.type === 'TRANSACTION_OUTCOME_UNKNOWN' || error.code === -32001)
      return 'maybeSent'
    if (error.type === 'NETWORK_ERROR' || error.code === -32000)
      return 'networkDown'
    if (error.type === 'INTERNAL_ERROR' || error.code === -32603) {
      const message = error.message.toLowerCase()
      if (message.includes('timed out') || message.includes('[birpc] timeout'))
        return 'timedOut'
      if (message.includes('pending'))
        return 'blocked'
    }
  }
  return 'notSent'
}

/**
 * Withdraw step 2 (sendRemoveStakeTransaction) failing after step 1
 * (sendRetireStakeTransaction) already succeeded — docs/SPEC.md's
 * "Withdraw step 2 fails" outcome. Same six classifications and the same
 * chain-recheck gating as TX_OUTCOME_COPY (maybeSent, timedOut), reframed:
 * the NIM is already retired and safe, only the last step didn't land.
 */
export const ALMOST_DONE_COPY: Record<TxOutcome, TxOutcomeCopy> = {
  declined: {
    title: 'Almost done',
    message: 'Your stake is released, but you declined the last step. Your NIM is safe. Finish when you\'re ready.',
  },
  notSent: {
    title: 'Almost done',
    message: 'Your stake is released, but the withdrawal didn\'t go through. Your NIM is safe. Finish when you\'re ready.',
  },
  networkDown: {
    title: 'Almost done',
    message: 'Your stake is released, but we couldn\'t reach the network. Your NIM is safe. Finish when you\'re ready.',
  },
  maybeSent: {
    title: 'Almost done',
    message: 'Your stake is released. The last step may or may not have gone through. Check your Nimiq Pay history before trying again, so you don\'t send it twice.',
  },
  blocked: {
    title: 'Almost done',
    message: 'Your stake is released. Nimiq Pay is still finishing your last request. Wait a moment, then finish withdrawing.',
  },
  timedOut: {
    title: 'Almost done',
    message: 'Your stake is released, but Nimiq Pay didn\'t answer. We\'ll check before you try again.',
  },
}

export type StakeRecheckResult = 'confirmed' | 'unchanged' | 'checkFailed'

/**
 * Pure decision for what a post-"timed out" chain re-check means, kept
 * separate from the actual chain read so it's unit-testable: a read that
 * failed can't tell us anything, a read that succeeded but shows no
 * increase means nothing changed, and an increase means it went through
 * after all.
 */
export function classifyStakeRecheck(read: { ok: true, total: bigint } | { ok: false }, baselineTotal: bigint): StakeRecheckResult {
  if (!read.ok)
    return 'checkFailed'
  return read.total > baselineTotal ? 'confirmed' : 'unchanged'
}
