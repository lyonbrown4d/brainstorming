import { createHash } from 'node:crypto'
import { serializeWorkbook } from '@core'
import { NativeDocuments } from '@main/document-db'
import type { ResourceLibrary } from '@main/resources/library'
import type { OpenedDocument } from '@shared/contracts'
import type { DocumentBackup } from '@shared/fileSecurity'
import { validateSecurityDocumentId } from '@shared/fileSecurity'

const folderFor = (documentId: unknown): string => {
  validateSecurityDocumentId(documentId)
  return createHash('sha256').update(documentId).digest('hex').slice(0, 32)
}
const idPattern = /^[a-f0-9]{32}\/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/u
interface DocumentSource {
  readonly documentId: string
  readonly path: string
  password: string | null
}
/** Version metadata and shared immutable objects live inside each native document. */
export class DocumentBackups {
  private readonly sources = new Map<string, DocumentSource>()
  constructor(
    _directory: string,
    private readonly native = new NativeDocuments(),
    private readonly resources?: ResourceLibrary,
  ) {}
  register = (documentId: string, path: string, password: string | null): void => {
    this.sources.set(folderFor(documentId), { documentId, path, password })
  }
  write = (documentId: string, path: string, encrypted: boolean): Promise<void> => {
    const previous = this.sources.get(folderFor(documentId))
    this.register(documentId, path, encrypted ? (previous?.password ?? null) : null)
    return Promise.resolve()
  }
  list = async (documentId: unknown): Promise<DocumentBackup[]> => {
    const folder = folderFor(documentId)
    const source = this.sources.get(folder)
    if (!source) return []
    const entries = await this.native.listRevisions(
      source.path,
      source.password ? { password: source.password } : {},
    )
    return entries.map(({ id, createdAt }) => ({
      id: `${folder}/${id}`,
      createdAt: Date.parse(createdAt),
      size: 0,
      encrypted: source.password !== null,
    }))
  }
  read = async (id: unknown): Promise<OpenedDocument> => {
    if (typeof id !== 'string' || !idPattern.test(id)) throw new Error('版本标识无效')
    const [folder, revision] = id.split('/')
    const source = folder ? this.sources.get(folder) : undefined
    if (!source || !revision) throw new Error('版本文档尚未打开，请先打开原生文件')
    const workbook = await this.native.readRevision(
      source.path,
      revision,
      source.password ? { password: source.password } : {},
    )
    if (workbook.id !== source.documentId) throw new Error('版本文件与文档不一致')
    this.resources?.register(workbook, source.path, source.password ?? undefined)
    return {
      path: null,
      contents: serializeWorkbook(workbook),
      encrypted: source.password !== null,
    }
  }
  protect = async (documentId: string, password: string | null): Promise<void> => {
    const source = this.sources.get(folderFor(documentId))
    if (!source || source.password === password) return
    await this.native.rekey(source.path, source.password, password)
    source.password = password
    this.resources?.updatePassword(source.path, password)
  }
}
