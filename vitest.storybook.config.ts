import { defineConfig } from 'vitest/config'
import { playwright } from '@vitest/browser-playwright'
import { storybookTest } from '@storybook/addon-vitest/vitest-plugin'
import { resolve } from 'node:path'
import { alias, rendererOptimizeDeps } from './vite.config.ts'

export default defineConfig({
  resolve: { alias, dedupe: ['three'] },
  optimizeDeps: rendererOptimizeDeps,
  plugins: [storybookTest({ configDir: resolve('.storybook') })],
  test: {
    name: 'storybook',
    // Serialize WebGL stories to avoid competing GPU contexts on developer machines and CI.
    fileParallelism: false,
    browser: {
      enabled: true,
      provider: playwright(),
      headless: true,
      instances: [{ browser: 'chromium' }],
    },
  },
})
