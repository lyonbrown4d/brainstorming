import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { applyCommand, createDocument, createWorkbook, serializeWorkbook } from '../../src/core'
import { decryptTrelyx, encryptTrelyx, isEncryptedTrelyx } from '../../src/formats/encrypted'
import { DocumentFiles } from '../../src/main/files'

let directory: string
let files: DocumentFiles
const workbook = createWorkbook(createDocument('保密文字 unique-secret-value', 'security-book'))
const contents = serializeWorkbook(workbook)
const password = 'test-secret-123'
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'trelyx-security-'))
  files = new DocumentFiles(join(directory, 'application'))
  await files.initialize()
})
afterEach(async () => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  await rm(directory, { recursive: true, force: true })
})

describe('password-protected document lifecycle', () => {
  it('retains successfully decrypted legacy passwords while enforcing new-password requirements', async () => {
    const path = join(directory, 'legacy.trelyx')
    await writeFile(path, await encryptTrelyx(workbook, 'old', 'existing'))
    const locked = await files.openSelected(path)
    const opened = await files.unlockDocument(locked.lockedToken, 'old')
    await files.activateUnlockedDocument(opened.sessionToken)
    await files.save(path, contents)
    await files.writeRecovery(contents)
    expect(await decryptTrelyx(await readFile(path), 'old')).toEqual(workbook)
    expect(
      await decryptTrelyx(
        await readFile(join(directory, 'application', 'recovery-v1.trelyx')),
        'old',
      ),
    ).toEqual(workbook)
    await expect(files.setFilePassword(workbook.id, 'old')).rejects.toThrow('8 至 128')
    await expect(files.save(path, contents, 'old')).rejects.toThrow('8 至 128')
  })

  it('saves AES-256, reopens after restart, retries wrong passwords and activates only accepted sessions', async () => {
    const path = files.authorizeSelected(join(directory, 'secure.trelyx'))
    await files.save(path, contents, password)
    const bytes = await readFile(path)
    expect(await isEncryptedTrelyx(bytes)).toBe(true)
    expect(bytes.includes(Buffer.from('unique-secret-value'))).toBe(false)
    const restarted = new DocumentFiles(join(directory, 'application'))
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
    expect(await isEncryptedTrelyx(await readFile(path))).toBe(true)
  })

  it('cancel, expired tokens and failed saves preserve the original bytes and active password', async () => {
    const path = files.authorizeSelected(join(directory, 'secure.trelyx'))
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
    const recoveryPath = join(directory, 'application', 'recovery-v1.trelyx')
    expect(await isEncryptedTrelyx(await readFile(recoveryPath))).toBe(true)
    await files.writeRecovery(contents)
    const encrypted = await readFile(recoveryPath)
    expect(encrypted.includes(Buffer.from('unique-secret-value'))).toBe(false)
    const restarted = new DocumentFiles(join(directory, 'application'))
    await restarted.initialize()
    await expect(restarted.readRecovery()).rejects.toThrow('恢复文件无法读取')
    const locked = await restarted.readLockedRecovery()
    expect(locked?.lockedToken).toBeDefined()
    restarted.cancelUnlock(locked?.lockedToken)
    expect(await readFile(recoveryPath)).toEqual(encrypted)
    const retry = await restarted.readLockedRecovery()
    const opened = await restarted.unlockDocument(retry?.lockedToken, password)
    expect(opened.contents).toBe(contents)
    await restarted.activateUnlockedDocument(opened.sessionToken)
    await restarted.writeRecovery(contents)
    expect(await isEncryptedTrelyx(await readFile(recoveryPath))).toBe(true)
  })

  it('encrypts earlier plaintext history when protection is enabled', async () => {
    const path = files.authorizeSelected(join(directory, 'history-upgrade.trelyx'))
    await files.save(path, contents)
    expect((await files.listDocumentBackups(workbook.id))[0]?.encrypted).toBe(false)
    await files.setFilePassword(workbook.id, password)
    const backups = await files.listDocumentBackups(workbook.id)
    expect(backups).toHaveLength(1)
    expect(backups.every(({ encrypted }) => encrypted)).toBe(true)
    const backup = backups[0]
    if (!backup) throw new Error('Missing backup')
    expect(
      await isEncryptedTrelyx(
        await readFile(join(directory, 'application', 'history-v1', backup.id)),
      ),
    ).toBe(true)
    expect(
      (
        await readdir(join(directory, 'application', 'history-v1', backup.id.split('/')[0] ?? ''))
      ).some((name) => name.endsWith('-p.trelyx')),
    ).toBe(false)
  })

  it('changes/removes passwords explicitly and never carries a previous workbook key to a new document', async () => {
    const path = files.authorizeSelected(join(directory, 'secure.trelyx'))
    await files.save(path, contents, password)
    await files.writeRecovery(contents)
    await files.setFilePassword(workbook.id, 'new-password-456')
    await files.save(path, contents)
    await expect(decryptTrelyx(await readFile(path), password)).rejects.toThrow()
    expect(await decryptTrelyx(await readFile(path), 'new-password-456')).toEqual(workbook)
    await files.save(path, contents, null)
    expect(await isEncryptedTrelyx(await readFile(path))).toBe(false)
    expect(
      await isEncryptedTrelyx(await readFile(join(directory, 'application', 'recovery-v1.trelyx'))),
    ).toBe(false)
    const next = createWorkbook(createDocument('New document', 'new-document'))
    const nextPath = files.authorizeSelected(join(directory, 'new.trelyx'))
    await files.save(nextPath, serializeWorkbook(next))
    expect(await isEncryptedTrelyx(await readFile(nextPath))).toBe(false)
  })
})

describe('bounded private version history', () => {
  it('keeps 20 generated snapshots, restores in memory, and rejects path traversal or arbitrary files', async () => {
    const path = files.authorizeSelected(join(directory, 'versions.trelyx'))
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
    expect(
      backups.every(({ id }) => /^[a-f0-9]{32}\/\d{13}-[a-f0-9-]{36}-p\.trelyx$/u.test(id)),
    ).toBe(true)
    const before = await readFile(path)
    const backup = backups.at(-1)
    if (!backup) throw new Error('Missing backup')
    const restored = await files.restoreDocumentBackup(backup.id)
    expect(restored.path).toBeNull()
    expect(restored.contents).toContain('Version')
    expect(await readFile(path)).toEqual(before)
    for (const id of [
      '../../versions.trelyx',
      path,
      'a/../versions.trelyx',
      '',
      `${backup.id}/extra`,
    ])
      await expect(files.restoreDocumentBackup(id)).rejects.toThrow('标识无效')
  })

  it('persists encrypted snapshots without plaintext or passwords and unlocks them after restart', async () => {
    const path = files.authorizeSelected(join(directory, 'secure.trelyx'))
    await files.save(path, contents, password)
    const [backup] = await files.listDocumentBackups(workbook.id)
    if (!backup) throw new Error('Missing backup')
    expect(backup.encrypted).toBe(true)
    const bytes = await readFile(join(directory, 'application', 'history-v1', backup.id))
    expect(await isEncryptedTrelyx(bytes)).toBe(true)
    expect(bytes.includes(Buffer.from('unique-secret-value'))).toBe(false)
    expect(bytes.includes(Buffer.from(password))).toBe(false)
    expect(await readdir(join(directory, 'application'))).not.toContain('password')
    const restarted = new DocumentFiles(join(directory, 'application'))
    await restarted.initialize()
    const locked = await restarted.restoreDocumentBackup(backup.id)
    const restored = await restarted.unlockDocument(locked.lockedToken, password)
    expect(restored.contents).toBe(contents)
  })
})
