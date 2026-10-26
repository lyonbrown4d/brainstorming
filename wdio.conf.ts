import { prepareCefWindow } from '@project/scripts/cef-e2e-window'
import { SevereServiceError } from 'webdriverio'
import { nativeArtifact } from '@tests/native/artifacts'
import 'dotenv/config'
import { browser } from '@wdio/globals'
import { writeFile } from 'node:fs/promises'
import {
  startCefSession,
  readCefVersion,
  cefDriverCapability,
} from '@project/scripts/cef-e2e-session'
import { invokeNative, switchNativeWindow } from '@tests/native/cef-api'
import { recordCefGraphics } from '@tests/native/cef-graphics'

let session: Awaited<ReturnType<typeof startCefSession>> | undefined

export const config: WebdriverIO.Config = {
  runner: 'local',
  specs: ['./tests/native/**/*.spec.ts'],
  maxInstances: 1,
  capabilities: [{ browserName: 'chrome', 'wdio:enforceWebDriverClassic': true }],
  onPrepare: async (_config, capabilities) => {
    if (!Array.isArray(capabilities) || capabilities.length !== 1)
      throw new Error('CEF native tests require exactly one sequential capability')
    try {
      const capability = capabilities[0]
      if (!capability) throw new Error('Missing CEF capability')
      Object.assign(capability, cefDriverCapability(await readCefVersion()))
    } catch (error) {
      throw new SevereServiceError(error instanceof Error ? error.message : String(error))
    }
  },
  beforeSession: async (_config, capability) => {
    try {
      session = await startCefSession()
      Object.assign(capability, session.capability)
    } catch (error) {
      throw new SevereServiceError(error instanceof Error ? error.message : String(error))
    }
  },
  afterSession: async () => {
    await session?.stop()
  },
  before: async () => {
    await switchNativeWindow('main')
    if ((await invokeNative<string>('plugin:app|identifier', {})) !== 'app.brainstorming.e2e')
      throw new SevereServiceError('The driver did not connect to the isolated native E2E app')
    if (!session) throw new SevereServiceError('Missing native application process')
    await prepareCefWindow(session.processId)
    await recordCefGraphics()
  },
  afterTest: async (_test, _context, { passed }) => {
    if (passed) return
    try {
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
        await nativeArtifact(`brainstorming-native-failure-${name}.json`),
        JSON.stringify(state, null, 2),
      )
      await browser.saveScreenshot(await nativeArtifact(`brainstorming-native-failure-${name}.png`))
      await writeFile(
        await nativeArtifact(`brainstorming-native-failure-${name}.html`),
        await browser.getPageSource(),
      )
    } catch (failure) {
      console.warn('Native failure diagnostics could not be captured:', failure)
    }
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
