import { describe, it, expect, beforeAll } from 'vitest'
import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import en from '@/i18n/locales/en.json'
import am from '@/i18n/locales/am.json'

const ETHIOPIC = /[ሀ-፿]/

beforeAll(async () => {
  await i18n.use(initReactI18next).init({
    resources: { en: { translation: en }, am: { translation: am } },
    lng: 'am',
    fallbackLng: 'en',
    interpolation: { escapeValue: false },
  })
})

/**
 * Keys that drive chrome the user sees on every screen. These were the ones
 * that stayed English after the first sweep, because they live in module-level
 * constants and object literals that a `>Text<` search never matched.
 */
const CHROME_KEYS = [
  // sidebar groups and items
  'nav.overview',
  'nav.rentals',
  'nav.fleetAndPeople',
  'nav.financeAndOps',
  'nav.dashboard',
  'nav.agreements',
  'nav.wedding',
  'nav.vehicles',
  'nav.drivers',
  'nav.customers',
  'nav.vendors',
  'nav.collaterals',
  'nav.ledger',
  'nav.inspections',
  'nav.userManagement',
  'nav.adminSettings',
  'nav.newAgreement',
  // ledger tabs and summary cards
  'ledger.byCustomer',
  'ledger.byAgreement',
  'ledger.vendorsTab',
  'ledger.financialSummary',
  'ledger.totalCharged',
  'ledger.totalPaid',
  'ledger.depositHeld',
  'ledger.settled',
  // ledger entry badges
  'entryType.rentalCharge',
  'entryType.payment',
  'entryType.depositReceived',
  // dashboard
  'dashboardCards.acrossActiveOverdue',
]

describe('Amharic rendering', () => {
  it('resolves every chrome key to Ethiopic script', () => {
    const stillEnglish = CHROME_KEYS.filter((k) => !ETHIOPIC.test(i18n.t(k)))
    expect(stillEnglish).toEqual([])
  })

  it('never falls back to the key name itself', () => {
    const unresolved = CHROME_KEYS.filter((k) => i18n.t(k) === k)
    expect(unresolved).toEqual([])
  })

  it('switches back to English cleanly', async () => {
    await i18n.changeLanguage('en')
    expect(i18n.t('nav.userManagement')).toBe('User Management')
    expect(i18n.t('ledger.byAgreement')).toBe('By Agreement')
    await i18n.changeLanguage('am')
    expect(ETHIOPIC.test(i18n.t('nav.userManagement'))).toBe(true)
  })
})
