import { createApp } from 'vue'
import { createI18n } from 'vue-i18n'
import PrimeVue from 'primevue/config'
import Tooltip from 'primevue/tooltip'
import { ToolsPreset } from '../../../src/theme/preset'
import zhCN from '../../../src/locales/zh-CN.json'
import en from '../../../src/locales/en.json'
import reviewZhCN from './zh-CN.json'
import reviewEn from './en.json'
import Review from './Review.vue'
import '../../../src/assets/main.css'

if (!import.meta.env.DEV) throw new Error('The result review entry is development-only')

createApp(Review)
  .use(PrimeVue, {
    theme: {
      preset: ToolsPreset,
      options: {
        darkModeSelector: '.app-dark',
        cssLayer: { name: 'primevue', order: 'theme, base, primevue, components, utilities' },
      },
    },
  })
  .directive('tooltip', Tooltip)
  .use(
    createI18n({
      legacy: false,
      locale: 'zh-CN',
      fallbackLocale: false,
      messages: {
        'zh-CN': { ...zhCN, review: reviewZhCN },
        en: { ...en, review: reviewEn },
      },
    }),
  )
  .mount('#app')
