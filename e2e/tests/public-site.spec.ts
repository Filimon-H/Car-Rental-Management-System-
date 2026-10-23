import { expect, test } from '@playwright/test'
import { LANDING, SEEDED, dayFromToday } from './helpers'

test.describe('public site', () => {
  test('home page lists the real fleet', async ({ page }) => {
    await page.goto(LANDING)
    const fleet = page.locator('#cars')
    await expect(fleet.getByRole('button', { name: SEEDED.free })).toBeVisible()
    await expect(fleet.getByRole('button', { name: SEEDED.held })).toBeVisible()
  })

  test('Book Now in the hero puts the cursor in the date search', async ({ page }) => {
    await page.goto(LANDING)
    await page.locator('section').first().getByRole('button', { name: 'Book Now' }).click()
    await expect(page.locator('#fleet-pickup')).toBeFocused()
  })

  test('date search leaves out a car that is held for those dates', async ({ page }) => {
    await page.goto(LANDING)
    const fleet = page.locator('#cars')
    await page.locator('#fleet-pickup').fill(dayFromToday(31))
    await page.locator('#fleet-return').fill(dayFromToday(33))
    await page.getByRole('button', { name: 'Show available cars' }).click()

    await expect(fleet.getByText('Every car below is free for your dates')).toBeVisible()
    await expect(fleet.getByRole('button', { name: SEEDED.free })).toBeVisible()
    await expect(fleet.getByRole('button', { name: SEEDED.held })).toHaveCount(0)
  })

  test('date search offers the held car again once its hold is over', async ({ page }) => {
    await page.goto(LANDING)
    const fleet = page.locator('#cars')
    await page.locator('#fleet-pickup').fill(dayFromToday(40))
    await page.locator('#fleet-return').fill(dayFromToday(42))
    await page.getByRole('button', { name: 'Show available cars' }).click()

    await expect(fleet.getByRole('button', { name: SEEDED.held })).toBeVisible()
    await expect(fleet.getByRole('button', { name: SEEDED.free })).toBeVisible()
    // Priced for the whole window, not per day.
    await expect(fleet.getByText('ETB for 2 days').first()).toBeVisible()
  })

  test('the car details dialog opens from the keyboard and closes with Escape', async ({ page }) => {
    await page.goto(LANDING)
    const name = page.locator('#cars').getByRole('button', { name: SEEDED.free })
    await name.focus()
    await page.keyboard.press('Enter')
    const dialog = page.getByRole('dialog', { name: SEEDED.free })
    await expect(dialog).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
    await expect(name).toBeFocused()
  })

  test('contact form will not send with a malformed email', async ({ page }) => {
    await page.goto(`${LANDING}/#contact`)
    const contact = page.locator('#contact')
    await contact.locator('#contact-name').fill('E2E Visitor')
    await contact.locator('#contact-email').fill('not-an-email')
    await contact.locator('#contact-message').fill('Do you deliver to Bole?')
    await expect(contact.locator('#contact-email')).toHaveAttribute('aria-invalid', 'true')
    await expect(contact.locator('button[type="submit"]')).toBeDisabled()
  })

  test('an unknown address shows the not-found page', async ({ page }) => {
    await page.goto(`${LANDING}/no-such-page`)
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await expect(page.locator('#cars')).toHaveCount(0)
  })

  test('My Bookings asks a signed-out visitor to sign in', async ({ page }) => {
    await page.goto(`${LANDING}/my-bookings`)
    await expect(page).toHaveURL(/\/login$/)
  })
})
