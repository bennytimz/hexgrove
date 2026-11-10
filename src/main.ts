import { inject } from '@vercel/analytics'
import { createApp } from 'vue'
import App from './App.vue'
import './style.css'

const KNOWN_MOCK_FAIL_MODES = [
  'notinpay',
  'timeout',
  'syncing',
  'declined',
  'stakeDeclined',
  'stakeNotSent',
  'stakeNetworkDown',
  'stakeMaybeSent',
  'stakeBlocked',
  'stakeTimedOut',
  'stakeNoAnswer',
]

async function bootstrap() {
  if (import.meta.env.DEV) {
    const params = new URLSearchParams(location.search)

    if (params.get('probe') === '1') {
      const { default: ProbeScreen } = await import('./probe/ProbeScreen.vue')
      createApp(ProbeScreen).mount('#app')
      return
    }

    if (params.get('mock') === '1') {
      const requested = params.get('fail')
      const fail = requested && KNOWN_MOCK_FAIL_MODES.includes(requested) ? requested : null
      if (requested && !fail) {
        console.warn(`[mock] Unknown fail mode "${requested}". Known modes: ${KNOWN_MOCK_FAIL_MODES.join(', ')}.`)
      }

      window.__HEXGROVE_MOCK__ = true
      const noStake = params.get('nostake') === '1'
      const { installMockProvider, isMockWaitScenario } = await import('./mock/provider')
      const requestedWait = params.get('wait')
      if (requestedWait && !isMockWaitScenario(requestedWait)) {
        console.warn(`[mock] Unknown wait scenario "${requestedWait}". Known: before, locked, ready, stuck.`)
      }
      const wait = requestedWait && isMockWaitScenario(requestedWait) ? requestedWait : undefined
      installMockProvider(fail as Parameters<typeof installMockProvider>[0], noStake, wait)
    }
  }
  else {
    // Production only: never in dev, and never alongside mock mode (which only
    // exists inside the DEV branch above). No cookies, no user or wallet data —
    // inject() just counts anonymous page views.
    inject()
  }

  createApp(App).mount('#app')
}

bootstrap()
