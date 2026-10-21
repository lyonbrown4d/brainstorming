import type { Locator } from '@playwright/test'

/** Read the actual inherited projection scale applied by React Flow's wrapper. */
export const cameraScale = async (locator: Locator): Promise<number> =>
  locator.evaluate((element) =>
    Number(getComputedStyle(element).getPropertyValue('--canvas-camera-scale') || 1),
  )
