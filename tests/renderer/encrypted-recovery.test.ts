import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
const storage = vi.hoisted(() => new Map<string, unknown>())
vi.mock('idb-keyval', () => ({
  createStore: () => ({}),
  get: (key: string) => Promise.resolve(storage.get(key)),
  set: (key: string, value: unknown) => {
    storage.set(key, value)
    return Promise.resolve()
  },
  del: (key: string) => {
    storage.delete(key)
    return Promise.resolve()
  },
}))
import { createDocument, createWorkbook, serializeWorkbook } from '@core'
import { isEncryptedTrelyx } from '@formats/encrypted'
import {
  readBrowserRecovery,
  writeBrowserRecovery,
  RECOVERY_KEY,
  protectBrowserRecovery,
  adoptBrowserRecoveryPassword,
} from '@renderer/state/recovery'
import {
  answerPassword,
  browserPasswordFor,
  resetBrowserPassword,
  setBrowserPassword,
  useFileSecurityState,
  usePasswordPrompt,
} from '@renderer/state/password'

const workbook = createWorkbook(createDocument('Browser encrypted draft', 'browser-protected'))
const contents = serializeWorkbook(workbook)
const password = 'browser-password-123'
beforeEach(() => {
  storage.clear()
  resetBrowserPassword()
  useFileSecurityState.setState({ lockedRecovery: false })
})
afterEach(() => {
  answerPassword(null)
  resetBrowserPassword()
})
const encryptedBytes = (): Uint8Array => {
  const value = storage.get(RECOVERY_KEY)
  if (
    !value ||
    typeof value !== 'object' ||
    !('bytes' in value) ||
    !(value.bytes instanceof Uint8Array)
  )
    throw new Error('Recovery was not encrypted')
  return value.bytes
}

describe('browser encrypted recovery storage', () => {
  it('stores ciphertext, retains no persistent password and prompts again after a fresh session', async () => {
    setBrowserPassword(workbook.id, password)
    await writeBrowserRecovery(contents)
    expect(await isEncryptedTrelyx(encryptedBytes())).toBe(true)
    expect(JSON.stringify(storage.get(RECOVERY_KEY))).not.toContain(password)
    resetBrowserPassword()
    const reading = readBrowserRecovery()
    await vi.waitFor(() => {
      expect(usePasswordPrompt.getState().request).not.toBeNull()
    })
    answerPassword('wrong-password')
    await vi.waitFor(() => {
      expect(usePasswordPrompt.getState().request?.error).toContain('密码错误')
    })
    answerPassword(password)
    expect(await reading).toBe(contents)
    expect(browserPasswordFor(workbook.id)).toBeNull()
    adoptBrowserRecoveryPassword(workbook.id)
    expect(browserPasswordFor(workbook.id)).toBe(password)
  })
  it('protects existing plaintext recovery and preserves encrypted bytes when unlocking is canceled', async () => {
    await writeBrowserRecovery(contents)
    await protectBrowserRecovery(workbook.id, null, password)
    const before = encryptedBytes().slice()
    const reading = readBrowserRecovery()
    await vi.waitFor(() => {
      expect(usePasswordPrompt.getState().request).not.toBeNull()
    })
    answerPassword(null)
    await expect(reading).rejects.toThrow('已保留')
    expect(encryptedBytes()).toEqual(before)
    expect(useFileSecurityState.getState().lockedRecovery).toBe(true)
  })
})
