import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'

import enTranslations from './locales/en.json'
import amTranslations from './locales/am.json'

const savedLanguage = localStorage.getItem('language') || 'en'

i18n
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: enTranslations },
      am: { translation: amTranslations }
    },
    lng: savedLanguage,
    fallbackLng: 'en',
    interpolation: {
      escapeValue: false
    }
  })

i18n.on('languageChanged', (lng) => {
  localStorage.setItem('language', lng)
  document.documentElement.dir = lng === 'am' ? 'ltr' : 'ltr' // Amharic is LTR
  document.documentElement.lang = lng
})

export default i18n
