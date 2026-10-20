import { expect, test, type Page } from '@playwright/test'
import { ADMIN } from '../playwright.config'
import { ADMIN_APP, API, FULLY_BOOKED, LANDING, SEEDED, dayFromToday } from './helpers'

/*
  One customer, start to finish, as they would meet the system.

  Meron lands on the site, finds nothing free on her first dates, picks
  others, is asked to sign in when she books, signs up instead and lands back
  on the car with her dates, tries a booked week and is told so, then
  requests the car. Staff approve it, take payment and hand the car over, and
  at each step her My Bookings page says where things stand.

  Hiwot already has a car out (seeded, 6,000 charged, 1,000 paid). She brings
  it back owing 5,000: the agreement stays open as "returned" until she pays,
  and only then closes.
*/
test.describe.configure({ mode: 'serial' })

const stamp = Date.now()
const meron = {
  first: 'Meron',
  last: `Story${stamp}`,
  email: `meron-${stamp}@example.com`,
  phone: `+2519${String(stamp).slice(-8)}`,
  password: 'e2e-customer-pass',
}
const hiwot = { email: 'out-e2e@example.com', password: process.env.E2E_CUSTOMER_PASSWORD ?? 'e2e-customer-pass' }

// Tomorrow for three days: 3 x 1,100.
const pickup = dayFromToday(1)
const returnDate = dayFromToday(4)
const PRICE = '3,300'

let site: Page
let admin: Page
let meronAgreement: { id: number; number: string }

test.beforeAll(async ({ browser }) => {
  site = await (await browser.newContext()).newPage()
  admin = await (await browser.newContext()).newPage()
  await admin.goto(`${ADMIN_APP}/login`)
  await admin.locator('#username').fill(ADMIN.username)
  await admin.locator('#password').fill(ADMIN.password)
  await admin.locator('button[type="submit"]').click()
  await expect(admin).not.toHaveURL(/\/login/)
})

test.afterAll(async () => {
  await site.context().close()
  await admin.context().close()
})

async function myBookingCard(page: Page, agreementNumber: string) {
  await page.goto(`${LANDING}/my-bookings`)
  return page.locator('div.bg-dark-200').filter({ hasText: agreementNumber })
}

async function bookingsFor(email: string, password: string) {
  const login = await site.request.post(`${API}/api/public/auth/login`, { data: { email, password } })
  expect(login.ok()).toBeTruthy()
  const { access_token } = await login.json()
  const res = await site.request.get(`${API}/api/public/bookings`, {
    headers: { Authorization: `Bearer ${access_token}` },
  })
  return (await res.json()) as { id: number; agreement_number: string; status: string }[]
}

test.describe('Meron: from the landing page to driving away', () => {
  test('she lands on the site and starts a booking', async () => {
    await site.goto(LANDING)
    await expect(site.getByRole('heading', { level: 1 })).toBeVisible()
    await expect(site.locator('#cars').getByRole('button', { name: SEEDED.free })).toBeVisible()
    await site.locator('section').first().getByRole('button', { name: 'Book Now' }).click()
    await expect(site.locator('#fleet-pickup')).toBeFocused()
  })

  test('her first dates have no car free, and she is told what to do', async () => {
    const fleet = site.locator('#cars')
    await site.locator('#fleet-pickup').fill(dayFromToday(FULLY_BOOKED.from + 1))
    await site.locator('#fleet-return').fill(dayFromToday(FULLY_BOOKED.to - 2))
    await site.getByRole('button', { name: 'Show available cars' }).click()

    await expect(fleet.getByText('No cars are free for those dates')).toBeVisible()
    await expect(fleet.getByText(/Try different dates, or call us on \+251/)).toBeVisible()
    await expect(fleet.getByRole('link', { name: 'Book Now' })).toHaveCount(0)
  })

  test('other dates find a car, priced for the whole stay', async () => {
    await site.locator('#fleet-pickup').fill(pickup)
    await site.locator('#fleet-return').fill(returnDate)
    await site.getByRole('button', { name: 'Show available cars' }).click()

    const card = site.locator('#cars .grid > div').filter({ has: site.getByRole('button', { name: SEEDED.free }) })
    await expect(card.getByText('Free for your dates')).toBeVisible()
    await expect(card.getByText(PRICE)).toBeVisible()
    await expect(card.getByText('ETB for 3 days')).toBeVisible()
    await card.getByRole('link', { name: 'Book Now' }).click()
  })

  test('asked to sign in, she signs up and comes back to the car with her dates', async () => {
    await expect(site).toHaveURL(`${LANDING}/login`)
    await site.getByRole('link', { name: /create one/i }).click()
    await expect(site).toHaveURL(`${LANDING}/signup`)

    await site.getByLabel('First name').fill(meron.first)
    await site.getByLabel('Last name').fill(meron.last)
    await site.getByLabel(/^Email/).fill(meron.email)
    await site.getByLabel(/^Phone/).fill(meron.phone)
    await site.getByLabel(/^Password/).fill(meron.password)
    await site.getByLabel(/^Confirm/).fill(meron.password)
    await site.getByRole('button', { name: 'Create account' }).click()

    // Back on the booking page, not the home page.
    await expect(site).toHaveURL(/\/book\/\d+$/)
    await site.getByLabel('ID type').selectOption('passport')
    await site.getByLabel('ID number').fill(`EP${stamp}`)
    await site.getByLabel('Licence number').fill(`DL${stamp}`)
    await site.getByRole('button', { name: 'Continue to booking dates' }).click()
    await expect(site.locator('#booking-pickup')).toHaveValue(new RegExp(`^${pickup}T`))
    await expect(site.locator('#booking-return')).toHaveValue(new RegExp(`^${returnDate}T`))
  })

  test('a week that is already booked is refused before she can send it', async () => {
    const confirm = site.getByRole('button', { name: 'Confirm Booking Request' })
    await site.locator('#booking-pickup').fill(`${dayFromToday(FULLY_BOOKED.from + 1)}T09:00`)
    await site.locator('#booking-return').fill(`${dayFromToday(FULLY_BOOKED.to - 1)}T09:00`)
    await expect(site.getByText('That car is already booked for those dates.', { exact: false })).toBeVisible()
    await expect(confirm).toBeDisabled()

    await site.locator('#booking-pickup').fill(`${pickup}T09:00`)
    await site.locator('#booking-return').fill(`${returnDate}T09:00`)
    await expect(confirm).toBeEnabled()
  })

  test('she requests the car and sees it waiting for review', async () => {
    await site.getByRole('button', { name: 'Confirm Booking Request' }).click()
    await expect(site).toHaveURL(`${LANDING}/my-bookings`)

    const [booking] = await bookingsFor(meron.email, meron.password)
    meronAgreement = { id: booking.id, number: booking.agreement_number }
    const card = site.locator('div.bg-dark-200').filter({ hasText: meronAgreement.number })
    await expect(card.getByText('Pending Review')).toBeVisible()
    await expect(card.getByText(`${PRICE} ETB`)).toBeVisible()
  })

  test('staff approve it, and she is asked to pay before pickup', async () => {
    await admin.goto(`${ADMIN_APP}/agreements/${meronAgreement.id}`)
    await admin.getByRole('button', { name: 'Approve Booking' }).click()
    const terms = admin.locator('form').filter({ has: admin.locator('[id^="approval-"]') })
    await terms.getByRole('button', { name: 'Approve Booking' }).click()
    await expect(terms).toBeHidden()

    const card = await myBookingCard(site, meronAgreement.number)
    await expect(card.getByText('Confirmed – Payment Required Before Pickup')).toBeVisible()
    await expect(card.getByText(`${PRICE} ETB`)).toHaveCount(2) // charged, and due
  })

  test('she pays at the counter and staff hand the car over', async () => {
    await admin.getByRole('button', { name: /Ledger/ }).click()
    await admin.getByRole('button', { name: '+ Post Payment' }).click()
    const pay = admin.getByRole('dialog', { name: 'Post Payment' })
    await pay.getByLabel('Amount (ETB)').fill('3300')
    await pay.getByLabel('Payment Method').selectOption('cbe_birr')
    await pay.locator('button[type="submit"]').click()
    await expect(pay).toBeHidden()

    await admin.getByRole('button', { name: 'Activate (Handover)' }).click()
    const confirm = admin.getByRole('dialog').filter({ hasText: 'Activate this agreement?' })
    await confirm.getByRole('button', { name: 'Activate (Handover)' }).click()
    await expect(admin.getByRole('button', { name: 'Return & Close' })).toBeVisible()
  })

  test('her booking shows the car is hers, paid, with the days left', async () => {
    const card = await myBookingCard(site, meronAgreement.number)
    await expect(card.getByText('Active', { exact: true })).toBeVisible()
    await expect(card.getByText(/\d+ days? left to return/)).toBeVisible()
    await expect(card.getByText('0 ETB', { exact: true })).toBeVisible()
  })
})

test.describe('Hiwot: bringing the car back while still owing money', () => {
  let out: { id: number; number: string }

  test('she signs in and sees her rental', async () => {
    const [booking] = await bookingsFor(hiwot.email, hiwot.password)
    out = { id: booking.id, number: booking.agreement_number }
    expect(booking.status).toBe('active')

    await site.evaluate(() => localStorage.clear())
    await site.goto(`${LANDING}/login`)
    await site.locator('#login-email').fill(hiwot.email)
    await site.locator('#login-password').fill(hiwot.password)
    await site.locator('form').filter({ has: site.locator('#login-email') }).locator('button[type="submit"]').click()
    await expect(site).toHaveURL(`${LANDING}/`)
    const card = await myBookingCard(site, out.number)
    await expect(card.getByText('Active', { exact: true })).toBeVisible()
  })

  test('staff take the car back; with 5,000 owed it stays open', async () => {
    await admin.goto(`${ADMIN_APP}/agreements/${out.id}`)
    await admin.getByRole('button', { name: 'Return & Close' }).click()
    const ret = admin.getByRole('dialog', { name: 'Mark Vehicle Returned' })
    await ret.getByLabel(/Return mileage/i).fill('52000')
    await ret.getByRole('button', { name: 'Confirm Return' }).click()
    await expect(ret).toBeHidden()

    await expect(admin.getByText('Returned', { exact: true }).first()).toBeVisible()
    await expect(admin.getByRole('button', { name: 'Close Agreement' })).toBeVisible()
  })

  test('she sees the car returned and what she still owes', async () => {
    const card = await myBookingCard(site, out.number)
    await expect(card.getByText('Returned – Balance Due')).toBeVisible()
    await expect(card.getByText('5,000 ETB', { exact: true })).toBeVisible()
  })

  test('staff cannot close it until she pays, then it closes', async () => {
    await admin.getByRole('button', { name: 'Close Agreement' }).click()
    const settle = admin.getByRole('dialog', { name: 'Settlement & Close Agreement' })
    await expect(settle.getByRole('button', { name: 'Close Agreement' })).toBeDisabled()
    await expect(settle.getByText('Balance must be zero before closing.', { exact: false })).toBeVisible()

    await settle.getByRole('button', { name: /Record Payment/ }).click()
    const pay = admin.getByRole('dialog', { name: 'Post Payment' })
    await pay.getByLabel('Amount (ETB)').fill('5000')
    await pay.getByLabel('Payment Method').selectOption('cash')
    await pay.locator('button[type="submit"]').click()
    await expect(pay).toBeHidden()

    await expect(settle.getByRole('button', { name: 'Close Agreement' })).toBeEnabled()
    await settle.getByRole('button', { name: 'Close Agreement' }).click()
    await expect(settle).toBeHidden()
    await expect(admin.getByText('Closed', { exact: true }).first()).toBeVisible()
  })

  test('her booking shows it closed and nothing owed', async () => {
    const card = await myBookingCard(site, out.number)
    await expect(card.getByText('Closed', { exact: true })).toBeVisible()
    await expect(card.getByText('0 ETB', { exact: true })).toBeVisible()
  })
})
