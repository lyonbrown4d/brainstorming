import { browser } from '@wdio/globals'
import { writeFile } from 'node:fs/promises'
import { startNativePointer } from '@tests/native/native-pointer'
import { nativeArtifact } from '@tests/native/artifacts'
import type { SpatialDragChoice, SpatialTestCanvas } from '@tests/native/independent-spatial'

/** Observe actual trusted native input; never forge DOM events, capture, or editor commands. */
export const observeDesktopSpatialDrag = async (
  choice: SpatialDragChoice,
  options: { readonly onHeld?: () => Promise<void> } = {},
) => {
  await browser.execute((choice) => {
    const canvas = document.querySelector<SpatialTestCanvas>('canvas[data-spatial-canvas="three"]')
    if (!canvas || document.querySelector('[data-canvas-loading]'))
      throw new Error('A ready independent canvas is required')
    const evidence = {
      done: false,
      error: '',
      captured: false,
      trusted: true,
      renderedUpdates: 0,
      durationMs: 0,
      renderedUpdatesFps: 0,
      p95Ms: 0,
      events: 0,
      initial: canvas.spatialDiagnostics.rectangles.find((rect) => rect.id === choice.id),
      final: canvas.spatialDiagnostics.rectangles.find((rect) => rect.id === choice.id),
      screenDelta: { x: 0, y: 0 },
      frames: [] as number[],
      measurement: 'trusted desktop pointer input; actual native WebGL render updates',
    }
    Object.defineProperty(canvas, 'desktopDragEvidence', { value: evidence, configurable: true })
    let pointer: number | null = null,
      frame = 0,
      started = 0,
      previous = 0
    let rendered = canvas.spatialFrameDiagnostics.renderFrame
    const tick = (time: number) => {
      if (previous) evidence.frames.push(time - previous)
      previous = time
      if (!document.hasFocus() || document.visibilityState !== 'visible')
        evidence.error = 'Native drag lost window focus'
      const current = canvas.spatialFrameDiagnostics.renderFrame
      if (current !== rendered) evidence.renderedUpdates++
      rendered = current
      frame = requestAnimationFrame(tick)
    }
    const down = (event: PointerEvent) => {
      if (!event.isTrusted || event.target !== canvas || pointer !== null) return
      const hit = canvas.spatialDiagnostics.rectangles
        .filter(
          (rect) =>
            event.clientX >= rect.x &&
            event.clientX <= rect.x + rect.width &&
            event.clientY >= rect.y &&
            event.clientY <= rect.y + rect.height,
        )
        .sort((a, b) => a.depth - b.depth)[0]
      if (hit?.id !== choice.id) return
      pointer = event.pointerId
      evidence.initial = hit
      started = performance.now()
      queueMicrotask(() => {
        evidence.captured = canvas.hasPointerCapture(event.pointerId)
      })
      frame = requestAnimationFrame(tick)
    }
    const move = (event: PointerEvent) => {
      if (event.pointerId === pointer) {
        evidence.captured ||= canvas.hasPointerCapture(event.pointerId)
        evidence.events++
        evidence.trusted &&= event.isTrusted
      }
    }
    const stop = () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('pointerdown', down, true)
      window.removeEventListener('pointermove', move, true)
      window.removeEventListener('pointerup', up, true)
      window.removeEventListener('pointercancel', cancel, true)
    }
    const up = (event: PointerEvent) => {
      if (event.pointerId !== pointer) return
      evidence.trusted &&= event.isTrusted
      stop()
      requestAnimationFrame(() => {
        evidence.final = canvas.spatialDiagnostics.rectangles.find((rect) => rect.id === choice.id)
        evidence.durationMs = performance.now() - started
        evidence.renderedUpdatesFps =
          (evidence.renderedUpdates * 1000) / Math.max(1, evidence.durationMs)
        const sorted = [...evidence.frames].sort((a, b) => a - b)
        evidence.p95Ms = sorted[Math.floor(sorted.length * 0.95)] ?? 0
        if (evidence.initial && evidence.final)
          evidence.screenDelta = {
            x: evidence.final.x - evidence.initial.x,
            y: evidence.final.y - evidence.initial.y,
          }
        evidence.done = true
      })
    }
    const cancel = (event: PointerEvent) => {
      if (event.pointerId !== pointer) return
      stop()
      evidence.error = 'Trusted native pointer was cancelled'
      evidence.done = true
    }
    window.addEventListener('pointerdown', down, true)
    window.addEventListener('pointermove', move, true)
    window.addEventListener('pointerup', up, true)
    window.addEventListener('pointercancel', cancel, true)
  }, choice)
  await writeFile(
    await nativeArtifact('brainstorming-desktop-pointer-request.json'),
    JSON.stringify({ kind: 'drag', choice, requestedAt: new Date().toISOString() }, null, 2),
  )
  const pointer = await startNativePointer(choice)
  try {
    await pointer.held()
    await options.onHeld?.()
  } finally {
    await pointer.release()
  }
  await browser.waitUntil(
    async () =>
      browser.execute(() => {
        const canvas = document.querySelector<
          HTMLCanvasElement & { desktopDragEvidence?: { done: boolean } }
        >('canvas[data-spatial-canvas="three"]')
        return canvas?.desktopDragEvidence?.done === true
      }),
    {
      timeout: 5000,
      timeoutMsg: 'Native input did not produce a trusted captured pointer drag',
    },
  )
  const result = await browser.execute(() => {
    const canvas = document.querySelector<
      HTMLCanvasElement & {
        desktopDragEvidence: {
          error: string
          captured: boolean
          trusted: boolean
          events: number
          renderedUpdates: number
          durationMs: number
          renderedUpdatesFps: number
          p95Ms: number
          screenDelta: { x: number; y: number }
          frames: number[]
        }
      }
    >('canvas[data-spatial-canvas="three"]')
    if (!canvas) throw new Error('The native canvas disappeared')
    return canvas.desktopDragEvidence
  })
  await writeFile(
    await nativeArtifact('brainstorming-desktop-pointer-result.json'),
    JSON.stringify(result, null, 2),
  )
  if (result.error || !result.captured || !result.trusted)
    throw new Error(
      result.error || 'The native drag did not acquire trusted browser pointer capture',
    )
  return result
}
