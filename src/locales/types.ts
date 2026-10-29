import type zhCN from './zh-CN.json'

export const locales = ['zh-CN', 'en'] as const
export type ToolLocale = (typeof locales)[number]
export type Localized<T> = Record<ToolLocale, T>
export type SiteMessages = typeof zhCN

/** Semantic presentation input, never a plan field or a translated business identity. */
export interface MessageDescriptor {
  key: string
  params?: Record<string, string | number | MessageDescriptor | DisplayNumber>
}
export interface DisplayNumber {
  value: number
  signed: boolean
}
export type MessageTranslator = (key: string, params?: Record<string, string>) => string
