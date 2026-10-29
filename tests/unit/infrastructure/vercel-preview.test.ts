import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const workflow = readFileSync(
  new URL('../../../.github/workflows/vercel-preview.yml', import.meta.url),
  'utf8',
)
const parser = workflow.match(/node --input-type=module -e '([\s\S]*?)'/)?.[1] ?? ''
if (!parser) throw new Error('Preview Workflow must contain its inline deployment result parser')

function parseOutput(output: string) {
  return spawnSync(process.execPath, ['--input-type=module', '-e', parser], {
    encoding: 'utf8',
    env: { DEPLOYMENT_OUTPUT: output },
  })
}

function readyDeployment(url: unknown) {
  return JSON.stringify({ status: 'ok', deployment: { readyState: 'READY', url } })
}

const previewUrl = 'https://hsr-game-tools-test.vercel.app'

describe('Preview Workflow deployment result parser', () => {
  it.each([
    ['plain URL', previewUrl],
    ['JSON', readyDeployment(previewUrl)],
    ['plain URL with surrounding whitespace', ` \n${previewUrl}\n `],
    [
      'pretty JSON with surrounding whitespace',
      `\n${JSON.stringify(JSON.parse(readyDeployment(previewUrl)), null, 2)}\n`,
    ],
  ])('returns only the validated URL for %s', (_, output) => {
    const result = parseOutput(output)
    expect(result.error).toBeUndefined()
    expect(result.status).toBe(0)
    expect(result.stdout).toBe(previewUrl)
    expect(result.stderr).toBe('')
  })

  it.each([
    ['failed status', { status: 'error', deployment: { readyState: 'READY', url: previewUrl } }],
    ['missing status', { deployment: { readyState: 'READY', url: previewUrl } }],
    [
      'building deployment',
      { status: 'ok', deployment: { readyState: 'BUILDING', url: previewUrl } },
    ],
    ['failed deployment', { status: 'ok', deployment: { readyState: 'ERROR', url: previewUrl } }],
    ['missing state', { status: 'ok', deployment: { url: previewUrl } }],
    ['missing deployment', { status: 'ok' }],
  ])('rejects %s instead of extracting its URL', (_, payload) => {
    const result = parseOutput(JSON.stringify(payload))
    expect(result.error).toBeUndefined()
    expect(result.status).not.toBe(0)
    expect(result.stdout).toBe('')
    expect(result.stderr).toContain('successful READY deployment')
  })

  it.each([
    ['empty output', ' \n '],
    ['malformed JSON', `{"status":"ok","deployment":{"url":"${previewUrl}"}`],
    ['null JSON', 'null'],
    ['array JSON', '[]'],
    ['CLI log mixed with URL', `Deployment ready\n${previewUrl}`],
    ['missing URL', readyDeployment(undefined)],
    ['empty URL', readyDeployment('')],
    ['non-string URL', readyDeployment(123)],
  ])('rejects %s without emitting a URL', (_, output) => {
    const result = parseOutput(output)
    expect(result.error).toBeUndefined()
    expect(result.status).not.toBe(0)
    expect(result.stdout).toBe('')
    expect(result.stderr).not.toBe('')
  })

  it.each([
    'http://hsr-game-tools-test.vercel.app',
    'https://example.com',
    'https://hsr-game-tools-test.vercel.app.example.com',
    `${previewUrl}/path`,
    `${previewUrl}?query=value`,
    `${previewUrl}#fragment`,
    'not-a-url',
  ])('preserves URL validation for both output formats: %s', (url) => {
    for (const output of [url, readyDeployment(url)]) {
      const result = parseOutput(output)
      expect(result.error).toBeUndefined()
      expect(result.status).not.toBe(0)
      expect(result.stdout).toBe('')
      expect(result.stderr).not.toBe('')
    }
  })
})
