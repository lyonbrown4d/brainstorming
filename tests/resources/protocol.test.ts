import { describe, expect, it, vi } from 'vitest'
import { createResourceResponse, type ResourceResponseLibrary } from '@main/resources/protocol'

vi.mock('electron', () => ({ protocol: { handle: vi.fn(), unhandle: vi.fn() } }))
const objectId = 'a'.repeat(64)
const tileId = 'b'.repeat(64)
const token = 'c'.repeat(48)
const bytes = new TextEncoder().encode('0123456789ab')
const origin = `brainstorming-resource://${token}`

const fixture = () => {
  const readObject = vi.fn(
    (
      _path: string,
      id: string,
      options: { offset?: number; length?: number; password?: string } = {},
    ) => ({
      [Symbol.asyncIterator]: () => {
        let ended = false
        return {
          next: (): Promise<IteratorResult<Uint8Array>> => {
            if (ended) return Promise.resolve({ done: true, value: undefined })
            ended = true
            const payload = id === tileId ? bytes.subarray(0, 4) : bytes
            const offset = options.offset ?? 0
            return Promise.resolve({
              done: false,
              value: payload.subarray(offset, offset + (options.length ?? payload.length)),
            })
          },
        }
      },
    }),
  )
  const imageTile = vi.fn(() => Promise.resolve(tileId))
  const objectInfo = vi.fn(() => Promise.resolve({ byteLength: 4 }))
  const source = vi.fn((id: string) => {
    if (id !== objectId) throw new Error('Unknown object')
    return {
      path: '/private/document.brainstorming',
      password: 'memory-only',
      byteLength: bytes.length,
      mimeType: 'audio/mpeg',
    }
  })
  const library: ResourceResponseLibrary = {
    token,
    source,
    documents: { readObject, imageTile, objectInfo },
  }
  return { library, source, readObject, imageTile, objectInfo }
}
const request = (path = `/object/${objectId}`, options: RequestInit = {}) =>
  new Request(`${origin}${path}`, options)
const content = async (response: Response): Promise<string> =>
  new TextDecoder().decode(await response.arrayBuffer())

describe('session resource streaming protocol', () => {
  it('streams an authorized object with private content headers and a password-scoped read', async () => {
    const { library, readObject } = fixture()
    const response = await createResourceResponse(request(), library)
    expect(response.status).toBe(200)
    expect(response.headers.get('Content-Length')).toBe('12')
    expect(response.headers.get('Content-Type')).toBe('audio/mpeg')
    expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff')
    expect(response.headers.get('Content-Security-Policy')).toContain('sandbox')
    expect(response.headers.get('Cache-Control')).toBe('private, no-store')
    expect(await content(response)).toBe('0123456789ab')
    expect(readObject).toHaveBeenCalledWith('/private/document.brainstorming', objectId, {
      password: 'memory-only',
      offset: 0,
      length: 12,
    })
  })

  it.each([
    ['bytes=2-5', '2345', 'bytes 2-5/12', 2, 4],
    ['bytes=9-', '9ab', 'bytes 9-11/12', 9, 3],
    ['bytes=-3', '9ab', 'bytes 9-11/12', 9, 3],
    ['bytes=10-100', 'ab', 'bytes 10-11/12', 10, 2],
  ])(
    'honors %s without reading bytes outside the selected interval',
    async (range, expected, description, offset, length) => {
      const { library, readObject } = fixture()
      const response = await createResourceResponse(
        request(undefined, { headers: { Range: range } }),
        library,
      )
      expect(response.status).toBe(206)
      expect(response.headers.get('Content-Range')).toBe(description)
      expect(response.headers.get('Content-Length')).toBe(String(length))
      expect(await content(response)).toBe(expected)
      expect(readObject).toHaveBeenCalledWith(expect.any(String), objectId, {
        password: 'memory-only',
        offset,
        length,
      })
    },
  )

  it('answers HEAD without creating a stream and rejects unsatisfiable or multipart ranges', async () => {
    const { library, readObject } = fixture()
    const head = await createResourceResponse(
      request(undefined, { method: 'HEAD', headers: { Range: 'bytes=2-3' } }),
      library,
    )
    expect(head.status).toBe(200)
    expect(head.headers.get('Content-Length')).toBe('12')
    expect(await head.text()).toBe('')
    for (const range of ['bytes=20-30', 'bytes=0-1,5-6']) {
      const response = await createResourceResponse(
        request(undefined, { headers: { Range: range } }),
        library,
      )
      expect(response.status).toBe(416)
      expect(response.headers.get('Content-Range')).toBe('bytes */12')
    }
    expect(readObject).not.toHaveBeenCalled()
  })

  it('rejects a wrong origin, unknown hash, unsafe path and unsupported method before reading', async () => {
    const { library, readObject } = fixture()
    for (const url of [
      `brainstorming-resource://wrong/object/${objectId}`,
      `${origin}/object/${tileId}`,
      `${origin}/object/../../private`,
      `${origin}/object/${objectId}?secret=1`,
    ])
      expect((await createResourceResponse(new Request(url), library)).status).toBe(404)
    const unsupported = await createResourceResponse(
      request(undefined, { method: 'POST' }),
      library,
    )
    expect(unsupported.status).toBe(405)
    expect(unsupported.headers.get('Allow')).toBe('GET, HEAD, OPTIONS')
    expect(readObject).not.toHaveBeenCalled()
  })

  it.each(['null', 'http://localhost:5173'])(
    'allows range fetch only from configured app origin %s',
    async (origin) => {
      const { library, readObject } = fixture()
      const allowed = await createResourceResponse(
        request(undefined, {
          headers: { Origin: origin, Range: 'bytes=0-3' },
        }),
        { ...library, appOrigin: origin },
      )
      expect(allowed.status).toBe(206)
      expect(allowed.headers.get('Access-Control-Allow-Origin')).toBe(origin)
      expect(allowed.headers.get('Access-Control-Expose-Headers')).toContain('Content-Range')
      expect(await content(allowed)).toBe('0123')
      readObject.mockClear()
      const blocked = await createResourceResponse(
        request(undefined, {
          headers: { Origin: 'https://untrusted.example' },
        }),
        { ...library, appOrigin: origin },
      )
      expect(blocked.status).toBe(403)
      expect(blocked.headers.has('Access-Control-Allow-Origin')).toBe(false)
      expect(readObject).not.toHaveBeenCalled()
    },
  )

  it('authorizes Range preflight without opening a stream and rejects extra request capabilities', async () => {
    const { library, readObject } = fixture()
    const preflight = await createResourceResponse(
      request(undefined, {
        method: 'OPTIONS',
        headers: {
          Origin: 'null',
          'Access-Control-Request-Method': 'GET',
          'Access-Control-Request-Headers': 'range',
        },
      }),
      library,
    )
    expect(preflight.status).toBe(204)
    expect(preflight.headers.get('Access-Control-Allow-Origin')).toBe('null')
    expect(preflight.headers.get('Access-Control-Allow-Methods')).toBe('GET, HEAD')
    expect(preflight.headers.get('Access-Control-Allow-Headers')).toBe('Range')
    const blocked = await createResourceResponse(
      request(undefined, {
        method: 'OPTIONS',
        headers: {
          Origin: 'null',
          'Access-Control-Request-Method': 'POST',
          'Access-Control-Request-Headers': 'authorization',
        },
      }),
      library,
    )
    expect(blocked.status).toBe(403)
    expect(readObject).not.toHaveBeenCalled()
  })

  it('resolves tiles only through an authorized original and reads tile bytes from that same document', async () => {
    const { library, imageTile, objectInfo, readObject } = fixture()
    const response = await createResourceResponse(request(`/tile/${objectId}/3/1/2`), library)
    expect(response.status).toBe(200)
    expect(response.headers.get('Content-Type')).toBe('image/webp')
    expect(response.headers.get('Content-Length')).toBe('4')
    expect(await content(response)).toBe('0123')
    expect(imageTile).toHaveBeenCalledWith('/private/document.brainstorming', objectId, 3, 1, 2, {
      password: 'memory-only',
    })
    expect(objectInfo).toHaveBeenCalledWith('/private/document.brainstorming', tileId, {
      password: 'memory-only',
    })
    expect(readObject).toHaveBeenCalledWith('/private/document.brainstorming', tileId, {
      password: 'memory-only',
      offset: 0,
      length: 4,
    })
  })

  it('forces executable attachment MIME types to download as opaque bytes', async () => {
    const { library } = fixture()
    const opaque = {
      ...library,
      source: () => ({ path: '/private/document', byteLength: 12, mimeType: 'text/html' }),
    }
    const response = await createResourceResponse(request(), opaque)
    expect(response.headers.get('Content-Type')).toBe('application/octet-stream')
    expect(response.headers.get('Content-Disposition')).toBe('attachment')
    expect(await content(response)).toBe('0123456789ab')
  })

  it('bounds stream prefetch and releases the iterator when the consumer cancels', async () => {
    const { library } = fixture()
    let produced = 0
    let cancelled = false
    library.documents.readObject = () => ({
      [Symbol.asyncIterator]: () => ({
        next: (): Promise<IteratorResult<Uint8Array>> => {
          produced += 1
          return Promise.resolve(
            produced <= 1000
              ? { done: false, value: new Uint8Array(64 * 1024) }
              : { done: true, value: undefined },
          )
        },
        return: (): Promise<IteratorResult<Uint8Array>> => {
          cancelled = true
          return Promise.resolve({ done: true, value: undefined })
        },
      }),
    })
    const response = await createResourceResponse(request(), library)
    const reader = response.body?.getReader()
    if (!reader) throw new Error('Missing resource stream')
    expect((await reader.read()).value?.byteLength).toBe(64 * 1024)
    await reader.cancel()
    await vi.waitFor(() => {
      expect(cancelled).toBe(true)
    })
    expect(produced).toBeLessThanOrEqual(4)
  })
})
