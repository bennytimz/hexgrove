import type { Network, NimiqProvider } from '@nimiq/mini-app-sdk'
import { getHostNetwork, init, NimiqProviderError } from '@nimiq/mini-app-sdk'

export { getHostNetwork, NimiqProviderError }
export type { NimiqProvider }

const DEFAULT_TIMEOUT_MS = 10_000

/** Known-working testnet RPC endpoint (same one NimJar's src/server.js defaults to). */
export const DEFAULT_TESTNET_RPC_URL = 'https://rpc.testnet.nimiqwatch.com'
/**
 * Mainnet RPC endpoint, same one NimJar's src/server.js defaults to.
 * UNVERIFIED — not yet confirmed working from this app on a real mainnet
 * Nimiq Pay session (CORS, correctness, everything). See docs/SPEC.md,
 * Open questions.
 */
export const DEFAULT_MAINNET_RPC_URL = 'https://rpc.nimiqwatch.com'

/**
 * Picks the RPC endpoint matching Nimiq Pay's active network — the Mini
 * App SDK's setRPCUrl requires a URL matching the host's current network.
 * Unknown or missing network (outside Nimiq Pay, or an older host that
 * doesn't report one) falls back to testnet, matching this app's
 * established testnet-first development default.
 */
export function rpcUrlForNetwork(network: Network | undefined): string {
  return network === 'mainnet' ? DEFAULT_MAINNET_RPC_URL : DEFAULT_TESTNET_RPC_URL
}

let providerPromise: Promise<NimiqProvider> | null = null

/**
 * Waits for Nimiq Pay to inject its provider. The result is memoized so every
 * caller shares one connection; call resetProvider() before retrying after a
 * failure, since init() itself cannot be retried once rejected.
 */
export function getProvider(timeout = DEFAULT_TIMEOUT_MS): Promise<NimiqProvider> {
  if (!providerPromise) {
    providerPromise = init({ timeout })
  }
  return providerPromise
}

export function resetProvider(): void {
  providerPromise = null
}
