import { invoke, isTauri } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { getCurrentWindow } from '@tauri-apps/api/window'
import type { PhysicalPosition } from '@tauri-apps/api/dpi'

export interface NativeDrop {
  readonly paths: readonly string[]
  readonly x: number
  readonly y: number
}
export interface NativeTransport {
  windowAction?(action: 'minimize' | 'toggleMaximize' | 'close'): Promise<void>
  request<T>(method: string, args?: Record<string, unknown>): Promise<T>
  listen(event: string, callback: (payload: unknown) => void): Promise<() => void>
  onDrop(callback: (drop: NativeDrop | null) => void): Promise<() => void>
}
const logicalDrop = async (
  paths: readonly string[],
  position: PhysicalPosition,
): Promise<NativeDrop> => {
  const scale = await getCurrentWindow().scaleFactor()
  const logical = position.toLogical(scale)
  return { paths, x: logical.x, y: logical.y }
}
const throwNativeError = (failure: unknown): never => {
  if (failure instanceof Error) throw failure
  throw new Error(
    typeof failure === 'string' && failure.trim() ? failure : '本机操作失败，请重试。',
  )
}
export const createNativeTransport = (): NativeTransport => {
  if (!isTauri()) throw new Error('请从已安装的 Brainstorming 应用打开。')
  return {
    windowAction: (action) => getCurrentWindow()[action]().catch(throwNativeError),
    request: <T>(method: string, args: Record<string, unknown> = {}) =>
      invoke<T>('native_request', { method, args }).catch(throwNativeError),
    listen: (event, callback) =>
      listen(event, ({ payload }) => {
        callback(payload)
      }),
    onDrop: (callback) =>
      getCurrentWindow().onDragDropEvent(({ payload }) => {
        if (payload.type === 'drop') {
          void logicalDrop(payload.paths, payload.position)
            .then(callback)
            .catch((error: unknown) => {
              console.error('无法读取文件拖放位置。', error)
              callback(null)
            })
        } else callback(null)
      }),
  }
}
