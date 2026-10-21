import type { Locator } from '@playwright/test'

/** Read the actual inherited projection scale applied by React Flow's wrapper. */
export const cameraScale = async (locator: Locator): Promise<number> =>
  locator.evaluate((element) =>
    Number(getComputedStyle(element).getPropertyValue('--canvas-camera-scale') || 1),
  )

export const exposedTopicPoint = async (locator: Locator): Promise<{ x: number; y: number }> =>
  locator.evaluate((node) => {
    const rect = node.getBoundingClientRect()
    for (const y of [3, 8, 16, rect.height * 0.4])
      for (const x of [rect.width * 0.5, rect.width * 0.25, rect.width * 0.75]) {
        const point = { x: rect.left + x, y: rect.top + y }
        if (node.contains(document.elementFromPoint(point.x, point.y))) return point
      }
    throw new Error('No exposed topic point in the side view')
  })
