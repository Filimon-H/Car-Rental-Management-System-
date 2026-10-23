import { expect, test, type Page } from '@playwright/test'
import { ADMIN } from '../playwright.config'
import { ADMIN_APP, LANDING, SEEDED } from './helpers'

test.use({ actionTimeout: 15_000 })

// All writes happen through the UI. Network responses are observed only to
// identify the newly created agreement and verify persisted financial totals.
// Use real time: book just ahead of now, then wait for pickup before an early
// return. No backdating, database edits, mocked responses, or disabled guards.
function businessInput(ms: number): string {
  return new Date(ms + 3 * 60 * 60 * 1000).toISOString().slice(0, 16)
}

async function payment(page: Page, amount: number) {
  const dialog = page.getByRole('dialog', { name: 'Post Payment', exact: true })
  await dialog.getByLabel('Amount (ETB)').fill(String(amount))
  await dialog.getByLabel('Payment Method').selectOption('cash')
  await dialog.getByLabel(/Reference/).fill(`LIFECYCLE-${amount}`)
  await dialog.locator('button[type="submit"]').click()
  await expect(dialog).toBeHidden()
}

async function customerState(page: Page, number: string, status: string, due: number) {
  const response = page.waitForResponse(r => new URL(r.url()).pathname === '/api/public/bookings' && r.request().method() === 'GET')
  await page.goto(`${LANDING}/my-bookings`)
  const bookings = await (await response).json()
  const saved = bookings.find((b: { agreement_number: string }) => b.agreement_number === number)
  expect(saved).toBeTruthy()
  expect(Number(saved.balance_due)).toBe(due)
  const card = page.locator('div.bg-dark-200').filter({ hasText: number })
  await expect(card.getByText(status, { exact: true })).toBeVisible()
  await expect(card.getByText(`${due.toLocaleString('en-US')} ETB`, { exact: true }).first()).toBeVisible()
  return saved
}

for (const fullPayment of [false, true]) {
  test(`new member completes rental: ${fullPayment ? 'full payment and deposit refund' : 'partial payment, deposit applied, settlement and close'}`, async ({ browser }) => {
    test.setTimeout(210_000)
    const customerContext = await browser.newContext({ timezoneId: 'Africa/Addis_Ababa' })
    const staffContext = await browser.newContext({ timezoneId: 'Africa/Addis_Ababa' })
    const customer = await customerContext.newPage()
    const staff = await staffContext.newPage()
    const stamp = `${Date.now()}`
    const email = `lifecycle-${stamp}@example.com`
    const password = 'Lifecycle-test-pass-42'
    let agreement: { id: number; agreement_number: string }
    let pickup: number
    const errors: string[] = []
    customer.on('pageerror', e => errors.push(`customer: ${e.message}`))
    staff.on('pageerror', e => errors.push(`staff: ${e.message}`))

    try {
      await test.step('Register a new member, then sign in with the saved account', async () => {
        await customer.goto(`${LANDING}/signup`)
        await customer.getByLabel('First name').fill('Lifecycle')
        await customer.getByLabel('Last name').fill(`Member${stamp}`)
        await customer.getByLabel(/^Email/).fill(email)
        await customer.getByLabel(/^Phone/).fill(`+2519${stamp.slice(-8)}`)
        await customer.getByLabel(/^Password/).fill(password)
        await customer.getByLabel(/^Confirm/).fill('different-password')
        await customer.getByRole('button', { name: 'Create account' }).click()
        await expect(customer.getByText('Passwords do not match')).toBeVisible()
        await customer.getByLabel(/^Confirm/).fill(password)
        await customer.getByRole('button', { name: 'Create account' }).click()
        await expect(customer).toHaveURL(`${LANDING}/`)
        await customer.getByRole('button', { name: /Sign out/i }).first().click()
        await customer.goto(`${LANDING}/my-bookings`)
        await expect(customer).toHaveURL(`${LANDING}/login`)
        await customer.locator('#login-email').fill(email)
        await customer.locator('#login-password').fill(password)
        await customer.locator('form').filter({ has: customer.locator('#login-email') }).locator('button[type="submit"]').click()
        await expect(customer).toHaveURL(`${LANDING}/my-bookings`)
      })

      await test.step('Select the car, provide identity details and request a three-day rental', async () => {
        await customer.goto(LANDING)
        const car = customer.locator('#cars .grid > div').filter({ has: customer.getByRole('button', { name: SEEDED.lifecycle }) })
        await car.getByRole('link', { name: 'Book Now' }).click()
        await customer.getByLabel('ID type').selectOption('national_id')
        await customer.getByLabel('ID number').fill(`ID-${stamp}`)
        await customer.getByLabel('Licence number').fill(`DL-${stamp}`)
        await customer.getByRole('button', { name: 'Continue to booking dates' }).click()
        pickup = Math.ceil(Date.now() / 60_000) * 60_000 + 60_000
        await customer.locator('#booking-pickup').fill(businessInput(pickup))
        await customer.locator('#booking-return').fill(businessInput(pickup + 3 * 86400_000))
        await customer.locator('#booking-pickup-location').fill('E2E pickup office')
        await customer.locator('#booking-return-location').fill('E2E return office')
        await customer.locator('#booking-notes').fill('Full lifecycle UI test — early return')
        await expect(customer.getByText('3,300').first()).toBeVisible()
        const created = customer.waitForResponse(r => new URL(r.url()).pathname === '/api/public/bookings' && r.request().method() === 'POST')
        await customer.getByRole('button', { name: 'Confirm Booking Request' }).click()
        const response = await created
        expect(response.ok()).toBeTruthy()
        agreement = await response.json()
        await expect(customer).toHaveURL(`${LANDING}/my-bookings`)
        await expect(customer.getByText('Pending Review', { exact: true })).toBeVisible()
        await expect(customer.getByText('Estimated total')).toBeVisible()
      })

      await test.step('Staff sign in and approve with a deposit and minimum advance', async () => {
        await staff.goto(`${ADMIN_APP}/login`)
        await staff.locator('#username').fill(ADMIN.username)
        await staff.locator('#password').fill(ADMIN.password)
        await staff.locator('button[type="submit"]').click()
        await expect(staff).not.toHaveURL(/\/login/)
        await staff.goto(`${ADMIN_APP}/agreements/${agreement.id}`)
        await expect(staff.getByText(agreement.agreement_number).first()).toBeVisible()
        await staff.getByRole('button', { name: 'Approve Booking', exact: true }).click()
        await staff.locator('#approval-deposit_amount').fill('1000')
        await staff.locator('#approval-advance_payment').fill('1100')
        const form = staff.locator('form').filter({ has: staff.locator('#approval-deposit_amount') })
        await form.getByRole('button', { name: 'Approve Booking', exact: true }).click()
        await expect(form).toBeHidden()
        await customerState(customer, agreement.agreement_number, 'Confirmed – Payment Required Before Pickup', 3300)
      })

      await test.step('Handover is blocked until the agreed deposit and advance are received', async () => {
        await staff.getByRole('button', { name: 'Activate (Handover)', exact: true }).click()
        const confirm = staff.getByRole('dialog').filter({ hasText: 'Activate this agreement?' })
        await confirm.getByRole('button', { name: 'Activate (Handover)', exact: true }).click()
        await expect(staff.getByText(/Required deposit not fully received/)).toBeVisible()
        await expect(staff.getByRole('button', { name: 'Return & Close', exact: true })).toHaveCount(0)

        await staff.getByRole('button', { name: 'Receive Deposit', exact: true }).click()
        const deposit = staff.locator('div').filter({ has: staff.getByRole('heading', { name: 'Receive Deposit', exact: true }) }).filter({ has: staff.locator('form') }).last()
        await deposit.locator('input[type="number"]').fill('1000')
        await deposit.locator('select').selectOption('cash')
        await deposit.locator('button[type="submit"]').click()
        await expect(staff.getByRole('heading', { name: 'Receive Deposit', exact: true })).toBeHidden()
        // Receiving a deposit alone must not count as rental payment.
        await customerState(customer, agreement.agreement_number, 'Confirmed – Payment Required Before Pickup', 3300)

        await staff.getByRole('button', { name: 'Activate (Handover)', exact: true }).click()
        await confirm.getByRole('button', { name: 'Activate (Handover)', exact: true }).click()
        await expect(staff.getByText(/advance payment.*not fully|Required advance/i)).toBeVisible()
        await staff.getByRole('button', { name: /Ledger/ }).click()
        await staff.getByRole('button', { name: '+ Post Payment', exact: true }).click()
        await payment(staff, fullPayment ? 3300 : 1100)
        await customerState(customer, agreement.agreement_number, 'Confirmed – Payment Required Before Pickup', fullPayment ? 0 : 2200)
      })

      await test.step('Hand over the car and verify the customer sees an active agreement', async () => {
        await staff.getByRole('button', { name: 'Activate (Handover)', exact: true }).click()
        await staff.getByRole('dialog').filter({ hasText: 'Activate this agreement?' }).getByRole('button', { name: 'Activate (Handover)', exact: true }).click()
        await expect(staff.getByRole('button', { name: 'Return & Close', exact: true })).toBeVisible()
        await expect(staff.getByText(/Required advance payment not fully received/)).toBeHidden()
        await customerState(customer, agreement.agreement_number, 'Active', fullPayment ? 0 : 2200)
      })

      await test.step('Return the same car after pickup time has arrived', async () => {
        await expect.poll(() => Date.now() >= pickup + 1000, { timeout: 125_000, intervals: [1000] }).toBe(true)
        await staff.getByRole('button', { name: 'Return & Close', exact: true }).click()
        const returned = staff.getByRole('dialog', { name: 'Mark Vehicle Returned', exact: true })
        await returned.getByLabel(/Return mileage/i).fill('52000')
        await returned.getByRole('button', { name: 'Confirm Return', exact: true }).click()
        await expect(returned).toBeHidden()
      })

      if (!fullPayment) {
        await test.step('Deposit pays part of the debt; closing remains blocked until final payment', async () => {
          await customerState(customer, agreement.agreement_number, 'Returned – Balance Due', 1200)
          await staff.getByRole('button', { name: 'Close Agreement', exact: true }).click()
          const settlement = staff.getByRole('dialog', { name: 'Settlement & Close Agreement', exact: true })
          await expect(settlement.getByRole('button', { name: 'Close Agreement', exact: true })).toBeDisabled()
          await settlement.getByRole('button', { name: /Record Payment/ }).click()
          await payment(staff, 1200)
          await expect(settlement.getByRole('button', { name: 'Close Agreement', exact: true })).toBeEnabled()
          await settlement.getByRole('button', { name: 'Close Agreement', exact: true }).click()
          await expect(settlement).toBeHidden()
        })
      }

      await test.step('Reload both apps and verify closure and final deposit accounting', async () => {
        const response = staff.waitForResponse(r => new URL(r.url()).pathname === `/api/agreements/${agreement.id}` && r.request().method() === 'GET')
        await staff.reload()
        const saved = await (await response).json()
        expect(saved.status).toBe('closed')
        expect(Number(saved.total_charges)).toBe(3300)
        expect(Number(saved.total_payments)).toBe(fullPayment ? 3300 : 2300)
        expect(Number(saved.deposit_received)).toBe(1000)
        expect(Number(saved.deposit_applied)).toBe(fullPayment ? 0 : 1000)
        expect(Number(saved.deposit_returned)).toBe(fullPayment ? 1000 : 0)
        expect(Number(saved.deposit_held)).toBe(0)
        expect(Number(saved.balance_due)).toBe(0)
        await expect(staff.getByText('Closed', { exact: true }).first()).toBeVisible()
        const ledgerResponse = staff.waitForResponse(r => new URL(r.url()).pathname === `/api/agreements/${agreement.id}/ledger` && r.request().method() === 'GET')
        await staff.getByRole('button', { name: /Ledger/ }).click()
        const ledger = await (await ledgerResponse).json() as { entry_type: string }[]
        expect(ledger.map(e => e.entry_type).sort()).toEqual(
          (fullPayment
            ? ['charge', 'payment', 'deposit', 'deposit_return']
            : ['charge', 'payment', 'payment', 'deposit', 'deposit_applied']).sort()
        )
        await customerState(customer, agreement.agreement_number, 'Closed', 0)
        await expect(customer.getByRole('button', { name: 'Confirm Booking Request', exact: true })).toHaveCount(0)
        expect(errors).toEqual([])
      })

      await test.step('The returned car is available for a new reservation', async () => {
        await customer.goto(LANDING)
        await customer.locator('#fleet-pickup').fill(businessInput(pickup + 86400_000).slice(0, 10))
        await customer.locator('#fleet-return').fill(businessInput(pickup + 2 * 86400_000).slice(0, 10))
        await customer.getByRole('button', { name: 'Show available cars' }).click()
        await expect(customer.locator('#cars').getByText('Every car below is free for your dates')).toBeVisible()
        await expect(customer.locator('#cars').getByRole('button', { name: SEEDED.lifecycle })).toBeVisible()
      })
    } finally {
      await customerContext.close()
      await staffContext.close()
    }
  })
}
