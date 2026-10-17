import { seedChinese } from '@tests/electron/preferences'
import { _electron, expect, test as base, type ElectronApplication } from '@playwright/test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { mainWindow } from '@tests/desktop/windows'
import { registerSession, resizeWindow } from '@tests/electron/session'

export const test = base.extend<{ electronApp: ElectronApplication; profileDirectory: string }>({
  // eslint-disable-next-line no-empty-pattern -- Playwright requires destructured fixture arguments.
  profileDirectory: async ({}, use) => {
    const directory = await mkdtemp(join(tmpdir(), 'brainstorming-ui-'))
    try {
      await seedChinese(directory)
      await use(directory)
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  },
  electronApp: async ({ profileDirectory }, use) => {
    const environment = Object.fromEntries(
      Object.entries(process.env).filter(
        (entry): entry is [string, string] => entry[1] !== undefined,
      ),
    )
    delete environment.ELECTRON_RENDERER_URL
    const app = await _electron.launch({
      args: ['.', `--user-data-dir=${profileDirectory}`],
      colorScheme: null,
      env: environment,
    })
    try {
      await use(app)
    } finally {
      const closed = app.waitForEvent('close').catch(() => undefined)
      app.process().kill('SIGKILL')
      await closed
    }
  },
  context: async ({ electronApp }, use) => {
    await use(electronApp.context())
  },
  page: async ({ electronApp, profileDirectory, reducedMotion, colorScheme }, use) => {
    const page = await mainWindow(electronApp)
    registerSession(page, { app: electronApp, directory: profileDirectory })
    await resizeWindow(page, { width: 1440, height: 960 })
    await page.emulateMedia({ reducedMotion, colorScheme })
    await use(page)
  },
})
export { expect }
export type { Page, Locator } from '@playwright/test'
