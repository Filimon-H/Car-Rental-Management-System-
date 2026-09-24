/**
 * Deployment-configurable URLs, and the demo-data boundary.
 *
 * Two bugs live here. The staff-login link was hardcoded to
 * http://localhost:3000/login in two places, which is dead for every real
 * visitor and publishes the admin app's location. And the fleet section fell
 * back to a hardcoded demo array when the API failed, advertising vehicles
 * the company does not own.
 *
 * Sources are read through import.meta.glob rather than node:fs so this
 * type-checks under the app's tsconfig, which has no Node types.
 */
import { describe, expect, it } from 'vitest'

import { ADMIN_BASE_URL, API_BASE_URL, STAFF_LOGIN_URL } from '../services/apiClient'
import amLocale from '../i18n/locales/am.json'
import enLocale from '../i18n/locales/en.json'

const sources = import.meta.glob<string>(
  [
    '../components/*.tsx',
    '../components/ui/*.tsx',
    '../pages/*.tsx',
    '../App.tsx',
    '../main.tsx',
    '../data/cars.ts',
    '../services/adminAuth.ts',
  ],
  { query: '?raw', import: 'default', eager: true }
)

function source(name: string): string {
  const key = Object.keys(sources).find((k) => k.endsWith(`/${name}`))
  if (!key) throw new Error(`no source loaded for ${name} (have ${Object.keys(sources)})`)
  return sources[key]
}

/**
 * Source with comments stripped.
 *
 * The comments explaining these removals quote the old data by name, so an
 * assertion against the raw text would match its own documentation.
 */
function code(name: string): string {
  return source(name)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
}

describe('URLs default to same-origin paths', () => {
  it('the admin app is not pinned to a developer machine', () => {
    expect(ADMIN_BASE_URL).toBe('/admin')
    expect(STAFF_LOGIN_URL).toBe('/admin/login')
  })

  it('the API follows the same rule', () => {
    expect(API_BASE_URL).toBe('/api')
  })

  it('no source file hardcodes the admin dev URL', () => {
    for (const file of ['Footer.tsx', 'LoginPage.tsx']) {
      expect(source(file)).not.toMatch(/['"`]https?:\/\/localhost:3000/)
    }
  })

  it('the login handoff builds its target from the shared constant', () => {
    expect(source('LoginPage.tsx')).toContain('ADMIN_BASE_URL')
  })
})

describe('the demo car array never reaches customers as real stock', () => {
  it('the fleet section does not import it', () => {
    // `cars` held a Land Cruiser, a 12-seat Hiace and a Hyundai Accent, none
    // of which are in the fleet. Importing only contactInfo keeps them out.
    expect(source('Fleet.tsx')).not.toMatch(
      /import \{[^}]*\bcars\b[^}]*\} from '\.\.\/data\/cars'/
    )
  })

  it('the fleet section handles failure, loading and empty explicitly', () => {
    const fleet = source('Fleet.tsx')
    expect(fleet).toContain('isError')
    expect(fleet).toContain('isLoading')
    expect(fleet).toContain('No vehicles listed right now')
    expect(fleet).not.toContain('StaticCarCard')
  })

  it('the hero makes no per-vehicle capacity claim', () => {
    // It read seats/transmission off the demo entries, so the first thing a
    // visitor saw was a 7-seater the company cannot supply.
    const hero = source('Hero.tsx')
    expect(hero).not.toContain('current.seats')
    expect(hero).not.toContain('current.transmission')
  })
})

describe('hero copy is translated', () => {
  it('every hero key exists in both locales', () => {
    expect(Object.keys(amLocale.hero).sort()).toEqual(Object.keys(enLocale.hero).sort())
  })

  it('the new hero strings are actually in Amharic', () => {
    // Ethiopic block; "24/7" stays numeric in both locales.
    expect(amLocale.hero.insured).toMatch(/[ሀ-፿]/)
    expect(amLocale.hero.delivery).toMatch(/[ሀ-፿]/)
  })
})

describe('no invented customer reviews are published', () => {
  it('the fabricated testimonials are gone from the data file', () => {
    // Three reviews nobody wrote, shown with five-star ratings as if real.
    const data = code('cars.ts')
    for (const name of ['Michael T.', 'Sarah K.', 'Dawit A.']) {
      expect(data).not.toContain(name)
    }
    expect(data).not.toMatch(/export const testimonials/)
  })

  it('the reviews section makes no attributed claim', () => {
    const section = code('Testimonials.tsx')
    expect(section).not.toContain("from '../data/cars'")
    expect(section).not.toContain('rating')
  })

  it('the fleet count it shows comes from the API, not a literal', () => {
    const section = source('Testimonials.tsx')
    expect(section).toContain('bookingService.getVehicles')
    // Omitted rather than guessed when the call fails.
    expect(section).toContain('vehicles?.length ?? null')
  })
})

describe('keyboard and screen-reader access', () => {
  it('every button has an accessible name', () => {
    // 26 of 34 buttons announced as just "button": the fleet cards' photo
    // arrows and dots had no text, no aria-label and no title.
    const offenders: string[] = []
    for (const [path, code] of Object.entries(sources)) {
      if (!path.endsWith('.tsx')) continue
      for (const m of code.matchAll(/<button\b/g)) {
        let i = m.index! + m[0].length
        let depth = 0
        while (i < code.length) {
          const c = code[i]
          if (c === '{') depth++
          else if (c === '}') depth--
          else if (c === '>' && depth === 0) break
          i++
        }
        const tag = code.slice(m.index!, i + 1)
        const close = code.indexOf('</button>', i)
        const inner = close === -1 ? '' : code.slice(i + 1, close)
        const text = inner.replace(/<[^>]*>/g, '')
        const named =
          /aria-label|aria-labelledby|title=/.test(tag) || /[A-Za-z]/.test(text)
        if (!named) offenders.push(`${path}:${code.slice(0, m.index!).split('\n').length}`)
      }
    }
    expect(offenders).toEqual([])
  })

  it('the carousel controls name the vehicle they belong to', () => {
    const fleet = source('Fleet.tsx')
    expect(fleet).toContain('Previous photo of ${label}')
    expect(fleet).toContain('Next photo of ${label}')
    expect(fleet).toContain('aria-current')
  })

  it('a skip link precedes the 20+ header links', () => {
    const app = source('App.tsx')
    expect(app).toContain('Skip to main content')
    expect(app).toContain('href="#main"')
    // Header/Footer must sit outside main, or there is nothing to skip.
    expect(app).toMatch(/<main id="main">/)
  })
})

describe('every translation key a component uses exists', () => {
  /*
    A section can lose its i18n block and still build, still pass a
    key-parity check between locales, and still render raw "proof.eyebrow"
    strings to the visitor. This walks the other direction: from the t()
    calls in the source to the locale files.
  */
  function lookup(locale: Record<string, unknown>, key: string): unknown {
    return key.split('.').reduce<unknown>(
      (node, part) =>
        node && typeof node === 'object' ? (node as Record<string, unknown>)[part] : undefined,
      locale
    )
  }

  const used = new Set<string>()
  for (const [path, src] of Object.entries(sources)) {
    if (!path.endsWith('.tsx')) continue
    for (const m of src.matchAll(/\bt\(\s*'([A-Za-z0-9_.]+)'/g)) used.add(m[1])
  }

  it('finds t() calls to check', () => {
    expect(used.size).toBeGreaterThan(10)
  })

  it.each([
    ['en', enLocale],
    ['am', amLocale],
  ])('%s defines them all', (_name, locale) => {
    const missing = [...used]
      .filter((key) => typeof lookup(locale as Record<string, unknown>, key) !== 'string')
      .sort()
    expect(missing).toEqual([])
  })
})

describe('staff tokens never rest on the public origin', () => {
  it('the admin auth store writes no admin_* key', () => {
    // The public marketing origin held admin_access_token and, worse, a
    // refresh token that outlives it. Any XSS here would hand over a staff
    // session.
    const store = code('adminAuth.ts')
    expect(store).not.toMatch(/setItem\(\s*['"`]admin_/)
  })

  it('it still clears tokens an older build left behind', () => {
    const store = source('adminAuth.ts')
    expect(store).toContain('purgeLegacyAdminTokens')
    expect(store).toMatch(/removeItem\(\s*['"`]admin_access_token/)
  })

  it('the purge runs on boot', () => {
    expect(code('main.tsx')).toContain('purgeLegacyAdminTokens()')
  })

  it('the login handoff reads the tokens from the response, not storage', () => {
    const login = code('LoginPage.tsx')
    expect(login).not.toMatch(/getItem\(\s*['"`]admin_/)
    expect(login).toContain('await adminLogin(')
  })
})

describe('the booking form guards its own inputs', () => {
  it('past pickups and backwards ranges cannot be submitted', () => {
    const page = code('BookingPage.tsx')
    // Neither input had a min, so a three-week-old pickup was selectable,
    // priced, and only refused after a round-trip.
    expect(page).toContain('min={minPickup}')
    expect(page).toContain('min={pickup || minPickup}')
    expect(page).toContain('blockedReason')
  })

  it('editing a date clears the previous submission error', () => {
    const page = code('BookingPage.tsx')
    expect(page).toContain('onClearError')
    expect(page).toContain('changeDates')
  })

  it('an expired document is called out where it is entered', () => {
    const page = code('BookingPage.tsx')
    expect(page).toContain('isExpired(form.license_expiry)')
    expect(page).toContain('isExpired(form.id_expiry)')
  })
})

describe('cancelling a booking is deliberate', () => {
  it('no native confirm or alert remains', () => {
    // window.confirm blocks the main thread and froze the page under
    // automation; it also named no booking.
    for (const [path, src] of Object.entries(sources)) {
      if (!path.endsWith('MyBookingsPage.tsx')) continue
      const body = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
      expect(body).not.toMatch(/\bconfirm\(/)
      expect(body).not.toMatch(/\balert\(/)
    }
  })

  it('the dialog names the booking being cancelled', () => {
    const page = code('MyBookingsPage.tsx')
    expect(page).toContain('ConfirmModal')
    expect(page).toContain('pendingCancel.agreement_number')
  })

  it('the extend panel no longer says Cancel too', () => {
    const page = code('MyBookingsPage.tsx')
    expect(page).toContain('Close')
  })

  it('the extend picker excludes the current return date', () => {
    // min was the current return date, which the server then refused.
    const page = code('MyBookingsPage.tsx')
    expect(page).toContain('min={dayAfter(b.expected_return_datetime)}')
  })

  it('a pending booking shows its estimate, not a zero ledger', () => {
    const page = code('MyBookingsPage.tsx')
    expect(page).toContain('estimatedTotal(b)')
  })
})
