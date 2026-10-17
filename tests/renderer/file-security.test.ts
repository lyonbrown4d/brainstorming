import { useDocumentTabs, switchDocumentTab } from '@renderer/state/documentTabs'
import { desktop } from '@tests/fixtures/desktop'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createDocument, createWorkbook, serializeWorkbook } from '@core'
import { isDirty, useEditor } from '@renderer/state/editor'
import { openDocument } from '@renderer/state/files'
import { readRecoveryContents, restoreBackup } from '@renderer/state/fileSecurityActions'
import {
  answerPassword,
  resetFileSecurityState,
  usePasswordPrompt,
  useFileSecurityState,
} from '@renderer/state/password'

const contents = serializeWorkbook(
  createWorkbook(createDocument('Protected document', 'protected-book')),
)
const setup = () => {
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
  vi.stubGlobal('window', { trelyx: desktop(bridge), confirm })
  return { bridge, confirm }
}
beforeEach(() => {
  useDocumentTabs.setState({ tabs: [], activeId: null, recovery: [] })
  useEditor.getState().replace(createDocument('Current', 'current'))
  useEditor.setState({ busy: false, recovery: null })
  resetFileSecurityState()
})
afterEach(() => {
  answerPassword(null)
  vi.unstubAllGlobals()
})
const prompt = async (): Promise<void> => {
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
  it('opens the accepted file in a new tab while preserving a concurrent external replacement', async () => {
    const { bridge, confirm } = setup()
    const reading = openDocument()
    await prompt()
    useEditor.getState().replace(createDocument('Concurrent edit', 'concurrent'))
    const concurrent = useEditor.getState().workbook
    confirm.mockReturnValue(false)
    answerPassword('correct-password')
    await reading
    expect(confirm).not.toHaveBeenCalled()
    expect(useEditor.getState().workbook.title).toBe('Protected document')
    expect(bridge.activateUnlockedDocument).toHaveBeenCalledWith('token')
    const original = useDocumentTabs
      .getState()
      .tabs.find((tab) => tab.editor.workbook.id === concurrent.id)
    expect(original?.editor.workbook).toBe(concurrent)
    expect(useDocumentTabs.getState().tabs).toHaveLength(2)
    if (!original) throw new Error('Concurrent document tab was lost')
    switchDocumentTab(original.id)
    expect(useEditor.getState().workbook).toBe(concurrent)
    expect(useEditor.getState().history.document.title).toBe('Concurrent edit')
  })

  it('retains edits and the outgoing encryption indicator while native activation is pending', async () => {
    const { bridge } = setup()
    const id = useEditor.getState().workbook.id
    useFileSecurityState.setState({ documentId: id, encrypted: true })
    let complete = (): void => undefined
    bridge.activateUnlockedDocument.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          complete = () => {
            resolve({ encrypted: true })
          }
        }),
    )
    const opening = openDocument()
    await prompt()
    answerPassword('correct-password')
    await vi.waitFor(() => {
      expect(bridge.activateUnlockedDocument).toHaveBeenCalledOnce()
    })
    useEditor.getState().startEdit('root')
    useEditor.getState().setDraft('Typed while the incoming key was activating')
    complete()
    await opening
    const original = useDocumentTabs.getState().tabs.find((tab) => tab.editor.workbook.id === id)
    expect(original?.editor.draft).toBe('Typed while the incoming key was activating')
    expect(original?.security).toMatchObject({ documentId: id, encrypted: true })
    expect(useEditor.getState().workbook.title).toBe('Protected document')
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
