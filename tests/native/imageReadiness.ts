import { browser } from '@wdio/globals'
import { focusNativeWindow } from '@tests/native/driver'

/** Inspect the live decoded image, not merely the img element's CSS visibility. */
export const expectEmbeddedArtworkReady = async (): Promise<void> => {
  await focusNativeWindow()
  try {
    await browser.waitUntil(async () =>
      browser.execute(() => {
        const image = document.querySelector<HTMLImageElement>(
          '[data-testid="topic-root"] img[alt="camping.png"]',
        )
        return Boolean(image?.complete && image.naturalWidth > 0)
      }),
    )
  } catch (failure) {
    try {
      const diagnostics = await browser.execute(async () => {
        const images = [...document.querySelectorAll<HTMLImageElement>('img[alt="camping.png"]')]
        const source = images[0]?.src
        const redact = (url: string) => url.replace(/\/[^/]+\/object\//u, '/[session]/object/')
        const decode = async (cors: boolean) => {
          const probe = new Image()
          if (cors) probe.crossOrigin = 'anonymous'
          probe.src = source ?? ''
          let timer: ReturnType<typeof setTimeout> | undefined
          try {
            await Promise.race([
              probe.decode(),
              new Promise<never>((_, reject) => {
                timer = setTimeout(() => {
                  reject(new Error('decode timeout'))
                }, 3000)
              }),
            ])
            return { width: probe.naturalWidth, height: probe.naturalHeight }
          } catch (error) {
            return { error: String(error) }
          } finally {
            clearTimeout(timer)
          }
        }
        const existing = images.map((image) => ({
          complete: image.complete,
          width: image.naturalWidth,
          height: image.naturalHeight,
          source: redact(image.currentSrc || image.src),
        }))
        let fetched: object | null = null
        if (source) {
          try {
            const response = await fetch(source, { signal: AbortSignal.timeout(3000) })
            fetched = {
              status: response.status,
              type: response.headers.get('content-type'),
              bytes: (await response.arrayBuffer()).byteLength,
            }
          } catch (error) {
            fetched = { error: String(error) }
          }
        }
        return {
          focused: document.hasFocus(),
          visibility: document.visibilityState,
          existing,
          fetched,
          timings: performance
            .getEntriesByType('resource')
            .filter(
              (entry): entry is PerformanceResourceTiming =>
                entry instanceof PerformanceResourceTiming && entry.name === source,
            )
            .map((entry) => ({
              duration: entry.duration,
              initiator: entry.initiatorType,
              bytes: entry.encodedBodySize,
            })),
          probes: source ? await Promise.all([decode(false), decode(true)]) : [],
        }
      })
      console.error('Native embedded image diagnostics:', JSON.stringify(diagnostics))
    } catch (diagnosticFailure) {
      console.error('Native image diagnostics unavailable:', diagnosticFailure)
    }
    throw failure
  }
}
