import i18n from 'i18next'
import LanguageDetector from 'i18next-browser-languagedetector'
import { initReactI18next } from 'react-i18next'

import ar from './locales/ar.json'
import de from './locales/de.json'
import en from './locales/en.json'
import es from './locales/es.json'
import fr from './locales/fr.json'
import it from './locales/it.json'
import ja from './locales/ja.json'
import ko from './locales/ko.json'
import pt from './locales/pt.json'
import ru from './locales/ru.json'
import zh from './locales/zh.json'
import zhTW from './locales/zh-TW.json'

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      zh: { translation: zh },
      'zh-TW': { translation: zhTW },
      ja: { translation: ja },
      ko: { translation: ko },
      fr: { translation: fr },
      de: { translation: de },
      es: { translation: es },
      pt: { translation: pt },
      it: { translation: it },
      ru: { translation: ru },
      ar: { translation: ar },
    },
    fallbackLng: 'en',
    detection: {
      order: ['localStorage', 'navigator'],
      lookupLocalStorage: 'domprompter-language',
    },
    interpolation: {
      escapeValue: false,
    },
  })

export default i18n
