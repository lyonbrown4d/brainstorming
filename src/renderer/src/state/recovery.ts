import { createStore, del, get, set } from 'idb-keyval'
import { deserializeWorkbook, serializeWorkbook } from '@core'
import {
  browserPasswordFor,
  requestPassword,
  setBrowserPassword,
  useFileSecurityState,
} from '@renderer/state/password'

export const RECOVERY_KEY = 'trelyx.recovery.native-v1'
const store = createStore('trelyx', 'recovery')
interface EncryptedRecovery {
  readonly encrypted: true
  readonly bytes: Uint8Array
}
const encryptedRecovery = (value: unknown): value is EncryptedRecovery => {
  return (
    typeof value === 'object' &&
    value !== null &&
    'encrypted' in value &&
    value.encrypted === true &&
    'bytes' in value &&
    value.bytes instanceof Uint8Array
  )
}
let pendingPassword: { documentId: string; password: string } | null = null
let recoveryQueue: Promise<void> = Promise.resolve()
export const adoptBrowserRecoveryPassword = (documentId: string): void => {
  if (pendingPassword?.documentId === documentId)
    setBrowserPassword(documentId, pendingPassword.password, true)
  pendingPassword = null
}
export const readBrowserRecovery = async (): Promise<string | null> => {
  const contents: unknown = await get(RECOVERY_KEY, store)
  if (contents === undefined) return null
  if (encryptedRecovery(contents)) {
    const { decryptTrelyx } = await import('@formats/encrypted')
    let error: string | undefined
    for (let attempt = 0; attempt < 32; attempt += 1) {
      const password = await requestPassword(
        '解锁自动恢复记录',
        '取消会保留加密记录，不会覆盖当前导图。',
        error,
      )
      if (password === null) {
        useFileSecurityState.setState({ lockedRecovery: true })
        throw new Error('加密恢复记录已保留，可稍后重试解锁')
      }
      try {
        const workbook = await decryptTrelyx(contents.bytes, password)
        pendingPassword = { documentId: workbook.id, password }
        useFileSecurityState.setState({ lockedRecovery: false })
        return serializeWorkbook(workbook)
      } catch (failure) {
        error = failure instanceof Error ? failure.message : '解锁失败'
      }
    }
    useFileSecurityState.setState({ lockedRecovery: true })
    throw new Error('解锁尝试过多，恢复记录已保留')
  }
  if (typeof contents !== 'string') throw new Error('浏览器恢复记录格式无效')
  deserializeWorkbook(contents)
  return contents
}
const writeNow = async (contents: string, password: string | null): Promise<void> => {
  const workbook = deserializeWorkbook(contents)
  if (password !== null) {
    const { encryptTrelyx } = await import('@formats/encrypted')
    await set(
      RECOVERY_KEY,
      {
        encrypted: true,
        bytes: await encryptTrelyx(workbook, password, 'existing'),
      } satisfies EncryptedRecovery,
      store,
    )
  } else await set(RECOVERY_KEY, contents, store)
}
export const writeBrowserRecovery = (contents: string): Promise<void> => {
  const password = browserPasswordFor(deserializeWorkbook(contents).id)
  const write = recoveryQueue.then(() => writeNow(contents, password))
  recoveryQueue = write.catch(() => undefined)
  return write
}
const protectNow = async (
  documentId: string,
  previous: string | null,
  password: string | null,
): Promise<void> => {
  const contents: unknown = await get(RECOVERY_KEY, store)
  if (contents === undefined) return
  const { decryptTrelyx, encryptTrelyx } = await import('@formats/encrypted')
  if (encryptedRecovery(contents) && previous === null) return
  const workbook =
    encryptedRecovery(contents) && previous !== null
      ? await decryptTrelyx(contents.bytes, previous)
      : typeof contents === 'string'
        ? deserializeWorkbook(contents)
        : null
  if (!workbook) throw new Error('浏览器恢复记录格式无效')
  if (workbook.id !== documentId) return
  await set(
    RECOVERY_KEY,
    password === null
      ? serializeWorkbook(workbook)
      : ({
          encrypted: true,
          bytes: await encryptTrelyx(workbook, password, 'existing'),
        } satisfies EncryptedRecovery),
    store,
  )
}
export const protectBrowserRecovery = (
  documentId: string,
  previous: string | null,
  password: string | null,
): Promise<void> => {
  const change = recoveryQueue.then(() => protectNow(documentId, previous, password))
  recoveryQueue = change.catch(() => undefined)
  return change
}
export const clearBrowserRecovery = async (): Promise<void> => {
  await recoveryQueue
  await del(RECOVERY_KEY, store)
}
