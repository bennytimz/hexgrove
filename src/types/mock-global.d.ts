declare global {
  interface Window {
    /** Set only by the dev-only mock (src/mock/provider.ts) when ?mock=1 is active. */
    __HEXGROVE_MOCK__?: boolean
  }
}

export {}
