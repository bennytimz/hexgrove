/**
 * What the home screen shows while its account state reloads.
 *
 * A first load (or a retry from the error state) shows the full "Loading"
 * placeholder. A quiet refresh, from the always-visible Refresh button,
 * keeps whatever screen is already up (garden, empty state, or "can't see
 * your stake") so nothing blanks out; the button itself shows the loading
 * state instead. The result still replaces it once the reload finishes.
 */

export type CombinedState = 'loading' | 'error' | 'empty' | 'staked' | 'hidden'

export function combinedStateWhileLoading(current: CombinedState, quiet: boolean): CombinedState {
  if (quiet && (current === 'staked' || current === 'empty' || current === 'hidden'))
    return current
  return 'loading'
}
