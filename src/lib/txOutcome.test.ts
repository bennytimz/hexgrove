import { NimiqProviderError } from '@nimiq/mini-app-sdk'
import { describe, expect, it } from 'vitest'
import { classifyStakeRecheck, classifyTxError, TX_OUTCOME_COPY } from './txOutcome'

describe('classifyTxError', () => {
  it('classifies a declined request', () => {
    const error = new NimiqProviderError('PERMISSION_DENIED', 'The user declined the request.', 4001)
    expect(classifyTxError(error)).toBe('declined')
  })

  it('classifies TRANSACTION_OUTCOME_UNKNOWN as maybe sent, by type or by code', () => {
    expect(classifyTxError(new NimiqProviderError('TRANSACTION_OUTCOME_UNKNOWN', 'Submission may have occurred.', -32001))).toBe('maybeSent')
    expect(classifyTxError(new NimiqProviderError('UNKNOWN_ERROR', 'Something.', -32001))).toBe('maybeSent')
  })

  it('classifies NETWORK_ERROR as network down', () => {
    expect(classifyTxError(new NimiqProviderError('NETWORK_ERROR', 'The network could not be reached.', -32000))).toBe('networkDown')
  })

  it('tells "blocked by a pending transaction" from "timed out" by message text, same type and code', () => {
    const pending = new NimiqProviderError('INTERNAL_ERROR', 'A transaction is still pending. Wait for it to resolve before sending another.', -32603)
    const timedOut = new NimiqProviderError('INTERNAL_ERROR', 'Operation timed out after 30000 milliseconds', -32603)
    expect(classifyTxError(pending)).toBe('blocked')
    expect(classifyTxError(timedOut)).toBe('timedOut')
  })

  it('also classifies a swiped-away approval sheet\'s "[birpc] timeout" as "timed out"', () => {
    const birpcTimeout = new NimiqProviderError('INTERNAL_ERROR', '[birpc] timeout on calling "handleRequest"', -32603)
    expect(classifyTxError(birpcTimeout)).toBe('timedOut')
  })

  it('falls back to "not sent" for anything unrecognized, including plain errors', () => {
    expect(classifyTxError(new NimiqProviderError('INVALID_TRANSACTION', 'Bad params.', -32602))).toBe('notSent')
    expect(classifyTxError(new Error('boom'))).toBe('notSent')
    expect(classifyTxError('a string')).toBe('notSent')
    expect(classifyTxError(null)).toBe('notSent')
  })
})

describe('TX_OUTCOME_COPY', () => {
  it('has fixed copy for every outcome, sentence case, no raw error text leaking in', () => {
    for (const outcome of Object.values(TX_OUTCOME_COPY)) {
      expect(outcome.title.length).toBeGreaterThan(0)
      expect(outcome.message.length).toBeGreaterThan(0)
      expect(outcome.message).not.toMatch(/-\d{4,5}/) // no raw RPC codes
      expect(outcome.title).not.toContain('—')
      expect(outcome.message).not.toContain('—')
    }
  })

  it('does not pin "timed out" to a specific duration or a single confirmed cause (see docs/SPEC.md)', () => {
    const { message } = TX_OUTCOME_COPY.timedOut
    const lower = message.toLowerCase()
    expect(lower).not.toMatch(/\d+\s*(second|ms|millisecond)/) // no "30 seconds" / "30000ms" claims
    expect(lower).not.toContain('hear back') // the earlier, now-disproven assumption
  })
})

describe('classifyStakeRecheck', () => {
  it('is "confirmed" when the re-read total is above the baseline', () => {
    expect(classifyStakeRecheck({ ok: true, total: 150n }, 100n)).toBe('confirmed')
  })

  it('is "unchanged" when the re-read total is at or below the baseline', () => {
    expect(classifyStakeRecheck({ ok: true, total: 100n }, 100n)).toBe('unchanged')
    expect(classifyStakeRecheck({ ok: true, total: 0n }, 100n)).toBe('unchanged')
  })

  it('is "checkFailed" when the re-read itself failed, regardless of baseline', () => {
    expect(classifyStakeRecheck({ ok: false }, 100n)).toBe('checkFailed')
    expect(classifyStakeRecheck({ ok: false }, 0n)).toBe('checkFailed')
  })
})
