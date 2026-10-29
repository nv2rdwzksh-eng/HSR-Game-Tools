import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'unit',
          include: ['tests/**/*.test.ts'],
          exclude: [
            'tests/unit/warp-simulator/*-render.test.ts',
            'tests/unit/currency-wars/*-render.test.ts',
          ],
          environment: 'node',
        },
      },
      {
        plugins: [vue()],
        test: {
          name: 'currency-render',
          include: ['tests/unit/currency-wars/*-render.test.ts'],
          environment: './tests/fixtures/warp-simulator/node-render-environment.ts',
        },
      },
      {
        plugins: [vue()],
        test: {
          name: 'warp-render',
          include: ['tests/unit/warp-simulator/*-render.test.ts'],
          environment: './tests/fixtures/warp-simulator/node-render-environment.ts',
        },
      },
    ],
  },
})
