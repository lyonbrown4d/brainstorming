import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createDocument, createWorkbook, serializeWorkbook } from '@core'
import { isEncryptedBrainstorming } from '@formats/encrypted'
import type { DocumentFiles } from '@main/files'
import { documentFiles, closeDocumentFiles, recoveryArchive } from '@tests/fixtures/files'
import { desktop } from '@tests/fixtures/desktop'
import { isDirty, useEditor } from '@renderer/state/editor'
import {
  changeFilePassword,
  readRecoveryContents,
  restoreRecovery,
} from '@renderer/state/fileSecurityActions'
import {
  answerPassword,
  resetFileSecurityState,
  useFileSecurityState,
  usePasswordPrompt,
} from '@renderer/state/password'

const workbook = createWorkbook(createDocument('Native protected draft', 'native-protected'))
const contents = serializeWorkbook(workbook)
const password = 'native-password-123'
let directory: string
let files: DocumentFiles
const bindFiles = (service: DocumentFiles): void => {
  vi.stubGlobal('window', {
    confirm: () => true,
    brainstorming: desktop({
      readLockedRecovery: service.readLockedRecovery,
      writeRecovery: service.writeRecovery,
      setFilePassword: service.setFilePassword,
      unlockDocument: service.unlockDocument,
      activateUnlockedDocument: service.activateUnlockedDocument,
      cancelUnlock: (token) => {
        service.cancelUnlock(token)
        return Promise.resolve()
      },
    }),
  })
}
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'brainstorming-renderer-recovery-'))
  files = documentFiles(directory)
  await files.initialize()
  useEditor.getState().replace(workbook)
  useEditor.setState({ busy: false, recovery: null })
  resetFileSecurityState()
  useFileSecurityState.setState({ lockedRecovery: false })
  bindFiles(files)
})
afterEach(async () => {
  await closeDocumentFiles()
  answerPassword(null)
  resetFileSecurityState()
  vi.unstubAllGlobals()
  await rm(directory, { recursive: true, force: true })
})
const waitForPrompt = async (): Promise<void> => {
  await vi.waitFor(() => {
    expect(usePasswordPrompt.getState().request).not.toBeNull()
  })
}

describe('native encrypted recovery boundary', () => {
  it('protects existing recovery in main and activates a fresh unlock only when restored', async () => {
    await files.writeRecovery(contents)
    await changeFilePassword(password)
    const encrypted = await recoveryArchive(directory, files)
    expect(await isEncryptedBrainstorming(encrypted)).toBe(true)
    expect(encrypted.includes(Buffer.from('Native protected draft'))).toBe(false)
    expect(encrypted.includes(Buffer.from(password))).toBe(false)
    const restarted = documentFiles(directory)
    await restarted.initialize()
    bindFiles(restarted)
    resetFileSecurityState()
    const reading = readRecoveryContents()
    await waitForPrompt()
    answerPassword('wrong-password')
    await vi.waitFor(() => {
      expect(usePasswordPrompt.getState().request?.error).toContain('密码错误')
    })
    answerPassword(password)
    expect(await reading).toBe(contents)
    expect(restarted.getFileSecurity(workbook.id)).toEqual({ encrypted: false })
    expect(useFileSecurityState.getState().encrypted).toBe(false)
    useEditor.setState({ recovery: contents })
    restoreRecovery()
    await vi.waitFor(() => {
      expect(useEditor.getState().busy).toBe(false)
    })
    expect(useEditor.getState().workbook).toEqual(workbook)
    expect(useEditor.getState().recovery).toBeNull()
    expect(isDirty()).toBe(true)
    expect(restarted.getFileSecurity(workbook.id)).toEqual({ encrypted: true })
    await restarted.writeRecovery(contents)
    expect(await isEncryptedBrainstorming(await recoveryArchive(directory, files))).toBe(true)
  })

  it('preserves native ciphertext and the current document when recovery unlocking is canceled', async () => {
    await files.writeRecovery(contents)
    await changeFilePassword(password)
    const before = await recoveryArchive(directory, files)
    const restarted = documentFiles(directory)
    await restarted.initialize()
    bindFiles(restarted)
    useEditor.getState().replace(createDocument('Current document', 'current'))
    const current = useEditor.getState().workbook
    const reading = readRecoveryContents()
    const rejected = expect(reading).rejects.toThrow('已保留')
    await waitForPrompt()
    answerPassword(null)
    await rejected
    expect(await recoveryArchive(directory, files)).toEqual(before)
    expect(useEditor.getState().workbook).toBe(current)
    expect(restarted.getFileSecurity(workbook.id)).toEqual({ encrypted: false })
    expect(useFileSecurityState.getState().lockedRecovery).toBe(true)
  })
})
