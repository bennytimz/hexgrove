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
    message: 'Nimiq Pay didn\'t finish in time. Check Nimiq Pay\'s history before trying again.',
  },
}

/**
 * Classifies a failed staking call into one of the outcomes above. Blocked
 * and Timed out share the same type/code (INTERNAL_ERROR, -32603) on
 * testnet, so they're told apart by the message text — "pending" vs.
 * "timed out" — never shown to the user, only matched against.
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
      if (message.includes('timed out'))
        return 'timedOut'
      if (message.includes('pending'))
        return 'blocked'
    }
  }
  return 'notSent'
}
