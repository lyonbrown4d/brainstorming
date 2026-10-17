import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { AppLanguage } from '@shared/language'

const mocks = vi.hoisted(() => ({
  handlers: new Map<string, (event: unknown) => void>(),
  windows: [] as {
    webContents: { mainFrame: object; send: ReturnType<typeof vi.fn> }
  }[],
}))
vi.mock('electron', () => ({
  app: { getLocale: () => 'en-US' },
  BrowserWindow: class {
    private destroyed = false
    webContents = {
      mainFrame: {},
      send: vi.fn(),
      on: vi.fn(),
      setWindowOpenHandler: vi.fn(),
    }
    constructor() {
      mocks.windows.push(this)
    }
    once = vi.fn()
    on = vi.fn()
    show = vi.fn()
    isDestroyed = () => this.destroyed
    destroy = () => {
      this.destroyed = true
    }
    loadFile = () => Promise.resolve()
  },
  ipcMain: {
    on: (channel: string, listener: (event: unknown) => void) => {
      mocks.handlers.set(channel, listener)
    },
    removeListener: (channel: string) => {
      mocks.handlers.delete(channel)
    },
  },
  dialog: { showErrorBox: vi.fn() },
}))
import { StartupWindow } from '@main/startupWindow'

const startups: StartupWindow[] = []
beforeEach(() => {
  vi.useFakeTimers()
  mocks.handlers.clear()
  mocks.windows.length = 0
})
afterEach(() => {
  for (const startup of startups.splice(0)) startup.dispose()
  vi.useRealTimers()
})
const fixture = (readLanguage?: () => Promise<AppLanguage>) => {
  const startup = new StartupWindow(undefined, vi.fn(), vi.fn(), readLanguage)
  startups.push(startup)
  const splash = mocks.windows[0]
  if (!splash) throw new Error('Missing splash')
  const mounted = (sender: unknown, senderFrame: unknown) => {
    mocks.handlers.get('startup:splash-mounted')?.({ sender, senderFrame })
  }
  const mount = () => {
    mounted(splash.webContents, splash.webContents.mainFrame)
  }
  return { startup, splash, mounted, mount }
}

it('reads the persisted language only for the trusted splash and preserves an earlier failure phase', async () => {
  let resolve: (language: AppLanguage) => void = () => undefined
  const read = vi.fn(
    () =>
      new Promise<AppLanguage>((done) => {
        resolve = done
      }),
  )
  const { startup, splash, mounted, mount } = fixture(read)
  mounted({}, splash.webContents.mainFrame)
  mounted(splash.webContents, {})
  await Promise.resolve()
  expect(read).not.toHaveBeenCalled()
  expect(splash.webContents.send).not.toHaveBeenCalled()
  startup.fail()
  splash.webContents.send.mockClear()
  mount()
  expect(splash.webContents.send).toHaveBeenCalledWith('startup:phase', 'failed')
  await Promise.resolve()
  resolve('zh-CN')
  await vi.waitFor(() => {
    expect(splash.webContents.send).toHaveBeenCalledWith('startup:language', 'zh-CN')
  })
  expect(splash.webContents.send).not.toHaveBeenCalledWith('startup:phase', 'loading')
})

it('does not deliver a pending language after the main window has replaced the splash', async () => {
  let resolve: (language: AppLanguage) => void = () => undefined
  const { startup, splash, mount } = fixture(
    () =>
      new Promise<AppLanguage>((done) => {
        resolve = done
      }),
  )
  mount()
  await Promise.resolve()
  startup.dispose()
  resolve('zh-CN')
  await vi.advanceTimersByTimeAsync(1)
  expect(splash.webContents.send).not.toHaveBeenCalledWith('startup:language', expect.anything())
})

it('keeps startup usable in the system language if reading the saved preference fails', async () => {
  const { splash, mount } = fixture(() => Promise.reject(new Error('Preference unavailable')))
  mount()
  await vi.waitFor(() => {
    expect(splash.webContents.send).toHaveBeenCalledWith('startup:language', 'en')
  })
})
