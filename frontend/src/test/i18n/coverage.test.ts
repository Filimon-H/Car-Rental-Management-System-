import { describe, it, expect } from 'vitest'
import en from '@/i18n/locales/en.json'
import am from '@/i18n/locales/am.json'

type Tree = { [k: string]: string | Tree }

function flatten(tree: Tree, prefix = ''): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(tree)) {
    const key = prefix ? `${prefix}.${k}` : k
    if (typeof v === 'string') out[key] = v
    else Object.assign(out, flatten(v, key))
  }
  return out
}

const flatEn = flatten(en as Tree)
const flatAm = flatten(am as Tree)
const ETHIOPIC = /[ሀ-፿]/

describe('translation coverage', () => {
  it('has an Amharic entry for every English key', () => {
    const missing = Object.keys(flatEn).filter((k) => !(k in flatAm))
    expect(missing).toEqual([])
  })

  it('has no Amharic keys the English file lacks', () => {
    const extra = Object.keys(flatAm).filter((k) => !(k in flatEn))
    expect(extra).toEqual([])
  })

  it('leaves no Amharic value as untranslated English prose', () => {
    // A value identical to English is only acceptable when it carries no
    // translatable prose — a placeholder like an email, or digits and symbols.
    const suspicious = Object.entries(flatAm).filter(([key, value]) => {
      if (value !== flatEn[key]) return false
      if (ETHIOPIC.test(value)) return false
      if (/^[^A-Za-z]*$/.test(value)) return false
      if (/@|https?:|\{\{/.test(value)) return false
      return true
    })
    expect(suspicious.map(([k]) => k)).toEqual([])
  })

  it('keeps interpolation variables identical across languages', () => {
    const vars = (s: string) => (s.match(/\{\{\s*\w+\s*\}\}/g) ?? []).sort().join(',')
    const mismatched = Object.keys(flatEn).filter(
      (k) => flatAm[k] !== undefined && vars(flatEn[k]) !== vars(flatAm[k])
    )
    expect(mismatched).toEqual([])
  })
})
