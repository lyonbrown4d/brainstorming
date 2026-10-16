import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readdir, lstat, unlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { DocumentBackup } from '../../shared/fileSecurity'
import { validateSecurityDocumentId } from '../../shared/fileSecurity'
import { encryptTrelyx } from '../../formats/encrypted'
import { decodeTrelyx } from '../../formats/trelyx'
import { atomicWrite } from './write'
import { readDocumentBytes } from './read'

const folderPattern = /^[a-f0-9]{32}$/u
const filePattern = /^\d{13}-[a-f0-9-]{36}-[ep]\.trelyx$/u
const idPattern = /^[a-f0-9]{32}\/\d{13}-[a-f0-9-]{36}-[ep]\.trelyx$/u
function isMissing(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT'
}
function folderFor(documentId: unknown): string {
  validateSecurityDocumentId(documentId)
  return createHash('sha256').update(documentId).digest('hex').slice(0, 32)
}
export class DocumentBackups {
  private queue: Promise<void> = Promise.resolve()
  constructor(private readonly directory: string) {}
  private async secureDirectory(path: string): Promise<void> {
    await mkdir(path, { recursive: true, mode: 0o700 })
    const info = await lstat(path)
    if (!info.isDirectory() || info.isSymbolicLink()) throw new Error('版本历史目录无效')
  }
  write(documentId: string, bytes: Uint8Array, encrypted: boolean): Promise<void> {
    const task = this.queue.then(() => this.writeNow(documentId, bytes, encrypted))
    this.queue = task.catch(() => undefined)
    return task
  }
  private async writeNow(documentId: string, bytes: Uint8Array, encrypted: boolean): Promise<void> {
    await this.secureDirectory(this.directory)
    const folder = folderFor(documentId)
    const directory = join(this.directory, folder)
    await this.secureDirectory(directory)
    const name = `${Date.now()}-${randomUUID()}-${encrypted ? 'e' : 'p'}.trelyx`
    await writeFile(join(directory, name), bytes, { flag: 'wx', mode: 0o600 })
    const all: DocumentBackup[] = []
    for (const entry of await readdir(this.directory)) {
      if (!folderPattern.test(entry)) continue
      const info = await lstat(join(this.directory, entry))
      if (!info.isDirectory() || info.isSymbolicLink()) continue
      all.push(...(await this.listFolder(entry)))
    }
    all.sort((a, b) => b.createdAt - a.createdAt || b.id.localeCompare(a.id))
    await Promise.all(all.slice(20).map(({ id }) => unlink(join(this.directory, id))))
  }
  protect(documentId: string, password: string | null): Promise<void> {
    if (password === null) return Promise.resolve()
    const task = this.queue.then(async () => {
      for (const backup of await this.list(documentId)) {
        if (backup.encrypted) continue
        const path = join(this.directory, backup.id)
        const workbook = decodeTrelyx(await this.read(backup.id))
        if (workbook.id !== documentId) throw new Error('版本文件与文档不一致')
        const protectedPath = path.replace(/-p\.trelyx$/u, '-e.trelyx')
        await atomicWrite(protectedPath, await encryptTrelyx(workbook, password, 'existing'))
        await unlink(path)
      }
    })
    this.queue = task.catch(() => undefined)
    return task
  }
  private async listFolder(folder: string): Promise<DocumentBackup[]> {
    const result: DocumentBackup[] = []
    const directory = join(this.directory, folder)
    try {
      const root = await lstat(this.directory)
      if (!root.isDirectory() || root.isSymbolicLink()) throw new Error('版本历史目录无效')
      const info = await lstat(directory)
      if (!info.isDirectory() || info.isSymbolicLink()) throw new Error('版本历史目录无效')
      for (const name of await readdir(directory)) {
        if (!filePattern.test(name)) continue
        const stat = await lstat(join(directory, name))
        if (stat.isFile() && !stat.isSymbolicLink())
          result.push({
            id: `${folder}/${name}`,
            createdAt: Number(name.slice(0, 13)),
            size: stat.size,
            encrypted: name.endsWith('-e.trelyx'),
          })
      }
    } catch (error) {
      if (!isMissing(error)) throw error
    }
    return result.sort((a, b) => b.createdAt - a.createdAt || b.id.localeCompare(a.id))
  }
  list(documentId: unknown): Promise<DocumentBackup[]> {
    return this.listFolder(folderFor(documentId))
  }
  async read(id: unknown): Promise<Uint8Array> {
    if (typeof id !== 'string' || !idPattern.test(id)) throw new Error('版本标识无效')
    const root = await lstat(this.directory)
    if (!root.isDirectory() || root.isSymbolicLink()) throw new Error('版本历史目录无效')
    const [folder] = id.split('/')
    if (!folder) throw new Error('版本标识无效')
    const parent = await lstat(join(this.directory, folder))
    const info = await lstat(join(this.directory, id))
    if (!parent.isDirectory() || parent.isSymbolicLink() || !info.isFile() || info.isSymbolicLink())
      throw new Error('版本文件无效')
    return readDocumentBytes(join(this.directory, id))
  }
}
