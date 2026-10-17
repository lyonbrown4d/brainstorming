import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { applyCommand, createDocument, createWorkbook, serializeWorkbook } from '@core'
import {
  decryptBrainstorming,
  encryptBrainstorming,
  isEncryptedBrainstorming,
} from '@formats/encrypted'
import { DocumentFiles } from '@main/files'
import { NativeDocuments } from '@main/document-db'
import { ResourceLibrary } from '@main/resources/library'
import { LocalDatabase } from '@main/storage/database'
import { FileSecuritySession, isEncryptedNativeFile } from '@main/file-security/session'
import { DocumentBackups } from '@main/file-security/backups'
import { RecoveryWorkspaceService } from '@main/workspace-recovery/service'
import { createAsset } from '@assets'
import { documentFiles, closeDocumentFiles, recoveryArchive } from '@tests/fixtures/files'

let directory: string
let files: DocumentFiles
const workbook = createWorkbook(createDocument('保密文字 unique-secret-value', 'security-book'))
const contents = serializeWorkbook(workbook)
const password = 'test-secret-123'
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'brainstorming-security-'))
  files = documentFiles(join(directory, 'application'))
  await files.initialize()
})
afterEach(async () => {
  await closeDocumentFiles()
  vi.useRealTimers()
  vi.restoreAllMocks()
  await rm(directory, { recursive: true, force: true })
})

describe('password-protected document lifecycle', () => {
  it('retains accepted existing passwords while enforcing new-password requirements', async () => {
    const path = join(directory, 'legacy.brainstorming')
    await writeFile(path, await encryptBrainstorming(workbook, 'old', 'existing'))
    const locked = await files.openSelected(path)
    const opened = await files.unlockDocument(locked.lockedToken, 'old')
    await files.activateUnlockedDocument(opened.sessionToken)
    await files.save(path, contents)
    await files.writeRecovery(contents)
    expect(await decryptBrainstorming(await readFile(path), 'old')).toEqual(workbook)
    expect(
      await decryptBrainstorming(
        await recoveryArchive(join(directory, 'application'), files),
        'old',
      ),
    ).toEqual(workbook)
    await expect(files.setFilePassword(workbook.id, 'old')).rejects.toThrow('8 至 128')
    await expect(files.save(path, contents, 'old')).rejects.toThrow('8 至 128')
  })

  it('saves encrypted SQLite, reopens after restart, retries wrong passwords and activates only accepted sessions', async () => {
    const path = files.authorizeSelected(join(directory, 'secure.brainstorming'))
    await files.save(path, contents, password)
    const bytes = await readFile(path)
    expect(await isEncryptedBrainstorming(bytes)).toBe(true)
    expect(bytes.includes(Buffer.from('unique-secret-value'))).toBe(false)
    const restarted = documentFiles(join(directory, 'application'))
    await restarted.initialize()
    const locked = await restarted.openSelected(path)
    expect(locked.contents).toBe('')
    expect(locked.lockedToken).toBeDefined()
    await expect(restarted.save(path, contents)).rejects.toThrow('选择保存位置')
    await expect(restarted.unlockDocument(locked.lockedToken, 'wrong-password')).rejects.toThrow(
      '密码错误',
    )
    expect(restarted.getFileSecurity(workbook.id)).toEqual({ encrypted: false })
    const unlocked = await restarted.unlockDocument(locked.lockedToken, password)
    expect(unlocked.contents).toBe(contents)
    expect(restarted.getFileSecurity(workbook.id)).toEqual({ encrypted: false })
    await restarted.activateUnlockedDocument(unlocked.sessionToken)
    expect(restarted.getFileSecurity(workbook.id)).toEqual({ encrypted: true })
    await restarted.save(path, contents)
    expect(await isEncryptedBrainstorming(await readFile(path))).toBe(true)
  })

  it('cancel, expired tokens and failed saves preserve the original bytes and active password', async () => {
    const path = files.authorizeSelected(join(directory, 'secure.brainstorming'))
    await files.save(path, contents, password)
    const original = await readFile(path)
    const locked = await files.openSelected(path)
    files.cancelUnlock(locked.lockedToken)
    await expect(files.unlockDocument(locked.lockedToken, password)).rejects.toThrow('失效')
    expect(files.getFileSecurity(workbook.id)).toEqual({ encrypted: true })
    await expect(files.save(path, '{}', password)).rejects.toThrow()
    await expect(files.save(path, contents, 'short')).rejects.toThrow('8 至 128')
    expect(await readFile(path)).toEqual(original)
    const again = await files.openSelected(path)
    vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 5 * 60_000 + 1)
    await expect(files.unlockDocument(again.lockedToken, password)).rejects.toThrow('失效')
    vi.restoreAllMocks()
  })

  it('encrypts existing and subsequent recovery records, preserves ciphertext on cancellation, and unlocks after restart', async () => {
    await files.writeRecovery(contents)
    await files.setFilePassword(workbook.id, password)
    const recoveryPath = async () => recoveryArchive(join(directory, 'application'), files)
    expect(await isEncryptedBrainstorming(await recoveryPath())).toBe(true)
    await files.writeRecovery(contents)
    const encrypted = await recoveryPath()
    expect(encrypted.includes(Buffer.from('unique-secret-value'))).toBe(false)
    const restarted = documentFiles(join(directory, 'application'))
    await restarted.initialize()
    await expect(restarted.readRecovery()).rejects.toThrow('恢复文件无法读取')
    const locked = await restarted.readLockedRecovery()
    expect(locked?.lockedToken).toBeDefined()
    restarted.cancelUnlock(locked?.lockedToken)
    expect(await recoveryPath()).toEqual(encrypted)
    const retry = await restarted.readLockedRecovery()
    const opened = await restarted.unlockDocument(retry?.lockedToken, password)
    expect(opened.contents).toBe(contents)
    await restarted.activateUnlockedDocument(opened.sessionToken)
    await restarted.writeRecovery(contents)
    expect(await isEncryptedBrainstorming(await recoveryPath())).toBe(true)
  })

  it('encrypts earlier plaintext history when protection is enabled', async () => {
    const path = files.authorizeSelected(join(directory, 'history-upgrade.brainstorming'))
    await files.save(path, contents)
    expect((await files.listDocumentBackups(workbook.id))[0]?.encrypted).toBe(false)
    await files.setFilePassword(workbook.id, password)
    const backups = await files.listDocumentBackups(workbook.id)
    expect(backups).toHaveLength(1)
    expect(backups.every(({ encrypted }) => encrypted)).toBe(true)
    const backup = backups[0]
    if (!backup) throw new Error('Missing backup')
    expect(await isEncryptedBrainstorming(await readFile(path))).toBe(true)
    expect(await readdir(join(directory, 'application'))).not.toContain('history-v1')
    expect((await files.restoreDocumentBackup(backup.id)).contents).toBe(contents)
  })

  it('changes/removes passwords explicitly and never carries a previous workbook key to a new document', async () => {
    const path = files.authorizeSelected(join(directory, 'secure.brainstorming'))
    await files.save(path, contents, password)
    await files.writeRecovery(contents)
    await files.setFilePassword(workbook.id, 'new-password-456')
    await files.save(path, contents)
    await expect(decryptBrainstorming(await readFile(path), password)).rejects.toThrow()
    expect(await decryptBrainstorming(await readFile(path), 'new-password-456')).toEqual(workbook)
    await files.save(path, contents, null)
    expect(await isEncryptedBrainstorming(await readFile(path))).toBe(false)
    expect(
      await isEncryptedBrainstorming(await recoveryArchive(join(directory, 'application'), files)),
    ).toBe(false)
    const next = createWorkbook(createDocument('New document', 'new-document'))
    const nextPath = files.authorizeSelected(join(directory, 'new.brainstorming'))
    await files.save(nextPath, serializeWorkbook(next))
    expect(await isEncryptedBrainstorming(await readFile(nextPath))).toBe(false)
  }, 15_000)
})

describe('bounded private version history', () => {
  it('keeps 20 generated snapshots, restores in memory, and rejects path traversal or arbitrary files', async () => {
    const path = files.authorizeSelected(join(directory, 'versions.brainstorming'))
    for (let index = 0; index < 23; index += 1) {
      const document = applyCommand(workbook.sheets[0]?.document ?? createDocument(), {
        type: 'renameTopic',
        topicId: 'root',
        title: `Version ${index}`,
      })
      await files.save(path, serializeWorkbook(createWorkbook(document)))
    }
    const backups = await files.listDocumentBackups(workbook.id)
    expect(backups).toHaveLength(20)
    expect(backups.every(({ id }) => /^[a-f0-9]{32}\/[a-f0-9-]{36}$/u.test(id))).toBe(true)
    const before = await readFile(path)
    const backup = backups.at(-1)
    if (!backup) throw new Error('Missing backup')
    const restored = await files.restoreDocumentBackup(backup.id)
    expect(restored.path).toBeNull()
    expect(restored.contents).toContain('Version')
    expect(await readFile(path)).toEqual(before)
    for (const id of [
      '../../versions.brainstorming',
      path,
      'a/../versions.brainstorming',
      '',
      `${backup.id}/extra`,
    ])
      await expect(files.restoreDocumentBackup(id)).rejects.toThrow('标识无效')
  })

  it('persists encrypted snapshots without plaintext or passwords and unlocks them after restart', async () => {
    const path = files.authorizeSelected(join(directory, 'secure.brainstorming'))
    await files.save(path, contents, password)
    const [backup] = await files.listDocumentBackups(workbook.id)
    if (!backup) throw new Error('Missing backup')
    expect(backup.encrypted).toBe(true)
    const bytes = await readFile(path)
    expect(await isEncryptedBrainstorming(bytes)).toBe(true)
    expect(bytes.includes(Buffer.from('unique-secret-value'))).toBe(false)
    expect(bytes.includes(Buffer.from(password))).toBe(false)
    expect(await readdir(join(directory, 'application'))).not.toContain('password')
    const restarted = documentFiles(join(directory, 'application'))
    await restarted.initialize()
    await expect(restarted.restoreDocumentBackup(backup.id)).rejects.toThrow('尚未打开')
    const locked = await restarted.openSelected(path)
    const unlocked = await restarted.unlockDocument(locked.lockedToken, password)
    await restarted.activateUnlockedDocument(unlocked.sessionToken)
    const restored = await restarted.restoreDocumentBackup(backup.id)
    expect(restored.contents).toBe(contents)
  })
})

it('compensates an orphan already rekeyed when indexed recovery protection fails', async () => {
  const storage = join(directory, 'compensation')
  const native = new NativeDocuments()
  const resources = new ResourceLibrary(storage, native)
  const database = new LocalDatabase(storage)
  const security = new FileSecuritySession(native, resources)
  const workspace = new RecoveryWorkspaceService(
    storage,
    security,
    database.recoveryIndex,
    native,
    resources,
  )
  const local = new DocumentFiles(
    storage,
    security,
    new DocumentBackups('', native, resources),
    workspace,
    database.recentFiles,
    native,
    resources,
  )
  const first = createWorkbook(
    applyCommand(createDocument('Orphan', 'compensated'), {
      type: 'addTopicAttachment',
      topicId: 'root',
      asset: createAsset(Buffer.from('orphan bytes'), 'orphan.bin', 'old'),
    }),
  )
  const second = createWorkbook(
    applyCommand(createDocument('Indexed', 'compensated'), {
      type: 'addTopicAttachment',
      topicId: 'root',
      asset: createAsset(Buffer.from('current bytes'), 'current.bin', 'new'),
    }),
  )
  try {
    await local.initialize()
    await local.writeWorkspaceRecovery([serializeWorkbook(first)])
    const orphan = (await database.recoveryIndex.read())[0]
    if (!orphan) throw new Error('Missing orphan')
    await local.clearRecovery()
    await local.writeWorkspaceRecovery([serializeWorkbook(second)])
    const indexed = (await database.recoveryIndex.read())[0]
    if (!indexed) throw new Error('Missing indexed recovery')
    const orphanPath = join(storage, 'recovery-sqlite-v1', orphan.fileName)
    const indexedPath = join(storage, 'recovery-sqlite-v1', indexed.fileName)
    const rekey = native.rekey
    let rejectIndexed = true
    vi.spyOn(native, 'rekey').mockImplementation(async (path, previous, next) => {
      if (path === indexedPath && next === password && rejectIndexed) {
        rejectIndexed = false
        throw new Error('indexed protection failed')
      }
      await rekey(path, previous, next)
    })
    await expect(local.setFilePassword(first.id, password)).rejects.toThrow(
      'indexed protection failed',
    )
    expect(local.getFileSecurity(first.id)).toEqual({ encrypted: false })
    expect(await isEncryptedNativeFile(orphanPath)).toBe(false)
    expect(await isEncryptedNativeFile(indexedPath)).toBe(false)
    expect((await native.read(orphanPath)).title).toBe(first.title)
    expect((await native.read(indexedPath)).title).toBe(second.title)
  } finally {
    await local.flush()
    security.dispose()
    await resources.dispose()
    await native.dispose()
    database.close()
  }
})
