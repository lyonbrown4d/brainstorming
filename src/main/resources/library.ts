import { referencedAssetIds } from '@core/topic-content'
import { ResourceCatalog, type ResourceSource } from '@main/resources/catalog'
import { randomBytes, randomUUID } from 'node:crypto'
import { mkdir, rm } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { createReadStream } from 'node:fs'
import { createDocument, createWorkbook, validateDocumentAsset } from '@core'
import type { AssetPreview, DocumentAsset, MindMapWorkbook, Topic } from '@core'
import { safeAssetName } from '@assets'
import { prepareImage } from '@main/media'
import { fileObject } from '@main/resources/source'
import type { NativeDocuments } from '@main/document-db'
import type { NativeResourcePackage } from '@main/document-db'

export class ResourceLibrary {
  readonly token = randomBytes(24).toString('hex')
  private readonly password = randomBytes(32).toString('hex')
  private readonly sources = new ResourceCatalog()
  private readonly imported = new Map<string, NativeResourcePackage[]>()
  private readonly vaultAssets: Record<string, DocumentAsset> = {}
  private queue: Promise<void> = Promise.resolve()
  private disposal: Promise<void> | undefined
  private readonly vault: string
  private readonly directory: string
  constructor(
    storageDirectory: string,
    readonly documents: NativeDocuments,
  ) {
    this.directory = join(storageDirectory, `resource-session-${randomUUID()}`)
    this.vault = join(this.directory, 'resources.brainstorming')
  }
  register = (workbook: MindMapWorkbook, path: string, password?: string): void => {
    for (const sheet of workbook.sheets)
      for (const id of referencedAssetIds(sheet.document.topics)) {
        const asset = sheet.document.assets?.[id]
        if (!asset?.storage) continue
        const source = {
          path,
          ...(password ? { password } : {}),
          byteLength: asset.storage.byteLength,
          mimeType: asset.mimeType,
        }
        this.sources.set(asset.storage.objectId, source)
        if (asset.storage.preview)
          this.sources.set(asset.storage.preview.objectId, {
            ...source,
            byteLength: asset.storage.preview.byteLength,
            mimeType: asset.storage.preview.mimeType,
          })
      }
  }
  updatePassword = (path: string, password: string | null): void => {
    this.sources.updatePassword(path, password)
  }
  retirePath = (path: string): boolean => this.sources.retirePath(path)
  readObject = (id: string): AsyncIterable<Uint8Array> => {
    const source = this.sources.get(id)
    if (!source) throw new Error('资源未授权或所在文档已关闭')
    return this.documents.readObject(
      source.path,
      id,
      source.password ? { password: source.password } : {},
    )
  }
  source = (id: string): ResourceSource => {
    const source = this.sources.get(id)
    if (!source) throw new Error('资源不存在')
    return source
  }
  url = (asset: DocumentAsset, variant: 'original' | 'preview' = 'preview'): string => {
    validateDocumentAsset(asset)
    if (!asset.storage) return `data:${asset.mimeType};base64,${asset.data}`
    const id =
      variant === 'preview'
        ? (asset.storage.preview?.objectId ?? asset.storage.objectId)
        : asset.storage.objectId
    this.source(id)
    return `brainstorming-resource://${this.token}/object/${id}`
  }
  tileURL = (asset: DocumentAsset): string => {
    validateDocumentAsset(asset)
    if (!asset.storage?.tiles) throw new Error('图片没有瓦片')
    this.source(asset.storage.objectId)
    return `brainstorming-resource://${this.token}/tile/${asset.storage.objectId}`
  }
  packagesFor = async (workbook: MindMapWorkbook): Promise<NativeResourcePackage[]> => {
    const result = new Map<string, NativeResourcePackage>()
    for (const sheet of workbook.sheets)
      for (const id of referencedAssetIds(sheet.document.topics)) {
        const asset = sheet.document.assets?.[id]
        if (!asset?.storage || result.has(asset.storage.objectId)) continue
        const source = this.source(asset.storage.objectId)
        const packages =
          this.imported.get(asset.storage.objectId) ??
          (await this.documents.resourcePackages(
            source.path,
            asset.storage.objectId,
            source.password ? { password: source.password } : {},
          ))
        for (const item of packages)
          result.set(item.objectId, { ...item, read: () => this.readObject(item.objectId) })
        // Tile objects are authorized by the original resource and remain in the same document.
        for (const item of packages)
          this.sources.set(item.objectId, {
            ...source,
            byteLength: item.byteLength,
            mimeType:
              item.objectId === asset.storage.objectId
                ? asset.mimeType
                : item.objectId === asset.storage.preview?.objectId
                  ? asset.storage.preview.mimeType
                  : 'image/webp',
          })
      }
    return [...result.values()]
  }
  importFile = (
    path: string,
    kind: 'image' | 'attachment' | 'audio' = 'attachment',
  ): Promise<DocumentAsset> => {
    if (this.disposal) return Promise.reject(new Error('Resource library is disposed'))
    let resolveAsset: (asset: DocumentAsset) => void
    let rejectAsset: (error: unknown) => void
    const result = new Promise<DocumentAsset>((resolve, reject) => {
      resolveAsset = resolve
      rejectAsset = reject
    })
    const task = this.queue.then(async () => {
      try {
        resolveAsset(await this.importNow(path, kind))
      } catch (error) {
        rejectAsset(error)
      }
    })
    this.queue = task.catch(() => undefined)
    return result
  }
  private importNow = async (
    path: string,
    kind: 'image' | 'attachment' | 'audio',
  ): Promise<DocumentAsset> => {
    await mkdir(this.directory, { recursive: true, mode: 0o700 })
    const original = await fileObject(path)
    if (original.byteLength > 64 * 1024 ** 3) throw new Error('单个资源超过 64 GiB')
    const header: Buffer[] = []
    for await (const chunk of createReadStream(path, { start: 0, end: 4095 }))
      header.push(chunk as Buffer)
    const { sniffMedia } = await import('@main/resources/sniff')
    const mimeType = sniffMedia(Buffer.concat(header), kind === 'audio')
    if (kind === 'audio' && !mimeType.startsWith('audio/')) throw new Error('请选择支持的音频文件')
    const image =
      kind === 'image' || mimeType.startsWith('image/')
        ? await prepareImage(path, this.directory)
        : undefined
    try {
      const packages: NativeResourcePackage[] = [original]
      let preview: AssetPreview | undefined
      if (image) {
        const p = await fileObject(image.preview.path)
        preview = {
          objectId: p.objectId,
          byteLength: p.byteLength,
          mimeType: image.preview.mime,
          width: image.preview.width,
          height: image.preview.height,
        }
        packages.push(p)
        const tiles: { level: number; x: number; y: number; objectId: string }[] = []
        // Files are streamed and hashed one at a time to bound memory for huge images.
        for (const tile of image.tiles) {
          const object = await fileObject(tile.path)
          packages.push(object)
          tiles.push({ level: tile.level, x: tile.x, y: tile.y, objectId: object.objectId })
        }
        packages[0] = {
          ...original,
          preview: {
            objectId: p.objectId,
            mimeType: image.preview.mime,
            width: image.preview.width,
            height: image.preview.height,
          },
          tiles,
        }
      }
      const asset: DocumentAsset = {
        id: randomUUID(),
        name: safeAssetName(basename(path)),
        mimeType,
        storage: {
          objectId: original.objectId,
          byteLength: original.byteLength,
          ...(image
            ? { width: image.manifest.width, height: image.manifest.height, tiles: image.manifest }
            : {}),
          ...(preview ? { preview } : {}),
        },
      }
      const stagedAssets = { ...this.vaultAssets, [asset.id]: asset }
      const base = createDocument('Resources', 'resource-vault')
      const topics: Record<string, Topic> = { ...base.topics }
      topics[base.rootId] = {
        id: base.rootId,
        title: 'Resources',
        side: 'right',
        collapsed: false,
        children: Object.keys(stagedAssets),
      }
      for (const id of Object.keys(stagedAssets))
        topics[id] = {
          id,
          title: '',
          side: 'right',
          collapsed: false,
          children: [],
          attachments: [id],
        }
      const workbook = createWorkbook({ ...base, topics, assets: stagedAssets })
      try {
        await this.documents.write(this.vault, workbook, {
          password: this.password,
          resources: packages,
          source: this,
        })
      } catch (error) {
        if (Object.keys(this.vaultAssets).length === 0) {
          await this.documents.release(this.vault)
          await rm(this.vault, { force: true })
        }
        throw error
      }
      this.vaultAssets[asset.id] = asset
      this.register(workbook, this.vault, this.password)
      const savedPackages = packages.map((item) => ({
        ...item,
        read: () => this.readObject(item.objectId),
      }))
      this.imported.set(original.objectId, savedPackages)
      for (const item of packages)
        this.sources.set(item.objectId, {
          path: this.vault,
          password: this.password,
          byteLength: item.byteLength,
          mimeType: item.objectId === original.objectId ? mimeType : 'image/webp',
        })
      return asset
    } finally {
      if (image) await rm(image.directory, { recursive: true, force: true })
    }
  }
  dispose = (): Promise<void> => {
    this.disposal ??= (async () => {
      await this.queue
      try {
        await this.documents.release(this.vault)
      } finally {
        this.sources.clear()
        this.imported.clear()
        await rm(this.directory, { recursive: true, force: true })
      }
    })()
    return this.disposal
  }
}
