import { defineConfig } from 'vitest/config'
import { playwright } from '@vitest/browser-playwright'
import { storybookTest } from '@storybook/addon-vitest/vitest-plugin'
import { resolve } from 'node:path'
import { alias } from './vite.config.ts'

export default defineConfig({
  resolve: { alias },
  plugins: [storybookTest({ configDir: resolve('.storybook') })],
  test: {
    name: 'storybook',
    browser: {
      enabled: true,
      provider: playwright(),
      headless: true,
      instances: [{ browser: 'chromium' }],
    },
  },
})
