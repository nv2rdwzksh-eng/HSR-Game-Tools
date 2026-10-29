import type { Environment } from 'vitest/environments'

// Keep Node globals and lifecycle, but compile SFCs to normal render functions
// for Vue's custom renderer. No DOM, SSR renderer or browser process is used.
export default {
  name: 'node-render',
  viteEnvironment: 'client',
  setup() {
    return { teardown() {} }
  },
} satisfies Environment
