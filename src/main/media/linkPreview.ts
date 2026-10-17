import PQueue from 'p-queue'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import type { DocumentAsset } from '@core'
import { captureLinkPreview, type LinkPreviewCapture } from '@main/media/captureLinkPreview'
import {
  allowPublicPreviewURL,
  normalizePreviewURL,
  type PreviewURLPolicy,
} from '@main/media/linkPreviewPolicy'

export interface LinkPreviewQueueOptions {
  directory: string
  importImage: (path: string) => Promise<DocumentAsset>
  onReady?: (url: string) => void
  allowURL?: PreviewURLPolicy
  capture?: LinkPreviewCapture
}

interface PendingPreview {
  promise: Promise<DocumentAsset>
  controller: AbortController
  manual: boolean
}

const MAX_PREVIEW_ITEMS = 1000

export class LinkPreviewQueue {
  private readonly queue = new PQueue({ concurrency: 1 })
  private readonly pending = new Map<string, PendingPreview>()
  private readonly cache = new Map<string, DocumentAsset>()
  private readonly failures = new Set<string>()
  private disposed = false
  private desired = new Set<string>()
  private readonly options: LinkPreviewQueueOptions

  constructor(options: LinkPreviewQueueOptions) {
    this.options = options
  }

  get = (url: string): DocumentAsset | null => {
    const normalized = normalizePreviewURL(url)
    if (normalized && this.failures.has(normalized))
      throw new Error('Link preview could not be generated')
    return normalized ? (this.cache.get(normalized) ?? null) : null
  }

  enqueue = (urls: readonly string[]): void => {
    if (this.disposed) return
    for (const url of urls) {
      const normalized = normalizePreviewURL(url)
      if (!normalized || this.failures.has(normalized)) continue
      if (this.pending.size >= MAX_PREVIEW_ITEMS) break
      void this.schedule(normalized, false).catch(() => {
        /* Background failures stay local to this URL. */
      })
    }
  }

  setURLs = (urls: readonly string[]): void => {
    if (this.disposed) return
    this.desired = new Set(
      urls
        .flatMap((url) => {
          const normalized = normalizePreviewURL(url)
          return normalized ? [normalized] : []
        })
        .slice(0, MAX_PREVIEW_ITEMS),
    )
    const removed = [...this.pending.entries()].filter(
      ([url, pending]) => !pending.manual && !this.desired.has(url),
    )
    for (const [, pending] of removed) pending.controller.abort()
    this.enqueue([...this.desired])
    // Refill once cancelled queued entries release capacity; the desired set may change meanwhile.
    if (removed.length)
      void Promise.allSettled(removed.map(([, pending]) => pending.promise)).then(() => {
        if (!this.disposed) this.enqueue([...this.desired])
      })
  }

  generate = (url: string): Promise<DocumentAsset> => this.schedule(url, true)

  private schedule = (url: string, manual: boolean): Promise<DocumentAsset> => {
    const normalized = normalizePreviewURL(url)
    if (!normalized || this.disposed)
      return Promise.reject(new Error('Link preview is unavailable'))
    const cached = this.cache.get(normalized)
    if (cached) return Promise.resolve(cached)
    const pending = this.pending.get(normalized)
    if (pending) {
      pending.manual ||= manual
      return pending.promise
    }
    if (this.pending.size >= MAX_PREVIEW_ITEMS)
      return Promise.reject(new Error('Link preview queue is full'))
    this.failures.delete(normalized)
    const controller = new AbortController()
    const promise = this.queue
      .add(async () => {
        controller.signal.throwIfAborted()
        await mkdir(this.options.directory, { recursive: true })
        const directory = await mkdtemp(join(this.options.directory, 'link-preview-'))
        try {
          const path = join(directory, 'preview.png')
          await (this.options.capture ?? captureLinkPreview)(
            normalized,
            path,
            controller.signal,
            this.options.allowURL ?? allowPublicPreviewURL,
          )
          controller.signal.throwIfAborted()
          const asset = await this.options.importImage(path)
          controller.signal.throwIfAborted()
          this.cache.set(normalized, asset)
          if (this.cache.size > MAX_PREVIEW_ITEMS) {
            const oldest = this.cache.keys().next().value
            if (oldest) this.cache.delete(oldest)
          }
          try {
            this.options.onReady?.(normalized)
          } catch {
            /* Consumer callbacks cannot stop the queue. */
          }
          return asset
        } finally {
          await rm(directory, { recursive: true, force: true })
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) this.failures.add(normalized)
        if (this.failures.size > MAX_PREVIEW_ITEMS) {
          const oldest = this.failures.values().next().value
          if (oldest) this.failures.delete(oldest)
        }
        try {
          this.options.onReady?.(normalized)
        } catch {
          /* Observer failures must not replace the original preview failure. */
        }
        throw new Error('Link preview could not be generated')
      })
      .finally(() => {
        this.pending.delete(normalized)
      })
    this.pending.set(normalized, { promise, controller, manual })
    return promise
  }

  dispose = async (): Promise<void> => {
    this.disposed = true
    const pending = [...this.pending.values()]
    for (const item of pending) item.controller.abort()
    await Promise.allSettled(pending.map((item) => item.promise))
    await this.queue.onIdle()
    this.desired.clear()
    this.cache.clear()
    this.failures.clear()
  }
}

export { normalizePreviewURL } from '@main/media/linkPreviewPolicy'
