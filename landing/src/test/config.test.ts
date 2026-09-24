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
  ['../components/*.tsx', '../pages/*.tsx'],
  { query: '?raw', import: 'default', eager: true }
)

function source(name: string): string {
  const key = Object.keys(sources).find((k) => k.endsWith(`/${name}`))
  if (!key) throw new Error(`no source loaded for ${name} (have ${Object.keys(sources)})`)
  return sources[key]
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
