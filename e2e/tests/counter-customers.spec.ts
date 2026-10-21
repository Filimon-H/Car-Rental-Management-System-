import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'
import { expect, test, type Page } from '@playwright/test'
import { ADMIN } from '../playwright.config'
import { ADMIN_APP, API, LANDING } from './helpers'

/*
  Customers first entered at the counter (seeded, each with a past rental and
  no website login) getting online.

  Tsion signs up on the website with the phone we have for her and confirms
  on Telegram. The suite cannot reach Telegram, so scripts/fake-telegram.py
  feeds the bot the two updates Telegram would send: /start from the link,
  then her shared contact.

  Dawit has no Telegram: staff create an invite link on his customer page,
  and he sets up his account from it.
*/
test.describe.configure({ mode: 'serial' })

const BACKEND = resolve(__dirname, '../../backend')
const E2E_DB = resolve(__dirname, '../.tmp/e2e.db')

function telegram(token: string, phone: string, ...flags: string[]): string {
  return execFileSync(
    resolve(BACKEND, '.venv/bin/python'),
    [resolve(__dirname, '../scripts/fake-telegram.py'), token, phone, ...flags],
    {
      cwd: BACKEND,
      env: { ...process.env, DATABASE_URL: `sqlite:///${E2E_DB}`, TELEGRAM_BOT_ENABLED: 'false' },
      encoding: 'utf8',
    }
  )
}

async function signUp(page: Page, first: string, phone: string, email: string) {
  await page.goto(`${LANDING}/signup`)
  await page.getByLabel('First name').fill(first)
  await page.getByLabel('Last name').fill('Counter')
  await page.getByLabel(/^Email/).fill(email)
  await page.getByLabel(/^Phone/).fill(phone)
  await page.getByLabel(/^Password/).fill('counter-pass-1')
  await page.getByLabel(/^Confirm/).fill('counter-pass-1')
  await page.getByRole('button', { name: 'Create account' }).click()
}

test.describe('Tsion: confirms on Telegram', () => {
  let token: string

  test('signing up with her phone asks her to confirm instead of refusing', async ({ page }) => {
    await signUp(page, 'Tsion', '0911000003', `tsion-${Date.now()}@example.com`)

    await expect(page.getByRole('heading', { name: "You're already one of our customers" })).toBeVisible()
    const link = page.getByRole('link', { name: 'Confirm on Telegram' })
    const href = (await link.getAttribute('href')) ?? ''
    expect(href).toMatch(/^https:\/\/t\.me\/NodE2EBot\?start=claim_[\w-]+$/)
    token = href.split('claim_')[1]

    // A forwarded contact card is not proof, and nothing is linked.
    const refused = telegram(token, '+251911000003', '--forwarded')
    expect(refused).toContain('Share your own phone number')
    await expect(page.getByText('Waiting for Telegram…')).toBeVisible()

    // Her own number, shared from her own account: linked, and the waiting
    // page signs her in by itself.
    const confirmed = telegram(token, '+251911000003')
    expect(confirmed).toContain('Confirmed, Tsion!')
    await expect(page).toHaveURL(`${LANDING}/`, { timeout: 15_000 })

    await page.goto(`${LANDING}/my-bookings`)
    await expect(page.getByText('E2E-PAST-TG')).toBeVisible()
  })
})

test.describe('Dawit: invited by staff', () => {
  let admin: Page
  let inviteUrl: string

  test.beforeAll(async ({ browser }) => {
    admin = await (await browser.newContext()).newPage()
    await admin.goto(`${ADMIN_APP}/login`)
    await admin.locator('#username').fill(ADMIN.username)
    await admin.locator('#password').fill(ADMIN.password)
    await admin.locator('button[type="submit"]').click()
    await expect(admin).not.toHaveURL(/\/login/)
  })

  test.afterAll(async () => {
    await admin.context().close()
  })

  test('staff create an invite link on his customer page', async ({ request }) => {
    const login = await request.post(`${API}/api/auth/login`, {
      data: { username: ADMIN.username, password: ADMIN.password },
    })
    const { access_token } = await login.json()
    const found = await request.get(`${API}/api/customers/search?q=Dawit`, {
      headers: { Authorization: `Bearer ${access_token}` },
    })
    const [dawit] = await found.json()

    await admin.goto(`${ADMIN_APP}/customers/${dawit.id}`)
    const card = admin.getByRole('region', { name: 'Online account' })
    await expect(card.getByText(/cannot sign in on the website yet/)).toBeVisible()
    await card.getByRole('button', { name: 'Create invite link' }).click()

    inviteUrl = (await card.locator('code').textContent()) ?? ''
    expect(inviteUrl).toMatch(new RegExp(`^${LANDING}/claim/[\\w-]+$`))
    await expect(card.getByText(/Set up your Nod Car Rent online account/)).toBeVisible()
  })

  test('he opens it, sets a password, and sees his past rental', async ({ page }) => {
    await page.goto(inviteUrl)
    await expect(page.getByRole('heading', { name: 'Welcome, Dawit' })).toBeVisible()
    await page.getByLabel('Email address').fill(`dawit-${Date.now()}@example.com`)
    await page.getByLabel('Password', { exact: true }).fill('counter-pass-1')
    await page.getByLabel('Confirm password').fill('counter-pass-1')
    await page.getByRole('button', { name: 'Set up my account' }).click()

    await expect(page).toHaveURL(`${LANDING}/my-bookings`)
    await expect(page.getByText('E2E-PAST-INV')).toBeVisible()
  })

  test('the link works once, and staff see the account', async ({ page }) => {
    await page.goto(inviteUrl)
    await expect(page.getByRole('heading', { name: "This link can't be used" })).toBeVisible()
    await expect(page.getByText('already been used')).toBeVisible()

    await admin.reload()
    const card = admin.getByRole('region', { name: 'Online account' })
    await expect(card.getByText('Signs in on the website as')).toBeVisible()
  })
})
