import 'dotenv/config'
import { defineConfig } from '@playwright/test'

/** Real input hit-testing against the isolated Storybook preview, never a web product. */
export default defineConfig({
  testDir: './tests/canvas',
  workers: 1,
  timeout: 30_000,
  use: { baseURL: 'http://127.0.0.1:4331', viewport: { width: 1440, height: 900 } },
  outputDir: 'test-results/canvas',
  webServer: {
    command:
      'pnpm exec vite preview --outDir storybook-static --host 127.0.0.1 --port 4331 --strictPort',
    url: 'http://127.0.0.1:4331/iframe.html',
    reuseExistingServer: false,
  },
})
