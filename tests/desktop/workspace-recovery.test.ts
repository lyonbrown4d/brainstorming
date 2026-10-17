import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { randomUUID } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createDocument, createWorkbook, serializeWorkbook } from '@core'
import { decryptBrainstorming, isEncryptedBrainstorming } from '@formats/encrypted'
import type { DocumentFiles } from '@main/files'
import { documentFiles, closeDocumentFiles, recoveryIndexFor } from '@tests/fixtures/files'
import type { RecoveryEntry } from '@main/workspace-recovery/repository'
const first = createWorkbook(createDocument('First private title', 'first-workbook'))
const second = createWorkbook(createDocument('Second private title', 'second-workbook'))
const third = createWorkbook(createDocument('Plain title', 'third-workbook'))
const contents = [first, second, third].map(serializeWorkbook)
const passwordA = 'first-password-123'
const passwordB = 'second-password-456'
let directory: string
let files: DocumentFiles
const entries = () => recoveryIndexFor(files).read()
const archive = (file: string) => readFile(join(directory, 'recovery-v2', file))
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'brainstorming-workspace-'))
  files = documentFiles(directory)
  await files.initialize()
})
afterEach(async () => {
  await closeDocumentFiles()
  await rm(directory, { recursive: true, force: true })
})

describe('native workspace recovery', () => {
  it('preserves order and independent passwords across restart and multiple pending unlocks', async () => {
    await files.setFilePassword(first.id, passwordA)
    await files.setFilePassword(second.id, passwordB)
    await files.writeWorkspaceRecovery(contents)
    const stored = await entries()
    expect(stored.map(({ documentId }) => documentId)).toEqual([first.id, second.id, third.id])
    expect(await isEncryptedBrainstorming(await archive(stored[0]?.fileName ?? ''))).toBe(true)
    expect(await isEncryptedBrainstorming(await archive(stored[1]?.fileName ?? ''))).toBe(true)
    const restarted = documentFiles(directory)
    await restarted.initialize()
    await expect(restarted.writeWorkspaceRecovery(contents)).rejects.toThrow('不能写入明文')
    const opened = await restarted.readWorkspaceRecovery()
    expect(opened).toHaveLength(3)
    expect(opened[0]?.lockedToken).toBeDefined()
    expect(opened[1]?.lockedToken).toBeDefined()
    expect(opened[2]?.contents).toBe(contents[2])
    const a = await restarted.unlockDocument(opened[0]?.lockedToken, passwordA)
    const b = await restarted.unlockDocument(opened[1]?.lockedToken, passwordB)
    expect(a.contents).toBe(contents[0])
    expect(b.contents).toBe(contents[1])
    await restarted.activateUnlockedDocument(a.sessionToken)
    await restarted.activateUnlockedDocument(b.sessionToken)
    expect(restarted.getFileSecurity(first.id)).toEqual({ encrypted: true })
    expect(restarted.getFileSecurity(second.id)).toEqual({ encrypted: true })
    await restarted.writeWorkspaceRecovery(contents)
    const current = await entries()
    expect(
      await decryptBrainstorming(await archive(current[0]?.fileName ?? ''), passwordA),
    ).toEqual(first)
    expect(
      await decryptBrainstorming(await archive(current[1]?.fileName ?? ''), passwordB),
    ).toEqual(second)
    expect(JSON.stringify(await entries())).not.toContain('password')
  })

  it('protects current plaintext recovery, orphan generations and history without changing other workbook keys', async () => {
    await files.writeWorkspaceRecovery(contents)
    const before = await entries()
    const originalFile = before[0]?.fileName ?? ''
    const orphan = originalFile.replace(
      /\.[a-f0-9-]{36}\.brainstorming$/u,
      `.${randomUUID()}.brainstorming`,
    )
    await writeFile(join(directory, 'recovery-v2', orphan), await archive(originalFile))
    const path = files.authorizeSelected(join(directory, 'first.brainstorming'))
    await files.save(path, contents[0])
    await files.setFilePassword(second.id, passwordB)
    await files.setFilePassword(first.id, passwordA)
    expect(await isEncryptedBrainstorming(await archive(originalFile))).toBe(true)
    expect(await readdir(join(directory, 'recovery-v2'))).not.toContain(orphan)
    expect((await files.listDocumentBackups(first.id)).every(({ encrypted }) => encrypted)).toBe(
      true,
    )
    await files.setFilePassword(first.id, 'replacement-password')
    expect(await decryptBrainstorming(await archive(originalFile), 'replacement-password')).toEqual(
      first,
    )
    await files.setFilePassword(first.id, null)
    expect(await isEncryptedBrainstorming(await archive(originalFile))).toBe(false)
    expect(files.getFileSecurity(second.id)).toEqual({ encrypted: true })
    expect(await isEncryptedBrainstorming(await archive(before[1]?.fileName ?? ''))).toBe(true)
  })

  it('preserves the entire previous workspace when index transaction fails, then removes closed documents after success', async () => {
    await files.writeWorkspaceRecovery(contents)
    const before = await entries()
    const stored = await entries()
    const original = await Promise.all(stored.map(({ fileName }) => archive(fileName)))
    vi.spyOn(recoveryIndexFor(files), 'replace').mockRejectedValueOnce(
      new Error('index commit failed'),
    )
    await expect(files.writeWorkspaceRecovery([contents[2]])).rejects.toThrow('index commit failed')
    expect(await entries()).toEqual(before)
    expect(await Promise.all(stored.map(({ fileName }) => archive(fileName)))).toEqual(original)
    expect((await files.readWorkspaceRecovery()).map(({ contents: value }) => value)).toEqual(
      contents,
    )
    await files.writeWorkspaceRecovery([contents[2]])
    expect((await files.readWorkspaceRecovery()).map(({ contents: value }) => value)).toEqual([
      contents[2],
    ])
    const remaining = await readdir(join(directory, 'recovery-v2'))
    for (const item of stored) expect(remaining).not.toContain(item.fileName)
  })

  it('rejects malformed, duplicate or excessive input before modifying the existing index', async () => {
    await files.writeWorkspaceRecovery(contents)
    const before = await entries()
    for (const invalid of [
      { contents },
      ['{bad-json'],
      [contents[0], contents[0]],
      Array.from({ length: 33 }, () => contents[0]),
    ]) {
      expect(() => files.writeWorkspaceRecovery(invalid)).toThrow()
      expect(await entries()).toEqual(before)
    }
  })

  it('keeps an explicitly closed workspace empty after restart', async () => {
    await files.writeWorkspaceRecovery(contents)
    await files.writeWorkspaceRecovery([])
    const restarted = documentFiles(directory)
    await restarted.initialize()
    expect(await restarted.readWorkspaceRecovery()).toEqual([])
    expect(await readdir(join(directory, 'recovery-v2'))).toEqual([])
  })

  it('fails closed if an index adapter returns an escaping archive reference', async () => {
    await files.writeWorkspaceRecovery(contents)
    const before = await entries()
    const invalid = [
      { documentId: first.id, fileName: '../../outside.brainstorming', protocolVersion: 2 },
    ] as unknown as readonly RecoveryEntry[]
    vi.spyOn(recoveryIndexFor(files), 'read').mockResolvedValueOnce(invalid)
    await expect(files.readWorkspaceRecovery()).rejects.toThrow('索引损坏')
    expect(await entries()).toEqual(before)
  })
})
