import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import LanguageDetector from 'i18next-browser-languagedetector'

import en from './locales/en.json'
import am from './locales/am.json'

const resources = {
  en: { translation: en },
  am: { translation: am },
}

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: 'en',
    interpolation: {
      escapeValue: false,
    },
    detection: {
      order: ['localStorage', 'navigator'],
      caches: ['localStorage'],
    },
  })

// Keep <html lang> in step with the active language: it drives font selection
// for Ethiopic script and tells screen readers which language to speak.
function applyDocumentLanguage(lng: string) {
  if (typeof document !== 'undefined') {
    document.documentElement.lang = lng
  }
}

applyDocumentLanguage(i18n.language || 'en')
i18n.on('languageChanged', applyDocumentLanguage)

export default i18n
