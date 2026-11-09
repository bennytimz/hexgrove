import { createApp } from 'vue'
import App from './App.vue'
import './style.css'

const KNOWN_MOCK_FAIL_MODES = ['notinpay', 'timeout', 'syncing', 'declined']

async function bootstrap() {
  if (import.meta.env.DEV) {
    const params = new URLSearchParams(location.search)
    if (params.get('mock') === '1') {
      const requested = params.get('fail')
      const fail = requested && KNOWN_MOCK_FAIL_MODES.includes(requested) ? requested : null
      if (requested && !fail) {
        console.warn(`[mock] Unknown fail mode "${requested}". Known modes: ${KNOWN_MOCK_FAIL_MODES.join(', ')}.`)
      }

      window.__HEXGROVE_MOCK__ = true
      const { installMockProvider } = await import('./mock/provider')
      installMockProvider(fail as Parameters<typeof installMockProvider>[0])
    }
  }

  createApp(App).mount('#app')
}

bootstrap()
