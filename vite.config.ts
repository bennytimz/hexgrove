import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

// Dev-only: host + allowedHosts let a phone on the same LAN, or an HTTPS
// tunnel, reach this server so it can be opened inside Nimiq Pay.
export default defineConfig({
  plugins: [vue()],
  server: {
    host: true,
    allowedHosts: true,
  },
})
