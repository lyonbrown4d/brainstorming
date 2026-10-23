import { browser, expect } from '@wdio/globals'
import { createFixtureDocument, createWorkbook, serializeWorkbook } from '@core'
import {
  artifact,
  chooseFile,
  focusNativeWindow,
  home,
  native,
  openSaved,
} from '@tests/native/driver'

export interface SpatialTestRect {
  readonly id: string
  readonly kind: 'topic' | 'ink'
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
  readonly depth: number
}
export interface SpatialFrameDiagnostics {
  readonly camera: {
    readonly position: number[]
    readonly quaternion: number[]
    readonly matrix: number[]
  } | null
  readonly renderFrame: number
  readonly calls: number
  readonly triangles: number
  readonly textures: number
  readonly rootTitle: string
  readonly topicCount: number
}
export interface SpatialTestDiagnostics extends SpatialFrameDiagnostics {
  readonly rectangles: SpatialTestRect[]
}
export type SpatialTestCanvas = HTMLCanvasElement & {
  readonly spatialDiagnostics: SpatialTestDiagnostics
  readonly spatialFrameDiagnostics: SpatialFrameDiagnostics
}
export interface SpatialTestPoint {
  readonly x: number
  readonly y: number
}
export interface SpatialDragChoice {
  readonly id: string
  readonly start: SpatialTestPoint
  readonly end: SpatialTestPoint
}

export const readIndependentSpatial = async () =>
  browser.execute(() => {
    const canvas = document.querySelector<SpatialTestCanvas>('canvas[data-spatial-canvas="three"]')
    if (!canvas?.spatialDiagnostics.camera)
      throw new Error('Independent Three diagnostics are unavailable')
    return canvas.spatialDiagnostics
  })

export const waitIndependentSpatial = async (): Promise<void> => {
  await expect(browser.$('canvas[data-spatial-canvas="three"]')).toBeDisplayed()
  await expect(browser.$('[data-canvas-loading]')).not.toExist({ wait: 20_000 })
  await focusNativeWindow()
  await browser.waitUntil(async () => (await readIndependentSpatial()).renderFrame > 0)
  await expect(browser.$('.react-flow')).not.toExist()
  await expect(browser.$('.react-flow__node')).not.toExist()
}

export const quietIndependentSpatial = async (): Promise<void> => {
  let previous: readonly number[] = []
  let since = Date.now()
  await browser.waitUntil(
    async () => {
      const current = await browser.execute(() => {
        const canvas = document.querySelector<SpatialTestCanvas>(
          'canvas[data-spatial-canvas="three"]',
        )
        return canvas?.spatialFrameDiagnostics.camera?.matrix ?? []
      })
      if (
        current.length !== previous.length ||
        current.some((value, index) => Math.abs(value - (previous[index] ?? 0)) > 1e-8)
      )
        since = Date.now()
      previous = current
      return current.length === 16 && Date.now() - since > 400
    },
    { timeoutMsg: 'Independent perspective camera did not settle' },
  )
}

export const openIndependentFixture = async (count: number) => {
  await home()
  const document = { ...createFixtureDocument(count), id: artifact('independent-fixture') }
  const name = artifact(`independent-${count}`)
  const path = await chooseFile('save', name)
  await native('saveDocument', {
    request: {
      path: null,
      contents: serializeWorkbook(createWorkbook(document)),
      suggestedName: name,
    },
  })
  await native('releaseDocument', { path })
  await openSaved(name)
  await expect(browser.$('[data-canvas-loading]')).not.toExist({ wait: 20_000 })
  await browser.$('button[aria-label="三维视图"]').click()
  await waitIndependentSpatial()
  await quietIndependentSpatial()
  return { name, document }
}

export const chooseIndependentDrag = async (
  leafIds: readonly string[],
): Promise<SpatialDragChoice> =>
  browser.execute(
    (ids) => {
      const canvas = document.querySelector<SpatialTestCanvas>(
        'canvas[data-spatial-canvas="three"]',
      )
      if (!canvas) throw new Error('Missing independent Three canvas')
      const bounds = canvas.getBoundingClientRect()
      const rectangles = canvas.spatialDiagnostics.rectangles
      const leaves = new Set(ids)
      const candidates = rectangles
        .filter((rect) => rect.kind === 'topic' && leaves.has(rect.id))
        .sort((a, b) => a.depth - b.depth)
      for (const candidate of candidates) {
        const start = {
          x: Math.round(candidate.x + candidate.width / 2),
          y: Math.round(candidate.y + candidate.height / 2),
        }
        if (
          start.x < bounds.left + 100 ||
          start.x > bounds.right - 100 ||
          start.y < bounds.top + 100 ||
          start.y > bounds.bottom - 180
        )
          continue
        const hit = rectangles
          .filter(
            (rect) =>
              start.x >= rect.x &&
              start.x <= rect.x + rect.width &&
              start.y >= rect.y &&
              start.y <= rect.y + rect.height,
          )
          .sort((a, b) => a.depth - b.depth)[0]
        if (hit?.id !== candidate.id || document.elementFromPoint(start.x, start.y) !== canvas)
          continue
        for (let y = bounds.top + 110; y < bounds.bottom - 180; y += 64) {
          for (let x = bounds.left + 120; x < bounds.right - 120; x += 64) {
            const end = { x: Math.round(x), y: Math.round(y) }
            if (
              Math.hypot(end.x - start.x, end.y - start.y) < 160 ||
              document.elementFromPoint(end.x, end.y) !== canvas
            )
              continue
            if (
              rectangles.every(
                (rect) =>
                  Math.hypot(
                    Math.max(rect.x - x, 0, x - rect.x - rect.width),
                    Math.max(rect.y - y, 0, y - rect.y - rect.height),
                  ) > 48,
              )
            )
              return { id: candidate.id, start, end }
          }
        }
      }
      throw new Error('No unobscured leaf and empty destination outside every 48px drop halo')
    },
    [...leafIds],
  )

export const clickIndependentTopic = async (id: string): Promise<void> => {
  const point = await browser.execute((topicId) => {
    const canvas = document.querySelector<SpatialTestCanvas>('canvas[data-spatial-canvas="three"]')
    const rectangles = canvas?.spatialDiagnostics.rectangles ?? []
    const rect = rectangles.find((item) => item.id === topicId)
    if (!canvas || !rect) throw new Error('Missing visible independent topic')
    const x = Math.round(rect.x + rect.width / 2),
      y = Math.round(rect.y + rect.height / 2)
    const hit = rectangles
      .filter(
        (item) =>
          x >= item.x && x <= item.x + item.width && y >= item.y && y <= item.y + item.height,
      )
      .sort((a, b) => a.depth - b.depth)[0]
    if (hit?.id !== topicId || document.elementFromPoint(x, y) !== canvas)
      throw new Error('Requested topic is occluded')
    return { x, y }
  }, id)
  await browser.performActions([
    {
      type: 'pointer',
      id: 'independent-mouse',
      parameters: { pointerType: 'mouse' },
      actions: [
        { type: 'pointerMove', duration: 0, x: point.x, y: point.y },
        { type: 'pointerDown', button: 0 },
        { type: 'pointerUp', button: 0 },
      ],
    },
  ])
  await browser.releaseActions()
}
