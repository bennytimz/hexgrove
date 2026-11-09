import { LUNA_PER_NIM } from './luna'

/** Active stake (NIM) -> plots, from the spec's tier table. Honeycomb layouts, so the garden always looks deliberate. */
const PLOT_TIERS: ReadonlyArray<{ stakeNim: bigint, plots: number }> = [
  { stakeNim: 100n, plots: 1 },
  { stakeNim: 5_000n, plots: 3 },
  { stakeNim: 25_000n, plots: 7 },
  { stakeNim: 100_000n, plots: 12 },
  { stakeNim: 400_000n, plots: 19 },
]

/** Below the first tier (100 NIM), there are no plots yet. */
export function plotsForStake(stakedLuna: bigint): number {
  let plots = 0
  for (const tier of PLOT_TIERS) {
    if (stakedLuna >= tier.stakeNim * LUNA_PER_NIM)
      plots = tier.plots
  }
  return plots
}

export interface NextTier {
  plots: number
  thresholdLuna: bigint
}

/** The next unreached tier, or null once already at the top tier (19 plots). */
export function nextTier(stakedLuna: bigint): NextTier | null {
  for (const tier of PLOT_TIERS) {
    const thresholdLuna = tier.stakeNim * LUNA_PER_NIM
    if (stakedLuna < thresholdLuna) {
      return { plots: tier.plots, thresholdLuna }
    }
  }
  return null
}
