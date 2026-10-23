import { expect, type Locator, type Page } from '@playwright/test'
import type { MindMapDocument } from '@core'
import type { SpatialView } from '@renderer/state/spatialView'
import type { CanvasDrop } from '@renderer/lib/canvasDrop'
import type { SpatialSceneRect } from '@renderer/lib/independentSpatialRuntime'

export interface SpatialEvidence {
  readonly document: MindMapDocument
  readonly selected: string[]
  readonly selectedDrawings: string[]
  readonly history: { readonly past: number; readonly future: number }
  readonly view: SpatialView
  readonly camera: number[]
  readonly rectangles: SpatialSceneRect[]
  readonly drop: CanvasDrop | null
}
export const spatialCanvas = (page: Page) => page.locator('canvas[data-spatial-canvas="three"]')
export const spatialEvidence = async (page: Page): Promise<SpatialEvidence> =>
  JSON.parse(
    (await page.getByTestId('independent-spatial-evidence').textContent()) ?? '{}',
  ) as SpatialEvidence
export const spatialRect = async (page: Page, id: string): Promise<SpatialSceneRect> => {
  let rect = (await spatialEvidence(page)).rectangles.find((item) => item.id === id)
  if (!rect)
    await expect
      .poll(async () => {
        rect = (await spatialEvidence(page)).rectangles.find((item) => item.id === id)
        return rect
      })
      .toBeDefined()
  if (!rect) throw new Error(`Missing actual Three projection for ${id}`)
  return rect
}
export const openSpatial = async (page: Page) => {
  await page.goto('/iframe.html?id=brainstorming-空间视图--interactive&viewMode=story')
  await expect(page.locator('#sheet-panel[data-spatial-independent]')).toBeVisible({
    timeout: 20_000,
  })
  await expect(page.locator('[data-canvas-loading]')).toHaveCount(0, { timeout: 20_000 })
  await expect(spatialCanvas(page)).toBeVisible()
  await expect(page.locator('.react-flow')).toHaveCount(0)
  await expect.poll(async () => (await spatialEvidence(page)).rectangles.length).toBe(5)
}
export const locatorBounds = async (locator: Locator) => {
  const box = await locator.boundingBox()
  if (!box) throw new Error('Missing visible control geometry')
  return box
}
export const settledSpatialRect = async (page: Page, id: string) => {
  let previous = await spatialRect(page, id),
    stable = 0
  await expect
    .poll(
      async () => {
        const next = await spatialRect(page, id)
        stable =
          Math.hypot(next.x - previous.x, next.y - previous.y, next.width - previous.width) < 0.05
            ? stable + 1
            : 0
        previous = next
        return stable
      },
      { intervals: [60, 60, 60, 60], timeout: 5000 },
    )
    .toBeGreaterThanOrEqual(3)
  return previous
}
export const spatialPoint = async (page: Page, id: string) => {
  const rectangles = (await spatialEvidence(page)).rectangles
  const rect = rectangles.find((item) => item.id === id)
  if (!rect) throw new Error(`Missing topic ${id}`)
  for (const fy of [0.5, 0.25, 0.75, 0.1])
    for (const fx of [0.5, 0.25, 0.75]) {
      const point = { x: rect.x + rect.width * fx, y: rect.y + rect.height * fy }
      const front = rectangles
        .filter(
          (item) =>
            point.x >= item.x &&
            point.x <= item.x + item.width &&
            point.y >= item.y &&
            point.y <= item.y + item.height,
        )
        .sort((a, b) => a.depth - b.depth)[0]
      if (front?.id !== id) continue
      if (
        await page.evaluate(
          (point) =>
            document
              .elementFromPoint(point.x, point.y)
              ?.matches('canvas[data-spatial-canvas="three"]') ?? false,
          point,
        )
      )
        return point
    }
  throw new Error(`Topic ${id} is occluded; no exposed real pointer target`)
}
export const clickSpatial = async (page: Page, id: string, additive = false) => {
  const point = await spatialPoint(page, id)
  if (additive) await page.keyboard.down('Meta')
  try {
    await page.mouse.click(point.x, point.y)
  } finally {
    if (additive) await page.keyboard.up('Meta')
  }
}
export const emptySpatialPoint = async (page: Page) => {
  const canvas = await locatorBounds(spatialCanvas(page)),
    rectangles = (await spatialEvidence(page)).rectangles
  for (const y of [0.72, 0.6, 0.42, 0.28])
    for (const x of [0.12, 0.2, 0.8, 0.88]) {
      const point = { x: canvas.x + canvas.width * x, y: canvas.y + canvas.height * y }
      if (
        rectangles.some(
          (rect) =>
            point.x >= rect.x - 22 &&
            point.x <= rect.x + rect.width + 22 &&
            point.y >= rect.y - 22 &&
            point.y <= rect.y + rect.height + 22,
        )
      )
        continue
      if (
        await page.evaluate(
          (point) =>
            document
              .elementFromPoint(point.x, point.y)
              ?.matches('canvas[data-spatial-canvas="three"]') ?? false,
          point,
        )
      )
        return point
    }
  throw new Error('No empty exposed Three canvas point')
}
export const dragSpatialPoint = async (
  page: Page,
  point: { x: number; y: number },
  dx: number,
  dy: number,
  cancel = false,
) => {
  await page.mouse.move(point.x, point.y)
  await page.mouse.down()
  await page.mouse.move(point.x + 5, point.y)
  await page.mouse.move(point.x + dx, point.y + dy, { steps: 12 })
  if (cancel) await page.keyboard.press('Escape')
  await page.mouse.up()
}
export const openSpatialCamera = async (page: Page) => {
  const preset = page.getByRole('button', { name: '等轴测', exact: true })
  if (!(await preset.isVisible()))
    await page.getByRole('button', { name: '视角', exact: true }).click()
  await expect(preset).toBeVisible()
}
export const spatialDistance = async (page: Page) => {
  const text = await page.locator('.zoom-value').textContent()
  const value = Number(text?.replace(/[^\d]/g, '') ?? '')
  if (!Number.isFinite(value) || value <= 0) throw new Error(`Invalid camera distance: ${text}`)
  return value
}

/** Start on the actual canvas, avoiding relation hit paths and controls around a topic. */
export const spatialMarqueePoints = async (page: Page, id: string) => {
  const rect = await spatialRect(page, id),
    rectangles = (await spatialEvidence(page)).rectangles
  for (const margin of [18, 32, 48])
    for (const [sx, sy] of [
      [-1, -1],
      [1, -1],
      [-1, 1],
      [1, 1],
    ]) {
      const start = {
        x: sx === -1 ? rect.x - margin : rect.x + rect.width + margin,
        y: sy === -1 ? rect.y - margin : rect.y + rect.height + margin,
      }
      if (
        rectangles.some(
          (item) =>
            start.x >= item.x &&
            start.x <= item.x + item.width &&
            start.y >= item.y &&
            start.y <= item.y + item.height,
        )
      )
        continue
      if (
        await page.evaluate(
          (point) =>
            document
              .elementFromPoint(point.x, point.y)
              ?.matches('canvas[data-spatial-canvas="three"]') ?? false,
          start,
        )
      )
        return {
          start,
          end: {
            x: sx === -1 ? rect.x + rect.width + margin : rect.x - margin,
            y: sy === -1 ? rect.y + rect.height + margin : rect.y - margin,
          },
        }
    }
  throw new Error('No empty canvas corner for spatial marquee')
}
