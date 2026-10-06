import { describe, expect, it } from 'vitest'
import { APP_LANGUAGE_OPTIONS, normalizeAppLanguage, RTL_APP_LANGUAGES } from '../shared/languages'

describe('language registry', () => {
  it('exposes the full supported locale list for settings', () => {
    expect(APP_LANGUAGE_OPTIONS).toHaveLength(12)
    expect(APP_LANGUAGE_OPTIONS.map((option) => option.code)).toEqual([
      'en',
      'zh',
      'zh-TW',
      'ja',
      'ko',
      'fr',
      'de',
      'es',
      'pt',
      'it',
      'ru',
      'ar',
    ])
  })

  it('normalizes regional language tags to supported app locales', () => {
    expect(normalizeAppLanguage('fr-CA')).toBe('fr')
    expect(normalizeAppLanguage('pt-BR')).toBe('pt')
    expect(normalizeAppLanguage('zh-Hant')).toBe('zh-TW')
    expect(normalizeAppLanguage('zh-HK')).toBe('zh-TW')
    expect(normalizeAppLanguage('ar-EG')).toBe('ar')
    expect(normalizeAppLanguage('unknown')).toBe('en')
    expect(RTL_APP_LANGUAGES.has('ar')).toBe(true)
  })
})
