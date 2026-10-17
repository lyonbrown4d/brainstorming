import { Readable } from 'node:stream'
import { protocol } from 'electron'
import parseRange from 'range-parser'
import type { ResourceLibrary } from '@main/resources/library'
import type { NativeDocuments } from '@main/document-db'

export interface ResourceResponseLibrary {
  readonly appOrigin?: string
  readonly token: string
  readonly source: ResourceLibrary['source']
  readonly documents: Pick<NativeDocuments, 'readObject' | 'imageTile' | 'objectInfo'>
}
const objectPattern = /^\/object\/([a-f0-9]{64})$/u
const tilePattern = /^\/tile\/([a-f0-9]{64})\/(0|[1-9]\d*)\/(0|[1-9]\d*)\/(0|[1-9]\d*)$/u
const allowedMimeTypes = new Set([
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'audio/mpeg',
  'audio/wav',
  'audio/ogg',
  'audio/webm',
  'audio/mp4',
  'audio/aac',
  'audio/flac',
  'video/mp4',
  'video/webm',
  'application/pdf',
])
const responseHeaders = (origin?: string): Headers =>
  new Headers({
    ...(origin
      ? {
          'Access-Control-Allow-Origin': origin,
          'Access-Control-Expose-Headers': 'Content-Range, Accept-Ranges, Content-Length',
          Vary: 'Origin',
        }
      : {}),
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': "default-src 'none'; sandbox",
  })
const failure = (status: number, headers = responseHeaders()): Response =>
  new Response(null, { status, headers })

/** The unguessable session origin and registered object hash authorize every resource read. */
export const createResourceResponse = async (
  request: Request,
  library: ResourceResponseLibrary,
): Promise<Response> => {
  const origin = request.headers.get('Origin')
  const appOrigin = library.appOrigin ?? 'null'
  const headers = responseHeaders(origin === appOrigin ? origin : undefined)
  if (origin && origin !== appOrigin) return failure(403, headers)
  let url: URL
  try {
    url = new URL(request.url)
  } catch {
    return failure(404, headers)
  }
  if (
    url.protocol !== 'brainstorming-resource:' ||
    url.host !== library.token ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  )
    return failure(404, headers)
  if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
    headers.set('Allow', 'GET, HEAD, OPTIONS')
    return failure(405, headers)
  }
  const object = objectPattern.exec(url.pathname)
  const tile = tilePattern.exec(url.pathname)
  const originalId = object?.[1] ?? tile?.[1]
  if (!originalId) return failure(404, headers)
  let source: ReturnType<ResourceLibrary['source']>
  try {
    source = library.source(originalId)
  } catch {
    return failure(404, headers)
  }
  if (request.method === 'OPTIONS') {
    const method = request.headers.get('Access-Control-Request-Method')
    const requestedHeaders = (request.headers.get('Access-Control-Request-Headers') ?? '')
      .split(',')
      .map((name) => name.trim().toLowerCase())
      .filter(Boolean)
    if (
      (method && !['GET', 'HEAD'].includes(method)) ||
      requestedHeaders.some((name) => name !== 'range')
    ) {
      return failure(403, headers)
    }
    headers.set('Access-Control-Allow-Methods', 'GET, HEAD')
    headers.set('Access-Control-Allow-Headers', 'Range')
    return new Response(null, { status: 204, headers })
  }
  try {
    let objectId = originalId
    let byteLength = source.byteLength
    let mimeType = source.mimeType
    const options = source.password ? { password: source.password } : {}
    if (tile) {
      const coordinates = tile.slice(2).map(Number)
      if (coordinates.some((value) => !Number.isSafeInteger(value))) return failure(404, headers)
      const [level, x, y] = coordinates as [number, number, number]
      const tileId = await library.documents.imageTile(
        source.path,
        originalId,
        level,
        x,
        y,
        options,
      )
      if (!tileId) return failure(404, headers)
      const info = await library.documents.objectInfo(source.path, tileId, options)
      if (!info) return failure(404, headers)
      objectId = tileId
      byteLength = info.byteLength
      mimeType = 'image/webp'
    }
    if (!Number.isSafeInteger(byteLength) || byteLength < 0) return failure(500, headers)
    headers.set(
      'Content-Type',
      allowedMimeTypes.has(mimeType) ? mimeType : 'application/octet-stream',
    )
    if (!allowedMimeTypes.has(mimeType)) headers.set('Content-Disposition', 'attachment')
    let offset = 0
    let length = byteLength
    let status = 200
    const rangeHeader = request.method === 'GET' ? request.headers.get('Range') : null
    if (rangeHeader) {
      const ranges = parseRange(byteLength, rangeHeader, { combine: true })
      if (ranges === -2) return failure(400, headers)
      if (ranges === -1 || ranges.type !== 'bytes' || ranges.length !== 1) {
        headers.set('Content-Range', `bytes */${byteLength}`)
        return failure(416, headers)
      }
      const range = ranges[0]
      if (!range) return failure(416, headers)
      offset = range.start
      length = range.end - range.start + 1
      headers.set('Content-Range', `bytes ${range.start}-${range.end}/${byteLength}`)
      status = 206
    }
    headers.set('Content-Length', String(length))
    if (request.method === 'HEAD' || length === 0) return new Response(null, { status, headers })
    const stream = Readable.from(
      library.documents.readObject(source.path, objectId, {
        ...options,
        offset,
        length,
      }),
      { objectMode: false, highWaterMark: 64 * 1024 },
    )
    const abort = (): void => {
      stream.destroy(new Error('Resource request aborted'))
    }
    request.signal.addEventListener('abort', abort, { once: true })
    stream.once('close', () => {
      request.signal.removeEventListener('abort', abort)
    })
    if (request.signal.aborted) abort()
    const body = Readable.toWeb(stream, {
      strategy: { highWaterMark: 64 * 1024, size: (chunk: Uint8Array) => chunk.byteLength },
    }) as ReadableStream<Uint8Array>
    return new Response(body, { status, headers })
  } catch {
    return failure(500, headers)
  }
}

/** Registered on Electron's default session only; isolated webpage capture sessions have no handler. */
export class ResourceProtocol {
  private registered = false
  constructor(
    private readonly library: ResourceLibrary,
    private readonly appOrigin = 'null',
  ) {}
  register = (): void => {
    if (this.registered) return
    protocol.handle('brainstorming-resource', (request) =>
      createResourceResponse(request, {
        token: this.library.token,
        source: this.library.source,
        documents: this.library.documents,
        appOrigin: this.appOrigin,
      }),
    )
    this.registered = true
  }
  dispose = (): void => {
    if (!this.registered) return
    protocol.unhandle('brainstorming-resource')
    this.registered = false
  }
}
