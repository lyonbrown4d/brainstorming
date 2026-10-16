import { createStore, del, get, set } from 'idb-keyval'
import { deserializeWorkbook } from '@core'

export const RECOVERY_KEY = 'trelyx.recovery.native-v1'
const store = createStore('trelyx', 'recovery')

export async function readBrowserRecovery(): Promise<string | null> {
  const contents: unknown = await get(RECOVERY_KEY, store)
  if (contents === undefined) return null
  if (typeof contents !== 'string') throw new Error('浏览器恢复记录格式无效')
  deserializeWorkbook(contents)
  return contents
}

export async function writeBrowserRecovery(contents: string): Promise<void> {
  await set(RECOVERY_KEY, contents, store)
}

export async function clearBrowserRecovery(): Promise<void> {
  await del(RECOVERY_KEY, store)
}
