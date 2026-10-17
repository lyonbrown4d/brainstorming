import { expect, it, vi } from 'vitest'
import type { SplashAPI } from '@shared/startup'

const mocks = vi.hoisted(() => ({
  expose: vi.fn(),
  on: vi.fn(),
  removeListener: vi.fn(),
  send: vi.fn(),
}))
vi.mock('electron', () => ({
  contextBridge: { exposeInMainWorld: mocks.expose },
  ipcRenderer: { on: mocks.on, removeListener: mocks.removeListener, send: mocks.send },
}))
it('delivers only supported language values and revokes its listener on unsubscribe', async () => {
  await import('@preload/splash')
  const api = mocks.expose.mock.calls[0]?.[1] as SplashAPI
  const changed = vi.fn()
  const unsubscribe = api.onLanguage(changed)
  const [channel, listener] = mocks.on.mock.calls[0] as [
    string,
    (event: unknown, language: unknown) => void,
  ]
  expect(channel).toBe('startup:language')
  for (const language of [undefined, {}, 'fr', 'zh', 1]) listener({}, language)
  expect(changed).not.toHaveBeenCalled()
  listener({}, 'en')
  listener({}, 'zh-CN')
  expect(changed.mock.calls).toEqual([['en'], ['zh-CN']])
  unsubscribe()
  expect(mocks.removeListener).toHaveBeenCalledWith(channel, listener)
})
