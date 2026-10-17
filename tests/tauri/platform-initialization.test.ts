import { beforeEach, describe, expect, it, vi } from 'vitest'
import type * as DesktopBridge from '@renderer/lib/desktop'
import type { NativeTransport } from '@renderer/lib/nativeTransport'

const metadata = {
  platform: 'android',
  resourceOrigin: 'http://127.0.0.1:43123',
  language: 'zh-CN',
  windowState: { focused: true, fullScreen: false },
}
let bridge: typeof DesktopBridge
beforeEach(async () => {
  vi.resetModules()
  bridge = await import('@renderer/lib/desktop')
}, 15_000)
describe('explicit platform initialization', () => {
  it('shares initialization and exposes the bridge only after native setup succeeds', async () => {
    expect(() => bridge.requireDesktopAPI()).toThrow('尚未初始化')
    const calls: string[] = []
    const transport: NativeTransport = {
      request: <T>(method: string): Promise<T> => {
        calls.push(method)
        return Promise.resolve(metadata as T)
      },
      listen: () => Promise.resolve(vi.fn<() => void>()),
      onDrop: () => Promise.resolve(vi.fn<() => void>()),
    }
    const [first, second] = await Promise.all([
      bridge.initializePlatformAPI(transport),
      bridge.initializePlatformAPI(transport),
    ])
    expect(first).toBe(second)
    expect(bridge.requireDesktopAPI().platform).toBe('android')
    expect(calls).toEqual(['initialize'])
  })
  it('rejects malformed initialization and permits a later native retry', async () => {
    let response: unknown = { ...metadata, platform: 'browser' }
    const transport: NativeTransport = {
      request: <T>(): Promise<T> => Promise.resolve(response as T),
      listen: () => Promise.resolve(vi.fn<() => void>()),
      onDrop: () => Promise.resolve(vi.fn<() => void>()),
    }
    await expect(bridge.initializePlatformAPI(transport)).rejects.toThrow()
    expect(() => bridge.requireDesktopAPI()).toThrow()
    response = metadata
    expect((await bridge.initializePlatformAPI(transport)).platform).toBe('android')
  })
})
