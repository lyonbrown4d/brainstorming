import 'dotenv/config'
import { browser } from '@wdio/globals'
import { writeFile } from 'node:fs/promises'
import type { TauriCapabilities } from '@wdio/tauri-service'
import { resolve } from 'node:path'

const application = resolve(
  process.env.BRAINSTORMING_E2E_BINARY ??
    `src-tauri/target/debug/brainstorming${process.platform === 'win32' ? '.exe' : ''}`,
)

const capabilities: TauriCapabilities[] = [
  { browserName: 'tauri', 'tauri:options': { application } },
]

export const config: WebdriverIO.Config = {
  runner: 'local',
  specs: ['./tests/native/**/*.spec.ts'],
  maxInstances: 1,
  services: [
    [
      '@wdio/tauri-service',
      {
        appBinaryPath: application,
        driverProvider: 'embedded',
        windowLabel: 'main',
        startTimeout: 60_000,
        commandTimeout: 30_000,
        captureBackendLogs: true,
        captureFrontendLogs: true,
      },
    ],
  ],
  capabilities,
  afterTest: async (_test, _context, { passed }) => {
    if (passed) return
    const name = _test.title.replace(/[^a-zA-Z0-9]+/g, '-').slice(0, 100)
    const state = await browser.execute(() => ({
      visibility: document.visibilityState,
      focused: document.hasFocus(),
      reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
      panels: [...document.querySelectorAll('aside[aria-label], [aria-label="当前画布"]')].map(
        (element) => ({
          label: element.getAttribute('aria-label'),
          style: element.getAttribute('style'),
          parentStyle: element.parentElement?.getAttribute('style'),
        }),
      ),
    }))
    await writeFile(
      `/private/tmp/brainstorming-native-failure-${name}.json`,
      JSON.stringify(state, null, 2),
    )
    await browser.saveScreenshot(`/private/tmp/brainstorming-native-failure-${name}.png`)
    await writeFile(
      `/private/tmp/brainstorming-native-failure-${name}.html`,
      await browser.getPageSource(),
    )
  },
  framework: 'mocha',
  mochaOpts: { ui: 'bdd', timeout: 120_000 },
  reporters: ['spec'],
  logLevel: 'warn',
  waitforTimeout: 15_000,
  waitforInterval: 200,
  connectionRetryTimeout: 60_000,
  connectionRetryCount: 1,
}
