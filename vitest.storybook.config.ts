import type { RendererConfig } from '@project/config/renderer'
import { readFileSync } from 'node:fs'
import { defineConfig } from 'vitest/config'
import { playwright } from '@vitest/browser-playwright'
import { storybookTest } from '@storybook/addon-vitest/vitest-plugin'
import { resolve } from 'node:path'
const rendererOptions = JSON.parse(
  readFileSync(new URL('./config/renderer.json', import.meta.url), 'utf8'),
) as RendererConfig
const rendererOptimizeDeps = rendererOptions.optimizeDeps

export default defineConfig({
  cacheDir: resolve('node_modules/.vite/brainstorming-storybook-test'),
  resolve: { tsconfigPaths: true, dedupe: ['three'] },
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
