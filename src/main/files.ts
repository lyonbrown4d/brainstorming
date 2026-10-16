import writeFileAtomic from 'write-file-atomic'
import { open, mkdir, unlink, readFile } from 'node:fs/promises'
import { basename, extname, join, resolve } from 'node:path'
import { deserializeWorkbook, serializeWorkbook } from '@core'
import { decodeFile } from '../formats'
import { encodeTrelyx } from '../formats/trelyx'
import type { OpenedDocument, RecentFile } from '../shared/contracts'

// Internal pretty-printed IPC JSON may exceed the compact native entry's 10 MiB.
export const MAX_DOCUMENT_BYTES = 40 * 1024 * 1024
export const MAX_FILE_BYTES = 20 * 1024 * 1024

export function validateContents(value: unknown): asserts value is string {
  if (typeof value !== 'string' || Buffer.byteLength(value) > MAX_DOCUMENT_BYTES) {
    throw new Error('文档内容无效或超过 40 MB')
  }
  deserializeWorkbook(value)
}

function validatePath(value: unknown, extensions: readonly string[]): asserts value is string {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > 4096 ||
    value.includes('\0') ||
    !extensions.includes(extname(value).toLowerCase())
  ) {
    throw new Error(`请选择 ${extensions.join(' 或 ')} 文件`)
  }
}

export function validateOpenPath(value: unknown): asserts value is string {
  validatePath(value, ['.trelyx', '.xmind'])
}

export function validateSavePath(value: unknown): asserts value is string {
  validatePath(value, ['.trelyx'])
}

export async function atomicWrite(path: string, contents: string | Uint8Array): Promise<void> {
  await writeFileAtomic(path, typeof contents === 'string' ? contents : Buffer.from(contents), {
    encoding: 'utf8',
    mode: 0o600,
    fsync: true,
  })
}

function isMissing(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT'
}

async function readDocument(path: string): Promise<OpenedDocument> {
  const handle = await open(path, 'r')
  try {
    if ((await handle.stat()).size > MAX_FILE_BYTES) throw new Error('文件超过 20 MB')
    // A bounded stream also handles a file that grows after the stat check.
    const chunks: Buffer[] = []
    const stream = handle.createReadStream({ start: 0, end: MAX_FILE_BYTES, autoClose: false })
    let size = 0
    for await (const chunk of stream) {
      const bytes = chunk as Buffer
      size += bytes.length
      if (size > MAX_FILE_BYTES) throw new Error('文件超过 20 MB')
      chunks.push(bytes)
    }
    const decoded = decodeFile(Buffer.concat(chunks), path)
    const contents = serializeWorkbook(decoded.workbook)
    validateContents(contents)
    return decoded.imported
      ? { path: null, sourcePath: path, contents, warnings: decoded.warnings }
      : { path, contents, warnings: decoded.warnings }
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
    this.recoveryPath = join(storageDirectory, 'recovery-v1.trelyx')
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
              validateOpenPath(path)
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
    validateOpenPath(path)
    const absolute = resolve(path)
    const document = await readDocument(absolute)
    if (document.path !== null) this.authorizedPaths.add(absolute)
    await this.remember(absolute)
    return document
  }

  async openRecent(path: unknown): Promise<OpenedDocument> {
    validateOpenPath(path)
    if (!this.recentPaths.includes(path)) throw new Error('文件不在最近文件列表中')
    return this.openSelected(path)
  }

  authorizeSelected(path: string): string {
    validateSavePath(path)
    const absolute = resolve(path)
    this.authorizedPaths.add(absolute)
    return absolute
  }

  async save(path: string, contents: unknown): Promise<string> {
    validateContents(contents)
    validateSavePath(path)
    if (!this.authorizedPaths.has(path)) throw new Error('请先通过文件对话框选择保存位置')
    await atomicWrite(path, encodeTrelyx(deserializeWorkbook(contents)))
    await this.remember(path)
    return path
  }

  async readRecovery(): Promise<string | null> {
    try {
      return (await readDocument(this.recoveryPath)).contents
    } catch (error) {
      if (isMissing(error)) return null
      throw new Error('自动恢复文件无法读取，请保留原文件后重试', { cause: error })
    }
  }

  writeRecovery(contents: unknown): Promise<void> {
    validateContents(contents)
    const bytes = encodeTrelyx(deserializeWorkbook(contents))
    const write = this.recoveryQueue.then(() => atomicWrite(this.recoveryPath, bytes))
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
