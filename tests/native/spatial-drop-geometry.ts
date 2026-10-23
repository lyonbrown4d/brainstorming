import { browser } from '@wdio/globals'
import type { SpatialDragChoice, SpatialTestCanvas } from '@tests/native/independent-spatial'

export interface SpatialDropChoice extends SpatialDragChoice {
  readonly targetId: string
  readonly horizontal: boolean
  readonly direction: number
}

/** Read the actual perspective billboards and choose an exposed body plus a 22px outgoing gap. */
export const chooseSpatialDrop = async (
  movingId: string,
  targetId: string,
): Promise<SpatialDropChoice> =>
  browser.execute(
    ({ movingId, targetId }) => {
      const canvas = document.querySelector<SpatialTestCanvas>(
        'canvas[data-spatial-canvas="three"]',
      )
      if (!canvas || document.querySelector('[data-canvas-loading]'))
        throw new Error('Three canvas is not ready')
      const rectangles = canvas.spatialDiagnostics.rectangles
      const moving = rectangles.find((rect) => rect.id === movingId),
        target = rectangles.find((rect) => rect.id === targetId),
        root = rectangles.find((rect) => rect.id === 'root')
      if (!moving || !target || !root)
        throw new Error('The moving topic, target and root must be projected')
      const center = (rect: typeof moving) => ({
        x: rect.x + rect.width / 2,
        y: rect.y + rect.height / 2,
      })
      const m = center(moving),
        t = center(target),
        r = center(root)
      const horizontal = Math.abs(t.x - r.x) >= Math.abs(t.y - r.y)
      const direction = Math.sign(horizontal ? t.x - r.x : t.y - r.y) || -1
      const desired = {
        x: t.x + (horizontal ? direction * (target.width / 2 + moving.width / 2 + 22) : 0),
        y: t.y + (horizontal ? 0 : direction * (target.height / 2 + moving.height / 2 + 22)),
      }
      const bounds = canvas.getBoundingClientRect()
      if (
        desired.x - moving.width / 2 < bounds.left + 4 ||
        desired.x + moving.width / 2 > bounds.right - 4 ||
        desired.y - moving.height / 2 < bounds.top + 4 ||
        desired.y + moving.height / 2 > bounds.bottom - 4
      )
        throw new Error(
          'The early-drop rectangle would leave the visible canvas; fit the four-topic fixture first',
        )
      for (const fy of [0.2, 0.5, 0.75])
        for (const fx of [0.5, 0.25, 0.75]) {
          const start = {
            x: Math.round(moving.x + moving.width * fx),
            y: Math.round(moving.y + moving.height * fy),
          }
          const hit = rectangles
            .filter(
              (rect) =>
                start.x >= rect.x &&
                start.x <= rect.x + rect.width &&
                start.y >= rect.y &&
                start.y <= rect.y + rect.height,
            )
            .sort((a, b) => a.depth - b.depth)[0]
          if (hit?.id !== movingId || document.elementFromPoint(start.x, start.y) !== canvas)
            continue
          const end = {
            x: Math.round(start.x + desired.x - m.x),
            y: Math.round(start.y + desired.y - m.y),
          }
          if (document.elementFromPoint(end.x, end.y) !== canvas) continue
          return { id: movingId, targetId, start, end, horizontal, direction }
        }
      throw new Error('No exposed Three body and unobstructed early-drop destination')
    },
    { movingId, targetId },
  )
