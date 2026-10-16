import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createDocument, createWorkbook, serializeWorkbook } from '../../src/core'
import { isDirty, useEditor } from '../../src/renderer/src/state/editor'
import { openDocument } from '../../src/renderer/src/state/files'
import {
  readRecoveryContents,
  restoreBackup,
} from '../../src/renderer/src/state/fileSecurityActions'
import {
  answerPassword,
  resetBrowserPassword,
  usePasswordPrompt,
} from '../../src/renderer/src/state/password'

const contents = serializeWorkbook(
  createWorkbook(createDocument('Protected document', 'protected-book')),
)
function setup() {
  const bridge = {
    openDocument: vi.fn(() =>
      Promise.resolve({
        path: '/protected.trelyx',
        contents: '',
        lockedToken: 'token',
        encrypted: true,
      }),
    ),
    unlockDocument: vi.fn(() =>
      Promise.resolve({
        path: '/protected.trelyx',
        contents,
        sessionToken: 'token',
        encrypted: true,
      }),
    ),
    activateUnlockedDocument: vi.fn(() => Promise.resolve({ encrypted: true })),
    cancelUnlock: vi.fn(() => Promise.resolve()),
    setFilePassword: vi.fn(() => Promise.resolve({ encrypted: false })),
    restoreDocumentBackup: vi.fn(() => Promise.resolve({ path: null, contents })),
    readLockedRecovery: vi.fn(() =>
      Promise.resolve({ path: null, contents: '', lockedToken: 'recovery-token', encrypted: true }),
    ),
    saveDocument: vi.fn(),
  }
  const confirm = vi.fn(() => true)
  vi.stubGlobal('window', { trelyx: bridge, confirm })
  return { bridge, confirm }
}
beforeEach(() => {
  useEditor.getState().replace(createDocument('Current', 'current'))
  useEditor.setState({ busy: false, recovery: null })
  resetBrowserPassword()
})
afterEach(() => {
  answerPassword(null)
  vi.unstubAllGlobals()
})
async function prompt(): Promise<void> {
  await vi.waitFor(() => {
    expect(usePasswordPrompt.getState().request).not.toBeNull()
  })
}

describe('renderer protected-file acceptance', () => {
  it('identifies a locked recovery separately and preserves it when canceled', async () => {
    const { bridge } = setup()
    const original = useEditor.getState().workbook
    const reading = readRecoveryContents()
    const rejected = expect(reading).rejects.toThrow('加密恢复记录已保留')
    await prompt()
    expect(usePasswordPrompt.getState().request?.title).toBe('解锁自动恢复记录')
    answerPassword(null)
    await rejected
    expect(useEditor.getState().workbook).toBe(original)
    expect(bridge.cancelUnlock).toHaveBeenCalledWith('recovery-token')
  })
  it('cancels an unlock without changing the document or activating its key', async () => {
    const { bridge } = setup()
    const original = useEditor.getState().workbook
    const reading = openDocument()
    await prompt()
    answerPassword(null)
    await reading
    expect(useEditor.getState().workbook).toBe(original)
    expect(bridge.cancelUnlock).toHaveBeenCalledWith('token')
    expect(bridge.activateUnlockedDocument).not.toHaveBeenCalled()
    expect(useEditor.getState().busy).toBe(false)
  })
  it('retries a wrong password and activates only the successfully accepted document', async () => {
    const { bridge } = setup()
    bridge.unlockDocument.mockRejectedValueOnce(new Error('密码错误'))
    const reading = openDocument()
    await prompt()
    answerPassword('wrong-password')
    await vi.waitFor(() => {
      expect(usePasswordPrompt.getState().request?.error).toBe('密码错误')
    })
    answerPassword('correct-password')
    await reading
    expect(useEditor.getState().workbook.title).toBe('Protected document')
    expect(bridge.activateUnlockedDocument).toHaveBeenCalledWith('token')
    expect(isDirty()).toBe(false)
    expect(useEditor.getState().busy).toBe(false)
  })
  it('preserves edits made while reading when replacement confirmation is declined', async () => {
    const { bridge, confirm } = setup()
    const reading = openDocument()
    await prompt()
    useEditor.getState().replace(createDocument('Concurrent edit', 'concurrent'))
    confirm.mockReturnValue(false)
    answerPassword('correct-password')
    await reading
    expect(useEditor.getState().workbook.title).toBe('Concurrent edit')
    expect(bridge.activateUnlockedDocument).not.toHaveBeenCalled()
    expect(bridge.cancelUnlock).toHaveBeenCalledWith('token')
  })
  it('restores a history snapshot dirty in memory and waits for an explicit save to touch the current file', async () => {
    const { bridge } = setup()
    useEditor.setState({ path: '/current.trelyx' })
    await restoreBackup('generated-backup-id')
    expect(useEditor.getState().workbook.title).toBe('Protected document')
    expect(useEditor.getState().path).toBe('/current.trelyx')
    expect(isDirty()).toBe(true)
    expect(bridge.saveDocument).not.toHaveBeenCalled()
  })
})
