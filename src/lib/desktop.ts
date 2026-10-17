import { z } from 'zod'
import type { DesktopAPI } from '@shared/contracts'
import { createNativeAPI } from '@renderer/lib/nativeAPI'
import { createNativeTransport, type NativeTransport } from '@renderer/lib/nativeTransport'

let api: DesktopAPI | undefined
let initialization: Promise<DesktopAPI> | undefined
const initialSchema = z.object({
  platform: z.enum(['macos', 'windows', 'linux', 'ios', 'android']),
  resourceOrigin: z.url(),
  language: z.enum(['zh-CN', 'en']),
  windowState: z.object({ focused: z.boolean(), fullScreen: z.boolean() }),
})

/** Explicit injection for component previews and contract tests. */
export const installPlatformAPI = (next: DesktopAPI | undefined): (() => void) => {
  const previous = api
  api = next
  return () => {
    api = previous
  }
}
export const initializePlatformAPI = (transport?: NativeTransport): Promise<DesktopAPI> => {
  if (api) return Promise.resolve(api)
  if (initialization) return initialization
  initialization = (async () => {
    const native = transport ?? createNativeTransport()
    const initial = initialSchema.parse(await native.request('initialize'))
    const created = await createNativeAPI(native, initial)
    api = created.api
    return api
  })().catch((error: unknown) => {
    initialization = undefined
    throw error
  })
  return initialization
}
export const requireDesktopAPI = (): DesktopAPI => {
  if (!api) throw new Error('Brainstorming 原生平台尚未初始化。')
  return api
}
export const notifyNativeStartup = async (phase: 'ready' | 'failed'): Promise<void> => {
  try {
    await createNativeTransport().request(phase === 'ready' ? 'startupReady' : 'startupFailed')
  } catch (error) {
    console.error('无法通知原生启动状态。', error)
    if (phase === 'ready') throw error
  }
}

export const getPlatformAPI = (): DesktopAPI | undefined => api
