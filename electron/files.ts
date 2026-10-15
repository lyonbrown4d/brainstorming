import writeFileAtomic from 'write-file-atomic'
import { open, mkdir, unlink, readFile } from 'node:fs/promises'
import { basename, extname, join, resolve } from 'node:path'
import { deserializeDocument } from '@/core'
import type { OpenedDocument, RecentFile } from '../shared/contracts'

export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024

export function validateContents(value: unknown): asserts value is string {
  if (typeof value !== 'string' || Buffer.byteLength(value) > MAX_DOCUMENT_BYTES) {
    throw new Error('文档内容无效或超过 10 MB')
  }
  deserializeDocument(value)
}

export function validatePath(value: unknown): asserts value is string {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > 4096 ||
    value.includes('\0') ||
    !['.trelyx', '.json'].includes(extname(value).toLowerCase())
  ) {
    throw new Error('请选择 .trelyx 或 .json 文件')
  }
}

export async function atomicWrite(path: string, contents: string): Promise<void> {
  await writeFileAtomic(path, contents, { encoding: 'utf8', mode: 0o600, fsync: true })
}

function isMissing(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT'
}

async function readDocument(path: string): Promise<string> {
  const handle = await open(path, 'r')
  try {
    if ((await handle.stat()).size > MAX_DOCUMENT_BYTES) throw new Error('文档超过 10 MB')
    const contents = await handle.readFile('utf8')
    validateContents(contents)
    return contents
  } finally {
    await handle.close()
  }
}

export class DocumentFiles {
  private readonly authorizedPaths = new Set<string>()
  private recentPaths: string[] = []
  private recoveryQueue: Promise<void> = Promise.resolve()
  private readonly recoveryPath: string
  private readonly recentPath: string

  constructor(private readonly storageDirectory: string) {
    this.recoveryPath = join(storageDirectory, 'recovery.trelyx')
    this.recentPath = join(storageDirectory, 'recent-files.json')
  }

  async initialize(): Promise<void> {
    await mkdir(this.storageDirectory, { recursive: true })
    try {
      const parsed: unknown = JSON.parse(await readFile(this.recentPath, 'utf8'))
      if (Array.isArray(parsed)) {
        this.recentPaths = parsed
          .filter((path): path is string => {
            try {
              validatePath(path)
              return resolve(path) === path
            } catch {
              return false
            }
          })
          .slice(0, 10)
      }
    } catch (error) {
      // A damaged recent-file list must not prevent document recovery/startup.
      if (!isMissing(error)) this.recentPaths = []
    }
  }

  getRecentFiles(): RecentFile[] {
    return this.recentPaths.map((path) => ({ path, name: basename(path) }))
  }

  async openSelected(path: string): Promise<OpenedDocument> {
    validatePath(path)
    const absolute = resolve(path)
    const contents = await readDocument(absolute)
    this.authorizedPaths.add(absolute)
    await this.remember(absolute)
    return { path: absolute, contents }
  }

  async openRecent(path: unknown): Promise<OpenedDocument> {
    validatePath(path)
    if (!this.recentPaths.includes(path)) throw new Error('文件不在最近文件列表中')
    return this.openSelected(path)
  }

  authorizeSelected(path: string): string {
    validatePath(path)
    const absolute = resolve(path)
    this.authorizedPaths.add(absolute)
    return absolute
  }

  async save(path: string, contents: unknown): Promise<string> {
    validateContents(contents)
    validatePath(path)
    if (!this.authorizedPaths.has(path)) throw new Error('请先通过文件对话框选择保存位置')
    await atomicWrite(path, contents)
    await this.remember(path)
    return path
  }

  async readRecovery(): Promise<string | null> {
    try {
      return await readDocument(this.recoveryPath)
    } catch (error) {
      if (isMissing(error)) return null
      throw new Error('自动恢复文件无法读取，请保留原文件后重试', { cause: error })
    }
  }

  writeRecovery(contents: unknown): Promise<void> {
    validateContents(contents)
    const write = this.recoveryQueue.then(() => atomicWrite(this.recoveryPath, contents))
    this.recoveryQueue = write.catch(() => undefined)
    return write
  }

  async clearRecovery(): Promise<void> {
    await this.recoveryQueue
    await unlink(this.recoveryPath).catch((error: unknown) => {
      if (!isMissing(error)) throw error
    })
  }

  private async remember(path: string): Promise<void> {
    this.recentPaths = [path, ...this.recentPaths.filter((entry) => entry !== path)].slice(0, 10)
    // The document is already saved/opened; recent-list failure must not report data loss.
    await atomicWrite(this.recentPath, JSON.stringify(this.recentPaths)).catch(() => undefined)
  }
}
