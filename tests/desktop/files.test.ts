import { mkdtemp, readFile, readdir, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createDocument, createWorkbook, serializeWorkbook } from '@core'
import { encodeTrelyx } from '@formats/trelyx'
import { decodeFile } from '@formats'
import { zipSync, strToU8 } from 'fflate'
import { OpenFileRequests } from '@main/openFiles'
import { atomicWrite, type DocumentFiles, MAX_FILE_BYTES } from '@main/files'
import {
  documentFiles,
  closeDocumentFiles,
  recoveryArchive,
  recoveryIndexFor,
} from '@tests/fixtures/files'

let directory: string
let files: DocumentFiles
const workbook = createWorkbook(createDocument('保存测试', 'file-test'))
const contents = serializeWorkbook(workbook)

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'trelyx-files-'))
  files = documentFiles(join(directory, 'application'))
  await files.initialize()
})
afterEach(async () => {
  await closeDocumentFiles()
  await rm(directory, { recursive: true, force: true })
})

describe('桌面文件服务', () => {
  it('保存、重新打开并持久化最近文件', async () => {
    const path = files.authorizeSelected(join(directory, '导图.trelyx'))
    await files.save(path, contents)
    expect(await files.openSelected(path)).toEqual({ path, contents, warnings: [] })
    const restarted = documentFiles(join(directory, 'application'))
    await restarted.initialize()
    expect(restarted.getRecentFiles()).toEqual([{ path, name: '导图.trelyx' }])
    expect(await restarted.openRecent(path)).toEqual({ path, contents, warnings: [] })
  })

  it('无效文档或未授权位置不会覆盖文件', async () => {
    const path = files.authorizeSelected(join(directory, 'existing.trelyx'))
    await files.save(path, contents)
    await expect(files.save(path, '{}')).rejects.toThrow()
    await expect(files.save(join(directory, 'other.trelyx'), contents)).rejects.toThrow(
      '选择保存位置',
    )
    expect(decodeFile(await readFile(path), path).workbook).toEqual(workbook)
    expect(await readdir(directory)).not.toContain('other.trelyx')
  })

  it('损坏的打开文件不会获得写入权限，最近文件不能任意读取', async () => {
    const path = join(directory, 'bad.trelyx')
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
    const updated = serializeWorkbook(createWorkbook(createDocument('最新修改', 'recovery-test')))
    await Promise.all([files.writeRecovery(contents), files.writeRecovery(updated)])
    expect(await files.readRecovery()).toBe(updated)
    expect(() => files.writeRecovery('invalid')).toThrow()
    expect(await files.readRecovery()).toBe(updated)
    await files.clearRecovery()
    expect(await files.readRecovery()).toBeNull()
  })

  it('损坏恢复文件明确报错并保留文件供排查', async () => {
    await files.writeRecovery(contents)
    const entry = (await recoveryIndexFor(files).read())[0]
    if (!entry) throw new Error('Missing recovery fixture')
    const path = join(directory, 'application', 'recovery-v2', entry.fileName)
    await writeFile(path, 'broken')
    await expect(files.readRecovery()).rejects.toThrow('恢复文件无法读取')
    expect(await readFile(path, 'utf8')).toBe('broken')
  })

  it('导入 XMind 后要求另存为，不能覆盖来源文件', async () => {
    const path = join(directory, 'import.xmind')
    const source = zipSync({
      'content.json': strToU8(
        JSON.stringify([{ id: 'sheet', title: '导入', rootTopic: { id: 'root', title: 'XMind' } }]),
      ),
    })
    await writeFile(path, source)
    const opened = await files.openSelected(path)
    expect(opened).toMatchObject({ path: null, sourcePath: path })
    expect(opened.warnings).toBeDefined()
    expect(opened.contents).toContain('XMind')
    expect(() => files.authorizeSelected(path)).toThrow('.trelyx')
    await expect(files.save(path, opened.contents)).rejects.toThrow('.trelyx')
    expect(await readFile(path)).toEqual(Buffer.from(source))
  })

  it('拒绝旧 JSON 文件、伪装的原生 JSON 和超过边界的文件', async () => {
    const jsonPath = join(directory, 'old.json')
    await writeFile(jsonPath, contents)
    await expect(files.openSelected(jsonPath)).rejects.toThrow('.trelyx')
    const nativePath = join(directory, 'old.trelyx')
    await writeFile(nativePath, contents)
    await expect(files.openSelected(nativePath)).rejects.toThrow()
    await writeFile(nativePath, Buffer.alloc(MAX_FILE_BYTES + 1))
    await expect(files.openSelected(nativePath)).rejects.toThrow('32 MiB')
    expect(files.getRecentFiles()).toEqual([])
  })

  it('恢复文件使用二进制格式且不读取旧恢复命名空间', async () => {
    await writeFile(join(directory, 'application', 'recovery.trelyx'), contents)
    expect(await files.readRecovery()).toBeNull()
    await files.writeRecovery(contents)
    const bytes = await recoveryArchive(join(directory, 'application'), files)
    expect(bytes).toEqual(Buffer.from(encodeTrelyx(workbook)))
  })

  it('系统打开请求仅消费绝对路径，并通过相同文件校验', async () => {
    const requests = new OpenFileRequests()
    expect(requests.hasPending()).toBe(false)
    expect(requests.enqueueArguments(['electron', '.', '--flag', 'relative.trelyx'])).toBe(false)
    const path = files.authorizeSelected(join(directory, 'system.trelyx'))
    await files.save(path, contents)
    expect(requests.enqueueArguments(['electron', path])).toBe(true)
    expect(requests.hasPending()).toBe(true)
    expect(await requests.take(files)).toEqual({ path, contents, warnings: [] })
    expect(requests.hasPending()).toBe(false)
    expect(await requests.take(files)).toBeNull()
    expect(requests.enqueue(join(directory, 'script.js'))).toBe(false)
  })
})
