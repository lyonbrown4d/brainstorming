import { browser } from '@wdio/globals'
import { fixture, focusNativeWindow } from '@tests/native/driver'
import type { SpatialDragChoice } from '@tests/native/independent-spatial'

interface NativePointerStatus {
  readonly gestureId: string
  readonly phase: 'queued' | 'moving' | 'held' | 'complete' | 'failed'
  readonly done: boolean
  readonly events: number
  readonly cleanupError: string | null
  readonly error: string | null
  readonly automaticRelease: boolean
}

/** Native AppKit events target only the isolated E2E WKWebView; never the system pointer. */
export const startNativePointer = async (choice: SpatialDragChoice) => {
  await focusNativeWindow()
  const viewport = await browser.execute(() => ({ width: innerWidth, height: innerHeight }))
  const steps = 180
  const points = Array.from({ length: steps + 1 }, (_, index) => ({
    x: choice.start.x + ((choice.end.x - choice.start.x) * index) / steps,
    y: choice.start.y + ((choice.end.y - choice.start.y) * index) / steps,
  }))
  if (process.platform !== 'darwin') {
    const id = 'independent-native-pointer'
    await browser.performActions([
      {
        type: 'pointer',
        id,
        parameters: { pointerType: 'mouse' },
        actions: [
          {
            type: 'pointerMove',
            x: Math.round(choice.start.x),
            y: Math.round(choice.start.y),
            duration: 0,
          },
          { type: 'pointerDown', button: 0 },
          ...points.slice(1).map((point) => ({
            type: 'pointerMove' as const,
            x: Math.round(point.x),
            y: Math.round(point.y),
            duration: 8,
          })),
        ],
      },
    ])
    return {
      held: () => Promise.resolve(),
      release: async () => {
        await browser.releaseActions()
      },
    }
  }
  const { gestureId } = await fixture<{ gestureId: string }>('nativePointer', {
    operation: 'start',
    viewport,
    points,
    stepMs: 8,
    holdMs: 8000,
  })
  const status = () =>
    fixture<NativePointerStatus>('nativePointer', { operation: 'status', gestureId })
  return {
    held: async () => {
      await browser.waitUntil(
        async () => {
          const current = await status()
          if (current.error || current.done)
            throw new Error(current.error ?? 'Native pointer released before the held assertions')
          return current.phase === 'held'
        },
        {
          timeout: 7000,
          interval: 20,
          timeoutMsg: 'Native pointer never reached its held destination',
        },
      )
    },
    release: async () => {
      await fixture('nativePointer', { operation: 'release', gestureId })
      await browser.waitUntil(async () => (await status()).done, { timeout: 5000, interval: 20 })
      const final = await status()
      if (final.error || final.cleanupError || final.automaticRelease || final.phase !== 'complete')
        throw new Error(
          final.error ?? final.cleanupError ?? 'Native pointer required an automatic release',
        )
      return final
    },
  }
}
