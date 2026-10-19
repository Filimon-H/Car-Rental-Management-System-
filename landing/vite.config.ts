import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
    strictPort: true,
    proxy: {
      '/api': 'http://localhost:8001',
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    // Let tests read index.css (layout rules such as scroll margins are
    // asserted there); other stylesheets stay unprocessed.
    css: { include: [/index\.css/] },
  },
})
