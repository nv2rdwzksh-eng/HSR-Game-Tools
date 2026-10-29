import { globalIgnores } from 'eslint/config'
import { defineConfigWithVueTs, vueTsConfigs } from '@vue/eslint-config-typescript'
import pluginVue from 'eslint-plugin-vue'
import skipFormatting from '@vue/eslint-config-prettier/skip-formatting'

export default defineConfigWithVueTs(
  { files: ['**/*.{ts,vue}'] },
  globalIgnores([
    '.cache/**',
    '.game-data-*/**',
    '.warp-data-*/**',
    'dist/**',
    'dist-subpath/**',
    'node_modules/**',
    'vendor/astral-ui/**',
  ]),
  ...pluginVue.configs['flat/essential'],
  vueTsConfigs.recommended,
  { files: ['tests/**/*.ts'], rules: { '@typescript-eslint/no-explicit-any': 'off' } },
  skipFormatting,
)
