import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import ts from 'typescript'
import { baseCompile, type ResourceNode } from '@intlify/message-compiler'
import { locales, type ToolLocale } from '../src/locales/types'

interface MessageEntry {
  kind: 'object' | 'string'
  parameters: string[]
}

function parameters(ast: ResourceNode): string[] {
  const names = new Set<string>()
  const messages = ast.body.type === 1 ? ast.body.cases : [ast.body]
  for (const message of messages)
    for (const item of message.items) {
      const parameter = item.type === 6 ? item.key : item
      if (parameter.type === 4) names.add(`named:${parameter.key}`)
      if (parameter.type === 5) names.add(`list:${parameter.index}`)
    }
  return [...names].sort()
}

/** Validate source text before JSON.parse can erase duplicate properties. */
export function validateMessages(sources: Record<ToolLocale, string>): string[] {
  const errors: string[] = []
  const entries = new Map<ToolLocale, Map<string, MessageEntry>>()
  for (const locale of locales) {
    const source = sources[locale]
    const file = `${locale}.json`
    let parsed: unknown
    try {
      parsed = JSON.parse(source)
    } catch (error) {
      errors.push(`${file}: invalid JSON: ${String(error)}`)
      continue
    }
    const ast = ts.parseJsonText(file, source)
    const duplicates = (node: ts.Node, path: string) => {
      if (ts.isObjectLiteralExpression(node)) {
        const keys = new Set<string>()
        for (const property of node.properties) {
          if (!ts.isPropertyAssignment(property) || !ts.isStringLiteral(property.name)) continue
          const key = property.name.text
          if (keys.has(key)) errors.push(`${file}: duplicate key ${path}${key}`)
          keys.add(key)
          duplicates(property.initializer, `${path}${key}.`)
        }
      } else ts.forEachChild(node, (child) => duplicates(child, path))
    }
    duplicates(ast, '')
    const map = new Map<string, MessageEntry>()
    const visit = (value: unknown, path: string) => {
      if (typeof value === 'string') {
        if (!value.trim()) errors.push(`${file}: empty translation ${path}`)
        const result = baseCompile(value, {
          optimize: false,
          onError: (error) => errors.push(`${file}: invalid message ${path}: ${error.message}`),
        })
        map.set(path, { kind: 'string', parameters: parameters(result.ast) })
      } else if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
        map.set(path, { kind: 'object', parameters: [] })
        if (!Object.keys(value).length) errors.push(`${file}: empty namespace ${path || '<root>'}`)
        for (const [key, child] of Object.entries(value)) {
          if (!key || key.includes('.')) errors.push(`${file}: invalid key ${path}.${key}`)
          visit(child, path ? `${path}.${key}` : key)
        }
      } else errors.push(`${file}: expected namespace or message string at ${path || '<root>'}`)
    }
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed))
      errors.push(`${file}: root must be a message object`)
    else visit(parsed, '')
    entries.set(locale, map)
  }
  const zh = entries.get('zh-CN'),
    en = entries.get('en')
  if (zh && en)
    for (const key of new Set([...zh.keys(), ...en.keys()])) {
      const a = zh.get(key),
        b = en.get(key)
      if (!a || !b) errors.push(`${!a ? 'zh-CN' : 'en'}.json: missing key ${key}`)
      else if (a.kind !== b.kind) errors.push(`structure mismatch at ${key}`)
      else if (a.parameters.join(',') !== b.parameters.join(','))
        errors.push(
          `interpolation mismatch at ${key}: ${a.parameters.join(',')} / ${b.parameters.join(',')}`,
        )
    }
  return errors
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const sources = Object.fromEntries(
    locales.map((locale) => [
      locale,
      readFileSync(new URL(`../src/locales/${locale}.json`, import.meta.url), 'utf8'),
    ]),
  ) as Record<ToolLocale, string>
  const errors = validateMessages(sources)
  if (errors.length) {
    console.error(errors.join('\n'))
    process.exitCode = 1
  } else console.log('Site Messages: zh-CN / en structure, keys, parameters and syntax validated.')
}
