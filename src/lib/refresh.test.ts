import { describe, expect, it } from 'vitest'
import { combinedStateWhileLoading } from './refresh'

describe('combinedStateWhileLoading', () => {
  it('keeps the current screen up during a quiet refresh', () => {
    expect(combinedStateWhileLoading('staked', true)).toBe('staked')
    expect(combinedStateWhileLoading('empty', true)).toBe('empty')
    expect(combinedStateWhileLoading('hidden', true)).toBe('hidden')
  })

  it('shows the full loading state on a normal load', () => {
    expect(combinedStateWhileLoading('staked', false)).toBe('loading')
    expect(combinedStateWhileLoading('empty', false)).toBe('loading')
  })

  it('never keeps an error or loading screen up, even when quiet', () => {
    expect(combinedStateWhileLoading('error', true)).toBe('loading')
    expect(combinedStateWhileLoading('loading', true)).toBe('loading')
  })
})
