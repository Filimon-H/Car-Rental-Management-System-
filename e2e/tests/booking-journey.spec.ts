import { expect, test, type Page } from '@playwright/test'
import { ADMIN } from '../playwright.config'
import { ADMIN_APP, API, LANDING, SEEDED, dayFromToday } from './helpers'

/*
  The whole path a booking takes, across all three apps: a customer signs up
  on the landing site, finds a car for their dates and requests it; staff
  approve it and take payment in the admin app; the customer sees the result.
  The steps share one browser page per side and run in order.
*/
test.describe.configure({ mode: 'serial' })

const stamp = Date.now()
const customer = {
  first: 'Abebe',
  last: `E2E${stamp}`,
  email: `e2e-${stamp}@example.com`,
  phone: `+2519${String(stamp).slice(-8)}`,
  password: 'e2e-customer-pass',
}
// A week from day 10: the weekly rate applies, 6,500 rather than 7 x 1,100.
const pickup = dayFromToday(10)
const returnDate = dayFromToday(17)
const WEEK_PRICE = '6,500'

let site: Page
let admin: Page
let agreementId: number
let agreementNumber: string

test.beforeAll(async ({ browser }) => {
  site = await (await browser.newContext()).newPage()
  admin = await (await browser.newContext()).newPage()
})

test.afterAll(async () => {
  await site.context().close()
  await admin.context().close()
})

test('a visitor signs up', async () => {
  await site.goto(`${LANDING}/signup`)
  await site.getByLabel('First name').fill(customer.first)
  await site.getByLabel('Last name').fill(customer.last)
  await site.getByLabel(/^Email/).fill(customer.email)
  await site.getByLabel(/^Phone/).fill(customer.phone)
  await site.getByLabel(/^Password/).fill(customer.password)
  await site.getByLabel(/^Confirm/).fill(customer.password)
  await site.getByRole('button', { name: 'Create account' }).click()

  await expect(site).toHaveURL(`${LANDING}/`)
  expect(await site.evaluate(() => localStorage.getItem('customer_token'))).toBeTruthy()
})

test('the date search prices a week at the weekly rate', async () => {
  await site.locator('#fleet-pickup').fill(pickup)
  await site.locator('#fleet-return').fill(returnDate)
  await site.getByRole('button', { name: 'Show available cars' }).click()

  const card = site.locator('#cars .grid > div').filter({
    has: site.getByRole('button', { name: SEEDED.free }),
  })
  await expect(card.getByText(WEEK_PRICE)).toBeVisible()
  await expect(card.getByText('ETB for 7 days')).toBeVisible()
  await card.getByRole('link', { name: 'Book Now' }).click()
  await expect(site).toHaveURL(/\/book\/\d+$/)
})

test('the customer requests the car for those dates', async () => {
  // Step 1: identity. A new account has none on file yet.
  await site.getByLabel('ID type').selectOption('national_id')
  await site.getByLabel('ID number').fill(`ID-${stamp}`)
  await site.getByLabel('Licence number').fill(`DL-${stamp}`)
  await site.getByRole('button', { name: 'Continue to booking dates' }).click()

  // Step 2: the dates chosen in the search came along.
  await expect(site.locator('#booking-pickup')).toHaveValue(new RegExp(`^${pickup}T`))
  await expect(site.locator('#booking-return')).toHaveValue(new RegExp(`^${returnDate}T`))
  await expect(site.getByText(WEEK_PRICE).first()).toBeVisible()
  await site.getByRole('button', { name: 'Confirm Booking Request' }).click()

  await expect(site).toHaveURL(`${LANDING}/my-bookings`)
  await expect(site.getByText('Estimated total')).toBeVisible()
  await expect(site.getByText(`${WEEK_PRICE} ETB`)).toBeVisible()

  const token = await site.evaluate(() => localStorage.getItem('customer_token'))
  const res = await site.request.get(`${API}/api/public/bookings`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  expect(res.ok()).toBeTruthy()
  const [booking] = await res.json()
  expect(booking.status).toBe('booking_requested')
  agreementId = booking.id
  agreementNumber = booking.agreement_number
})

test('a second request that clashes with the first is refused', async () => {
  const token = await site.evaluate(() => localStorage.getItem('customer_token'))
  // The seeded Corolla is held from day 30; ask for days 31 to 33.
  const vehicles = await (await site.request.get(`${API}/api/public/vehicles`)).json()
  const held = vehicles.find((v: { model: string }) => v.model === 'Corolla')
  const res = await site.request.post(`${API}/api/public/bookings`, {
    headers: { Authorization: `Bearer ${token}` },
    data: {
      vehicle_id: held.id,
      pickup_datetime: `${dayFromToday(31)}T09:00:00`,
      expected_return_datetime: `${dayFromToday(33)}T09:00:00`,
    },
  })
  expect(res.status()).toBeGreaterThanOrEqual(400)
  expect(JSON.stringify(await res.json())).toContain('booked or out on rental')
})

test('staff sign in to the admin app', async () => {
  await admin.goto(`${ADMIN_APP}/login`)
  await admin.locator('#username').fill(ADMIN.username)
  await admin.locator('#password').fill(ADMIN.password)
  await admin.locator('button[type="submit"]').click()
  await expect(admin).not.toHaveURL(/\/login/)
})

test('staff approve the request', async () => {
  await admin.goto(`${ADMIN_APP}/agreements/${agreementId}`)
  await expect(admin.getByText(agreementNumber).first()).toBeVisible()
  await admin.getByRole('button', { name: 'Approve Booking' }).click()
  // The terms dialog: leave every term unset and confirm.
  const terms = admin.locator('form').filter({ has: admin.locator('[id^="approval-"]') })
  await terms.getByRole('button', { name: 'Approve Booking' }).click()
  await expect(terms).toBeHidden()
  await expect(admin.getByRole('button', { name: 'Approve Booking' })).toHaveCount(0)
})

test('staff take the full payment', async () => {
  await admin.getByRole('button', { name: /Ledger/ }).click()
  await admin.getByRole('button', { name: '+ Post Payment' }).click()
  const dialog = admin.getByRole('dialog', { name: 'Post Payment' })
  await dialog.getByLabel('Amount (ETB)').fill('6500')
  await dialog.getByLabel('Payment Method').selectOption('telebirr')
  await dialog.getByLabel(/Reference/).fill(`TB-${stamp}`)
  await dialog.locator('button[type="submit"]').click()
  await expect(dialog).toBeHidden()
})

test('the customer sees the booking approved and paid', async () => {
  await site.reload()
  const card = site.locator('div.bg-dark-200').filter({ hasText: agreementNumber })
  await expect(card.getByText('Total charge')).toBeVisible()
  await expect(card.getByText('Paid', { exact: true })).toBeVisible()
  // Charged 6,500, paid 6,500, nothing owed.
  await expect(card.getByText(`${WEEK_PRICE} ETB`)).toHaveCount(2)
  await expect(card.getByText('0 ETB', { exact: true })).toBeVisible()
  await expect(card.getByText('Estimated total')).toHaveCount(0)
})
