import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// Node provides this when Vite loads the config; the project has no Node types.
declare const process: { env: Record<string, string | undefined> }

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
    strictPort: true,
    proxy: {
      // Overridable so the end-to-end suite can point a throwaway copy of the
      // site at its own throwaway backend instead of the real one.
      '/api': process.env.API_PROXY_TARGET || 'http://localhost:8001',
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
