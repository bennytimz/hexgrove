import { describe, expect, it } from 'vitest'
import { aboutDuration, describeWaitingState, releaseBlock } from './waiting'

describe('releaseBlock', () => {
  it('is inactiveFrom plus blocksPerEpoch', () => {
    expect(releaseBlock(1_000_000, 43_200)).toBe(1_043_200)
  })
})

describe('aboutDuration', () => {
  it('formats sub-hour gaps in minutes', () => {
    expect(aboutDuration(10)).toBe('1 minute')
    expect(aboutDuration(60)).toBe('1 minute')
    expect(aboutDuration(59 * 60)).toBe('59 minutes')
  })

  it('formats hour-plus gaps in hours, singular and plural', () => {
    expect(aboutDuration(3600)).toBe('1 hour')
    expect(aboutDuration(11 * 3600)).toBe('11 hours')
  })
})

describe('describeWaitingState', () => {
  it('is "beforeInactive" before the election block takes effect, and never says Ready', () => {
    const state = describeWaitingState(999_000, 1_000_000, 43_200)
    expect(state.phase).toBe('beforeInactive')
    expect(state.text).toBe('Starts at the next epoch.')
    expect(state.text.toLowerCase()).not.toContain('ready')
    expect(state.caveat).toBeUndefined()
  })

  it('is "locked" once inactiveFrom has passed, counting down to the release block (inactiveFrom + blocksPerEpoch), not to inactiveFrom itself', () => {
    // At inactiveFrom exactly, the full epoch remains: 43,200 blocks ≈ 12 hours.
    const atStart = describeWaitingState(1_000_000, 1_000_000, 43_200)
    expect(atStart.phase).toBe('locked')
    expect(atStart.text).toBe('Locked until about 12 hours from now.')

    // Partway through the epoch: 3,600 blocks (~1 hour) remain to the release block.
    const partway = describeWaitingState(1_039_600, 1_000_000, 43_200)
    expect(partway.text).toBe('Locked until about 1 hour from now.')
  })

  it('never says Ready while locked, and always includes the jailed caveat', () => {
    const state = describeWaitingState(1_020_000, 1_000_000, 43_200)
    expect(state.text.toLowerCase()).not.toContain('ready')
    expect(state.caveat).toMatch(/estimate/i)
    expect(state.caveat).toMatch(/jailed/i)
  })

  it('degrades to a plain "locked" message, without a fabricated time, when blocksPerEpoch is unavailable', () => {
    const state = describeWaitingState(1_020_000, 1_000_000, null)
    expect(state.phase).toBe('locked')
    expect(state.text).not.toMatch(/\d/)
  })

  it('is "ready" once the release block has passed, with plain wording and no "release block" jargon', () => {
    const state = describeWaitingState(1_100_000, 1_000_000, 43_200)
    expect(state.phase).toBe('ready')
    expect(state.text.toLowerCase()).not.toContain('release block')
    expect(state.text.toLowerCase()).not.toContain('passed')
    expect(state.caveat).toBeUndefined()
  })

  it('every text is a full sentence, so joining it with the caveat reads correctly', () => {
    const states = [
      describeWaitingState(999_000, 1_000_000, 43_200),
      describeWaitingState(1_000_000, 1_000_000, 43_200),
      describeWaitingState(1_020_000, 1_000_000, null),
      describeWaitingState(1_100_000, 1_000_000, 43_200),
    ]
    for (const state of states)
      expect(state.text).toMatch(/\.$/)
    const locked = describeWaitingState(1_039_600, 1_000_000, 43_200)
    expect(`${locked.text} ${locked.caveat}`).toBe('Locked until about 1 hour from now. This is an estimate. It can take longer if the validator is jailed.')
  })

  it('"ready" exactly at the release block too, not only once past it', () => {
    const state = describeWaitingState(1_043_200, 1_000_000, 43_200)
    expect(state.phase).toBe('ready')
  })
})
