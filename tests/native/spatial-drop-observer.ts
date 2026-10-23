import { browser } from '@wdio/globals'
import type { SpatialTestCanvas, SpatialTestRect } from '@tests/native/independent-spatial'
import type { SpatialDropChoice } from '@tests/native/spatial-drop-geometry'

export interface SpatialDropSnapshot {
  readonly parentId: string | null
  readonly lineParentId: string | null
  readonly predicted: string | null
  readonly line: string
  readonly gap: number
  readonly changed: boolean
  readonly moving: SpatialTestRect
  readonly target: SpatialTestRect
  readonly capturedAt: number
  readonly renderFrame: number
}
interface DropObservation {
  snapshot: SpatialDropSnapshot | null
  releasedAt: number | null
  trusted: boolean
  stop: () => void
}
type DropCanvas = SpatialTestCanvas & { desktopDropObservation?: DropObservation }

/** Observe live DOM and projected geometry only; the desktop operator supplies every pointer event. */
export const beginSpatialDropObservation = async (choice: SpatialDropChoice): Promise<void> => {
  await browser.execute((choice) => {
    const canvas = document.querySelector<DropCanvas>('canvas[data-spatial-canvas="three"]')
    if (!canvas) throw new Error('Missing independent Three canvas')
    canvas.desktopDropObservation?.stop()
    const initial = canvas.spatialDiagnostics.rectangles.find((rect) => rect.id === choice.id)
    if (!initial) throw new Error('Missing actual moving rectangle')
    let pointer: number | null = null,
      frame = 0
    const observation: DropObservation = {
      snapshot: null,
      releasedAt: null,
      trusted: true,
      stop: () => undefined,
    }
    const read = () => {
      const preview = document.querySelector('[data-testid="drop-preview"]')
      const line = document.querySelector(`[data-testid="drop-preview-connection-${choice.id}"]`)
      if (
        preview?.getAttribute('data-parent-id') !== choice.targetId ||
        !line ||
        observation.snapshot
      )
        return
      const rectangles = canvas.spatialDiagnostics.rectangles
      const moving = rectangles.find((rect) => rect.id === choice.id),
        target = rectangles.find((rect) => rect.id === choice.targetId)
      if (!moving || !target) return
      const gap = choice.horizontal
        ? choice.direction > 0
          ? moving.x - target.x - target.width
          : target.x - moving.x - moving.width
        : choice.direction > 0
          ? moving.y - target.y - target.height
          : target.y - moving.y - moving.height
      if (gap <= 12 || preview.getAttribute('data-drop-predicted') !== 'true') return
      observation.snapshot = {
        parentId: preview.getAttribute('data-parent-id'),
        lineParentId: line.getAttribute('data-parent-id'),
        predicted: preview.getAttribute('data-drop-predicted'),
        line: ['x1', 'y1', 'x2', 'y2'].map((name) => line.getAttribute(name) ?? '').join(','),
        gap,
        changed: Math.hypot(moving.x - initial.x, moving.y - initial.y) > 4,
        moving,
        target,
        capturedAt: performance.now(),
        renderFrame: canvas.spatialFrameDiagnostics.renderFrame,
      }
    }
    const tick = () => {
      read()
      if (observation.releasedAt === null) frame = requestAnimationFrame(tick)
    }
    const down = (event: PointerEvent) => {
      if (!event.isTrusted || event.target !== canvas || pointer !== null) return
      const rects = canvas.spatialDiagnostics.rectangles
      const hit = rects
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
      frame = requestAnimationFrame(tick)
    }
    const up = (event: PointerEvent) => {
      if (event.pointerId !== pointer) return
      observation.trusted &&= event.isTrusted
      observation.releasedAt = performance.now()
      cancelAnimationFrame(frame)
    }
    observation.stop = () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('pointerdown', down, true)
      window.removeEventListener('pointerup', up, true)
    }
    Object.defineProperty(canvas, 'desktopDropObservation', {
      value: observation,
      configurable: true,
    })
    window.addEventListener('pointerdown', down, true)
    window.addEventListener('pointerup', up, true)
  }, choice)
}

export const readSpatialDropObservation = async () =>
  browser.execute(() => {
    const canvas = document.querySelector<DropCanvas>('canvas[data-spatial-canvas="three"]')
    const observation = canvas?.desktopDropObservation
    return {
      snapshot: observation?.snapshot ?? null,
      releasedAt: observation?.releasedAt ?? null,
      trusted: observation?.trusted ?? false,
    }
  })

export const stopSpatialDropObservation = async (): Promise<void> => {
  await browser.execute(() => {
    document
      .querySelector<DropCanvas>('canvas[data-spatial-canvas="three"]')
      ?.desktopDropObservation?.stop()
  })
}
