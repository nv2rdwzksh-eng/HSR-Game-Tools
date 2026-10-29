import { createI18n } from 'vue-i18n'
import zhCN from './zh-CN.json'
import en from './en.json'
import type { SiteMessages, ToolLocale } from './types'

export const i18n = createI18n({
  legacy: false,
  locale: 'zh-CN',
  fallbackLocale: false,
  messages: { 'zh-CN': zhCN, en } satisfies Record<ToolLocale, SiteMessages>,
})
