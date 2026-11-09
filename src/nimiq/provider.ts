import type { NimiqProvider } from '@nimiq/mini-app-sdk'
import { getHostNetwork, init, NimiqProviderError } from '@nimiq/mini-app-sdk'

export { getHostNetwork, NimiqProviderError }
export type { NimiqProvider }

const DEFAULT_TIMEOUT_MS = 10_000

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
