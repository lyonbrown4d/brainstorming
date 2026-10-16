import { mkdtemp, readFile, readdir, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createDocument, serializeDocument } from '../../src/core'
import { atomicWrite, DocumentFiles } from '../../src/main/files'

let directory: string
let files: DocumentFiles
const contents = serializeDocument(createDocument('保存测试', 'file-test'))

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'trelyx-files-'))
  files = new DocumentFiles(join(directory, 'application'))
  await files.initialize()
})
afterEach(async () => {
  await rm(directory, { recursive: true, force: true })
})

describe('桌面文件服务', () => {
  it('保存、重新打开并持久化最近文件', async () => {
    const path = files.authorizeSelected(join(directory, '导图.trelyx'))
    await files.save(path, contents)
    expect(await files.openSelected(path)).toEqual({ path, contents })
    const restarted = new DocumentFiles(join(directory, 'application'))
    await restarted.initialize()
    expect(restarted.getRecentFiles()).toEqual([{ path, name: '导图.trelyx' }])
    expect(await restarted.openRecent(path)).toEqual({ path, contents })
  })

  it('无效文档或未授权位置不会覆盖文件', async () => {
    const path = files.authorizeSelected(join(directory, 'existing.trelyx'))
    await files.save(path, contents)
    await expect(files.save(path, '{}')).rejects.toThrow()
    await expect(files.save(join(directory, 'other.trelyx'), contents)).rejects.toThrow(
      '选择保存位置',
    )
    expect(await readFile(path, 'utf8')).toBe(contents)
    expect(await readdir(directory)).not.toContain('other.trelyx')
  })

  it('损坏的打开文件不会获得写入权限，最近文件不能任意读取', async () => {
    const path = join(directory, 'bad.json')
    await writeFile(path, '{broken')
    await expect(files.openSelected(path)).rejects.toThrow()
    await expect(files.save(path, contents)).rejects.toThrow('选择保存位置')
    await expect(files.openRecent(path)).rejects.toThrow('最近文件列表')
    expect(files.getRecentFiles()).toEqual([])
  })

  it('替换失败时保留目标并清理临时文件', async () => {
    const target = join(directory, 'directory.trelyx')
    await mkdir(target)
    await writeFile(join(target, 'keep'), 'original')
    await expect(atomicWrite(target, contents)).rejects.toThrow()
    expect(await readFile(join(target, 'keep'), 'utf8')).toBe('original')
    expect((await readdir(directory)).filter((name) => name.endsWith('.tmp'))).toEqual([])
  })

  it('恢复写入按顺序落盘，错误内容保留最后的有效恢复', async () => {
    expect(await files.readRecovery()).toBeNull()
    const updated = serializeDocument(createDocument('最新修改', 'recovery-test'))
    await Promise.all([files.writeRecovery(contents), files.writeRecovery(updated)])
    expect(await files.readRecovery()).toBe(updated)
    expect(() => files.writeRecovery('invalid')).toThrow()
    expect(await files.readRecovery()).toBe(updated)
    await files.clearRecovery()
    expect(await files.readRecovery()).toBeNull()
  })

  it('损坏恢复文件明确报错并保留文件供排查', async () => {
    const path = join(directory, 'application', 'recovery.trelyx')
    await writeFile(path, 'broken')
    await expect(files.readRecovery()).rejects.toThrow('恢复文件无法读取')
    expect(await readFile(path, 'utf8')).toBe('broken')
  })
})
