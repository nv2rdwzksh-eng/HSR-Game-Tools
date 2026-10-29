import type { MessageDescriptor, MessageTranslator, ToolLocale } from '../../../locales/types'
import type { EffectOperation, SimulationState } from '../engine/types'
import { operationNameDescriptor } from './naming'

export function formatNumber(value: number, locale: ToolLocale, signed = false): string {
  return new Intl.NumberFormat(locale, {
    maximumFractionDigits: 6,
    signDisplay: signed ? 'exceptZero' : 'auto',
  }).format(Object.is(value, -0) ? 0 : value)
}

export function renderMessage(
  message: string | MessageDescriptor,
  locale: ToolLocale,
  t: MessageTranslator,
): string {
  if (typeof message === 'string') return message
  const params = Object.fromEntries(
    Object.entries(message.params ?? {}).map(([key, value]) => [
      key,
      typeof value === 'number'
        ? formatNumber(value, locale)
        : typeof value === 'string'
          ? value
          : 'key' in value
            ? renderMessage(value, locale, t)
            : formatNumber(value.value, locale, value.signed),
    ]),
  )
  return t(message.key, params)
}

export function operationName(
  operation: EffectOperation,
  locale: ToolLocale,
  t: MessageTranslator,
  name: (id: string) => string,
  state?: SimulationState,
  customName?: string,
): string {
  return (
    customName?.trim() || renderMessage(operationNameDescriptor(operation, name, state), locale, t)
  )
}

/** Preserve numeric precision; only this final display step rounds. */
export function formatAV(value: number, locale: ToolLocale, signed = false): string {
  const options: Intl.NumberFormatOptions = { minimumFractionDigits: 2, maximumFractionDigits: 2 }
  const parts = new Intl.NumberFormat(locale, options).formatToParts(Math.abs(value))
  const roundsToZero = parts
    .filter((part) => part.type === 'integer' || part.type === 'fraction')
    .every((part) => /^0+$/.test(part.value))
  return new Intl.NumberFormat(locale, {
    ...options,
    signDisplay: signed ? 'exceptZero' : 'auto',
  }).format(roundsToZero ? 0 : value)
}
