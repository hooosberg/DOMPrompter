import i18n from 'i18next'
import LanguageDetector from 'i18next-browser-languagedetector'
import { initReactI18next } from 'react-i18next'
import { normalizeAppLanguage, SUPPORTED_APP_LANGUAGES } from './shared/languages'

const localeModules = import.meta.glob<{ default: Record<string, unknown> }>('./locales/*.json', { eager: true })

const resources = Object.fromEntries(
  Object.entries(localeModules)
    .map(([path, module]) => {
      const locale = path.match(/\/([^/]+)\.json$/)?.[1]
      if (!locale) return null
      return [locale, { translation: module.default }] as const
    })
    .filter((entry): entry is readonly [string, { translation: Record<string, unknown> }] => entry !== null),
)

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: 'en',
    supportedLngs: SUPPORTED_APP_LANGUAGES,
    detection: {
      order: ['localStorage', 'navigator'],
      lookupLocalStorage: 'domprompter-language',
      convertDetectedLanguage: (language) => normalizeAppLanguage(language),
    },
    interpolation: {
      escapeValue: false,
    },
  })

export default i18n
