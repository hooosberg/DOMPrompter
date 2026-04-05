export const APP_LANGUAGE_OPTIONS = [
  { code: 'en', label: 'English' },
  { code: 'zh', label: '简体中文' },
  { code: 'zh-TW', label: '繁體中文' },
  { code: 'ja', label: '日本語' },
  { code: 'ko', label: '한국어' },
  { code: 'fr', label: 'Français' },
  { code: 'de', label: 'Deutsch' },
  { code: 'es', label: 'Español' },
  { code: 'pt', label: 'Português' },
  { code: 'it', label: 'Italiano' },
  { code: 'ru', label: 'Русский' },
  { code: 'ar', label: 'العربية' },
] as const

export type AppLanguage = (typeof APP_LANGUAGE_OPTIONS)[number]['code']

export const SUPPORTED_APP_LANGUAGES = APP_LANGUAGE_OPTIONS.map((option) => option.code) as AppLanguage[]

export const RTL_APP_LANGUAGES = new Set<AppLanguage>(['ar'])

const APP_LANGUAGE_SET = new Set<string>(SUPPORTED_APP_LANGUAGES)

export function isAppLanguage(language: string): language is AppLanguage {
  return APP_LANGUAGE_SET.has(language)
}

export function normalizeAppLanguage(language: string | null | undefined): AppLanguage {
  if (!language) return 'en'
  if (isAppLanguage(language)) return language

  const normalized = language.trim()
  const lower = normalized.toLowerCase()

  if (lower === 'zh-hant') return 'zh-TW'
  if (lower === 'zh-hans') return 'zh'
  if (lower.startsWith('zh-tw') || lower.startsWith('zh-hk') || lower.startsWith('zh-mo')) return 'zh-TW'
  if (lower.startsWith('zh')) return 'zh'

  const base = normalized.split('-')[0]?.toLowerCase()
  if (base && isAppLanguage(base)) return base

  return 'en'
}
