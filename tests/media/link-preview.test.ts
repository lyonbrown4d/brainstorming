import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { DocumentAsset } from '@core'
import { LinkPreviewQueue, normalizePreviewURL } from '@main/media/linkPreview'
import {
  allowPublicPreviewURL,
  isPublicPreviewAddress,
  resolvePublicPreviewAddress,
} from '@main/media/linkPreviewPolicy'

const deferred = () => {
  let resolve = () => {
    /* Replaced synchronously by the Promise executor. */
  }
  const promise = new Promise<void>((ready) => {
    resolve = ready
  })
  return { promise, resolve }
}

let directory: string
let queue: LinkPreviewQueue | undefined
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'brainstorming-link-preview-'))
})
afterEach(async () => {
  await queue?.dispose()
  queue = undefined
  await rm(directory, { recursive: true, force: true })
})

const image: DocumentAsset = {
  id: 'test-image',
  name: 'preview.png',
  mimeType: 'image/png',
  data: 'data:image/png;base64,AQ==',
}

describe('link preview queue', () => {
  it('serializes captures, deduplicates normalized URLs, caches results, and cleans temporary files', async () => {
    const entered = deferred()
    const release = deferred()
    let active = 0
    let maximum = 0
    const captured: string[] = []
    const ready: string[] = []
    queue = new LinkPreviewQueue({
      directory,
      capture: async (url, path) => {
        active += 1
        maximum = Math.max(maximum, active)
        captured.push(url)
        if (captured.length === 1) {
          entered.resolve()
          await release.promise
        }
        await writeFile(path, 'preview pixels')
        active -= 1
      },
      importImage: async (path) => {
        expect(await readFile(path, 'utf8')).toBe('preview pixels')
        return image
      },
      onReady: (url) => {
        ready.push(url)
      },
    })
    const first = queue.generate('https://example.com/page#fragment')
    expect(queue.generate('https://example.com/page')).toBe(first)
    const second = queue.generate('https://example.org/')
    await entered.promise
    expect(captured).toEqual(['https://example.com/page'])
    release.resolve()
    expect(await Promise.all([first, second])).toEqual([image, image])
    expect(maximum).toBe(1)
    expect(ready).toEqual(['https://example.com/page', 'https://example.org/'])
    expect(queue.get('https://example.com/page#other')).toBe(image)
    expect(await queue.generate('https://example.com/page')).toBe(image)
    expect(captured).toHaveLength(2)
    expect(await readdir(directory)).toEqual([])
  })

  it('contains background failures, suppresses automatic retries, and permits explicit retry', async () => {
    const captures: string[] = []
    let fail = true
    queue = new LinkPreviewQueue({
      directory,
      capture: async (url, path) => {
        captures.push(url)
        if (fail) throw new Error('Sensitive URL query must not propagate')
        await writeFile(path, 'image')
      },
      importImage: () => Promise.resolve(image),
    })
    queue.enqueue(['https://example.com/?token=secret'])
    await expect(queue.generate('https://example.com/?token=secret')).rejects.toThrow(
      'Link preview could not be generated',
    )
    queue.enqueue(['https://example.com/?token=secret'])
    fail = false
    await queue.generate('https://example.org/')
    expect(captures).toHaveLength(2)
    expect(await queue.generate('https://example.com/?token=secret')).toBe(image)
    expect(captures).toHaveLength(3)
    expect(await readdir(directory)).toEqual([])
  })

  it('aborts the active capture, skips queued captures, and waits for owned-file cleanup on disposal', async () => {
    const entered = deferred()
    let captures = 0
    let imported = false
    queue = new LinkPreviewQueue({
      directory,
      capture: async (_url, path, signal) => {
        captures += 1
        await writeFile(path, 'partial')
        entered.resolve()
        await new Promise<void>((_resolve, reject) => {
          signal.addEventListener(
            'abort',
            () => {
              reject(new Error('cancelled'))
            },
            { once: true },
          )
        })
      },
      importImage: () => {
        imported = true
        return Promise.resolve(image)
      },
    })
    const first = queue.generate('https://example.com/')
    const second = queue.generate('https://example.org/')
    const settled = Promise.allSettled([first, second])
    await entered.promise
    await queue.dispose()
    expect((await settled).every((result) => result.status === 'rejected')).toBe(true)
    expect(captures).toBe(1)
    expect(imported).toBe(false)
    expect(queue.get('https://example.com/')).toBeNull()
    expect(await readdir(directory)).toEqual([])
    await expect(queue.generate('https://example.net/')).rejects.toThrow('unavailable')
  })

  it('bounds pending work to 1000 URLs without creating simultaneous captures', async () => {
    const entered = deferred()
    queue = new LinkPreviewQueue({
      directory,
      capture: async (_url, _path, signal) => {
        entered.resolve()
        await new Promise<void>((_resolve, reject) => {
          signal.addEventListener(
            'abort',
            () => {
              reject(new Error('cancelled'))
            },
            { once: true },
          )
        })
      },
      importImage: () => Promise.resolve(image),
    })
    queue.enqueue(Array.from({ length: 1100 }, (_, index) => `https://example.com/${index}`))
    await entered.promise
    await expect(queue.generate('https://example.org/overflow')).rejects.toThrow('queue is full')
    await queue.dispose()
    expect(await readdir(directory)).toEqual([])
  })

  it('reconciles open-document URLs while retaining explicit manual work and cached images', async () => {
    const entered = deferred()
    const completed = deferred()
    const captures: string[] = []
    queue = new LinkPreviewQueue({
      directory,
      capture: async (url, path, signal) => {
        captures.push(url)
        if (url.endsWith('/active')) {
          entered.resolve()
          await new Promise<void>((_resolve, reject) => {
            signal.addEventListener(
              'abort',
              () => {
                reject(new Error('cancelled'))
              },
              { once: true },
            )
          })
        }
        await writeFile(path, 'image')
      },
      importImage: () => Promise.resolve(image),
      onReady: (url) => {
        if (url.endsWith('/new')) completed.resolve()
      },
    })
    queue.setURLs(['https://example.com/active', 'https://example.com/removed'])
    const manual = queue.generate('https://example.com/manual')
    await entered.promise
    queue.setURLs(['https://example.com/new'])
    expect(await manual).toBe(image)
    await completed.promise
    expect(captures).toEqual([
      'https://example.com/active',
      'https://example.com/manual',
      'https://example.com/new',
    ])
    queue.setURLs([])
    expect(queue.get('https://example.com/new')).toBe(image)
    expect(queue.get('https://example.com/active')).toBeNull()
  })

  it.each([false, true])('contains observer failures when capture failure is %s', async (fail) => {
    queue = new LinkPreviewQueue({
      directory,
      capture: (_url, path) =>
        fail ? Promise.reject(new Error('capture failed')) : writeFile(path, 'image'),
      importImage: () => Promise.resolve(image),
      onReady: () => {
        throw new Error('consumer failure')
      },
    })
    if (fail) {
      await expect(queue.generate('https://example.com/')).rejects.toThrow(
        'Link preview could not be generated',
      )
      expect(() => queue?.get('https://example.com/')).toThrow(
        'Link preview could not be generated',
      )
    } else {
      expect(await queue.generate('https://example.com/')).toBe(image)
      expect(queue.get('https://example.com/')).toBe(image)
    }
  })
})

describe('link preview public-network policy', () => {
  it('normalizes HTTP(S) and refuses credentials or local application schemes', () => {
    expect(normalizePreviewURL('https://EXAMPLE.com:443/a#fragment')).toBe('https://example.com/a')
    for (const value of [
      'file:///tmp/a',
      'data:text/html,a',
      'brainstorming-resource://a',
      'ftp://example.com',
      'https://user:password@example.com',
    ]) {
      expect(normalizePreviewURL(value)).toBeNull()
    }
  })

  it.each([
    '127.0.0.1',
    '10.0.0.1',
    '172.16.0.1',
    '192.168.0.1',
    '169.254.169.254',
    '0.0.0.0',
    '224.0.0.1',
    '::1',
    '::',
    'fc00::1',
    'fe80::1',
    'ff02::1',
    '::ffff:127.0.0.1',
  ])('blocks non-public target %s', async (address) => {
    expect(isPublicPreviewAddress(address)).toBe(false)
    await expect(resolvePublicPreviewAddress(address)).rejects.toThrow('public network')
  })

  it('allows globally routable addresses and denies private IP URLs without external DNS', async () => {
    expect(isPublicPreviewAddress('1.1.1.1')).toBe(true)
    expect(isPublicPreviewAddress('2606:4700:4700::1111')).toBe(true)
    expect(await allowPublicPreviewURL('http://127.0.0.1/')).toBe(false)
    expect(await allowPublicPreviewURL('file:///etc/passwd')).toBe(false)
    expect(await allowPublicPreviewURL('https://1.1.1.1/')).toBe(true)
  })
})
