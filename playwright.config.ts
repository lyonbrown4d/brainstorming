import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests',
  testMatch: [
    'e2e/**/*.spec.ts',
    'desktop/**/*.spec.ts',
    'performance/**/*.spec.ts',
    'packaged/**/*.spec.ts',
  ],
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: { trace: 'retain-on-failure', colorScheme: null },
})
