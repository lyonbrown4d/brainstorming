import { extname, isAbsolute } from 'node:path'
import type { IPCRegistry } from '@main/application/ipcRegistry'
import type { WindowSession } from '@main/application/session'
import type { ResourceLibrary } from '@main/resources/library'
import type { LinkPreviewQueue } from '@main/media/linkPreview'
import type { DocumentFiles } from '@main/files'
import type { DroppedFilesResult, OpenedDocument } from '@shared/contracts'
import type { DocumentAsset } from '@core'

const pathsInput = (input: unknown): readonly string[] => {
  if (
    !Array.isArray(input) ||
    input.length === 0 ||
    input.length > 32 ||
    input.some(
      (path: unknown) =>
        typeof path !== 'string' || !isAbsolute(path) || path.length > 32768 || path.includes('\0'),
    )
  )
    throw new Error('拖入的文件路径无效，最多支持 32 个文件')
  return [...new Set(input as string[])]
}
const urlInput = (input: unknown): string => {
  if (typeof input !== 'string' || input.length === 0 || input.length > 2048)
    throw new Error('网页地址无效')
  let url: URL
  try {
    url = new URL(input)
  } catch {
    throw new Error('网页地址无效')
  }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password)
    throw new Error('仅支持 HTTP 或 HTTPS 网页地址')
  return input
}

/** Renderer capabilities are bound to the trusted main frame, never arbitrary IPC senders. */
export class ResourceBridge {
  constructor(
    private readonly library: ResourceLibrary,
    private readonly previews: LinkPreviewQueue,
    private readonly files: DocumentFiles,
  ) {}
  register = (ipc: IPCRegistry, session: WindowSession): void => {
    ipc.on('resource:origin', (event) => {
      try {
        session.trusted(event)
        event.returnValue = `brainstorming-resource://${this.library.token}`
      } catch {
        event.returnValue = ''
      }
    })
    ipc.handle('resource:drop', async (event, input: unknown): Promise<DroppedFilesResult> => {
      session.trusted(event)
      const paths = pathsInput(input)
      const documents: OpenedDocument[] = []
      const assets: DocumentAsset[] = []
      try {
        // Native imports are sequential: each may hash, tile, or unlock a large file.
        for (const path of paths) {
          if (['.brainstorming', '.xmind'].includes(extname(path).toLowerCase()))
            documents.push(await this.files.openSelected(path))
          else assets.push(await this.library.importFile(path))
        }
      } catch (error) {
        for (const document of documents)
          if (document.lockedToken) this.files.cancelUnlock(document.lockedToken)
        throw error
      }
      return { documents, assets }
    })
    ipc.handle('resource:link:queue', (event, input: unknown) => {
      session.trusted(event)
      if (!Array.isArray(input) || input.length > 1000)
        throw new Error('网页预览队列无效，最多支持 1000 个地址')
      this.previews.setURLs([...new Set(input.map(urlInput))])
    })
    ipc.handle('resource:link:get', (event, input: unknown) => {
      session.trusted(event)
      return this.previews.get(urlInput(input))
    })
    ipc.handle('resource:link:generate', (event, input: unknown) => {
      session.trusted(event)
      return this.previews.generate(urlInput(input))
    })
    ipc.handle('document:release', (event, input: unknown) => {
      session.trusted(event)
      if (
        typeof input !== 'string' ||
        !isAbsolute(input) ||
        input.length > 32768 ||
        input.includes('\0')
      )
        throw new Error('文档路径无效')
      return this.files.releaseDocument(input)
    })
  }
}
