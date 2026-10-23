import { defineConfig, devices } from '@playwright/test'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

/**
 * End-to-end suite for the landing site, the admin app and the API.
 *
 * Everything runs against a throwaway copy: start-backend.sh builds a fresh
 * database from the real migrations, seeds it, and serves it on its own
 * port; both frontends are started on their own ports and proxied to it.
 * Nothing here can reach the real database or the real servers, and
 * reuseExistingServer is off so a stray dev server is never mistaken for
 * the test one.
 */
export const PORTS = {
  api: Number(process.env.E2E_API_PORT ?? 8101),
  landing: Number(process.env.E2E_LANDING_PORT ?? 5274),
  admin: Number(process.env.E2E_ADMIN_PORT ?? 3100),
}
export const ADMIN = { username: 'admin', password: process.env.E2E_ADMIN_PASSWORD ?? 'e2e-admin-pass' }

const api = `http://127.0.0.1:${PORTS.api}`

// Use an already-installed Chromium when there is one, so the suite runs on
// machines that cannot download browsers.
const cached = join(
  homedir(),
  'Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'
)
const executablePath = process.env.E2E_CHROMIUM ?? (existsSync(cached) ? cached : undefined)

export default defineConfig({
  testDir: './tests',
  // One backend database, shared: run the flows in order.
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 45_000,
  expect: { timeout: 8_000 },
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    timezoneId: 'Africa/Addis_Ababa',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], launchOptions: { executablePath } },
    },
  ],
  webServer: [
    {
      command: './scripts/start-backend.sh',
      url: `${api}/health`,
      env: { E2E_API_PORT: String(PORTS.api), E2E_LANDING_PORT: String(PORTS.landing), E2E_ADMIN_PASSWORD: ADMIN.password },
      reuseExistingServer: false,
      timeout: 120_000,
    },
    // VITE_API_BASE_URL is pinned to the proxy path: frontend/.env sets an
    // absolute URL to the real API, and a variable already in the
    // environment takes precedence over .env files.
    {
      command: `npm --prefix ../landing run dev -- --port ${PORTS.landing} --strictPort`,
      url: `http://localhost:${PORTS.landing}`,
      env: { API_PROXY_TARGET: api, VITE_API_BASE_URL: '/api', VITE_ADMIN_URL: `http://localhost:${PORTS.admin}` },
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command: `npm --prefix ../frontend run dev -- --port ${PORTS.admin} --strictPort`,
      url: `http://localhost:${PORTS.admin}`,
      env: { API_PROXY_TARGET: api, VITE_API_BASE_URL: '/api' },
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
})
