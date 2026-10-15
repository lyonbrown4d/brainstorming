import { defineConfig } from '@playwright/test'
export default defineConfig({
  testDir: './tests/desktop',
  outputDir: 'test-results-desktop',
  testMatch: '**/*.spec.ts',
  workers: 1,
  timeout: 60_000,
  reporter: [['list']],
  use: { trace: 'retain-on-failure' },
})
