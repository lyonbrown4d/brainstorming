import { nativeStructuralEdgePath } from '@tests/native/structural-edge-path'
import { browser, expect } from '@wdio/globals'
import { writeFile } from 'node:fs/promises'
import { createFixtureDocument, createWorkbook, serializeWorkbook } from '@core'
import { nativeArtifact } from '@tests/native/artifacts'
import {
  nativePerformanceGesture,
  waitNativeCanvasQuiet,
} from '@tests/native/canvas-performance-geometry'
import { previewNativeCanvasDrag, finishNativeCanvasDrag } from '@tests/native/canvas-drag'
import {
  artifact,
  chooseFile,
  home,
  native,
  openSaved,
  root,
  readDocument,
  shortcut,
  focusNativeWindow,
} from '@tests/native/driver'

/** Native WebKit frame intervals; synthetic wheel input does not measure physical GPU presentation. */
const sampleNavigation = async (kind: 'pan' | 'zoom') =>
  browser.execute(async (mode) => {
    const pane = document.querySelector('.react-flow__pane')
    if (!pane) throw new Error('Missing native canvas')
    const bounds = document.querySelector('[data-testid="topic-root"]')?.getBoundingClientRect()
    if (!bounds) throw new Error('The navigation sample requires a visible root')
    const intervals: number[] = []
    const initial = document.querySelector('.react-flow__viewport')?.getAttribute('style')
    let last = performance.now()
    const start = last
    await new Promise<void>((resolve, reject) => {
      const timeout = window.setTimeout(() => {
        reject(new Error('Native frame sample stopped; the window must remain visible'))
      }, 4000)
      const frame = (now: number) => {
        intervals.push(now - last)
        last = now
        const wave = Math.sin((now - start) / 220)
        pane.dispatchEvent(
          new WheelEvent('wheel', {
            deltaX: mode === 'pan' ? wave * 10 : 0,
            deltaY: mode === 'zoom' ? wave * 1.2 : 0,
            ctrlKey: mode === 'zoom',
            bubbles: true,
            cancelable: true,
            clientX: bounds.x + bounds.width / 2,
            clientY: bounds.y + bounds.height / 2,
          }),
        )
        if (document.visibilityState !== 'visible') {
          clearTimeout(timeout)
          reject(new Error('Native sampling window became hidden'))
        } else if (now - start < 1200) requestAnimationFrame(frame)
        else {
          clearTimeout(timeout)
          resolve()
        }
      }
      requestAnimationFrame(frame)
    })
    intervals.sort((a, b) => a - b)
    return {
      fps: (intervals.length * 1000) / intervals.reduce((sum, value) => sum + value, 0),
      p95: intervals[Math.floor(intervals.length * 0.95)],
      changed: initial !== document.querySelector('.react-flow__viewport')?.getAttribute('style'),
      mounted: document.querySelectorAll('.react-flow__node-topic').length,
    }
  }, kind)

it('navigates and moves a thousand-topic map with one undo and live structural edges', async () => {
  await home()
  const fixtureDocument = { ...createFixtureDocument(1000), id: artifact('fixture') }
  const source = createWorkbook(fixtureDocument)
  const sheet = source.sheets[0]
  if (!sheet) throw new Error('Missing fixture sheet')
  const workbook = { ...source, sheets: [{ ...sheet, document: fixtureDocument }] }
  const name = artifact('large-2d')
  const path = await chooseFile('save', name)
  await native('saveDocument', {
    request: { path: null, contents: serializeWorkbook(workbook), suggestedName: name },
  })
  await native('releaseDocument', { path })
  await openSaved(name)
  await expect(browser.$('[data-canvas-loading]')).not.toExist()
  await expect(browser.$('[data-view-mode="2d"]')).toBeDisplayed()
  if (process.env.BRAINSTORMING_GPU_REFERENCE === '1') {
    // Trigger the renderer's real context-loss fallback after WebGL has initialized.
    const canvas = browser.$('canvas[data-gpu-edge-ready="true"]')
    await expect(canvas).toExist()
    await browser.execute(() => {
      const target = document.querySelector<HTMLCanvasElement>('canvas[data-gpu-edge-ready="true"]')
      const context = target?.getContext('webgl2') ?? target?.getContext('webgl')
      const extension = context?.getExtension('WEBGL_lose_context')
      if (!extension) throw new Error('Native WebGL context loss is unavailable')
      extension.loseContext()
    })
    await expect(browser.$('canvas[data-gpu-edge-ready="true"]')).not.toExist()
    await expect(browser.$('svg[data-structural-edge-renderer="dense"]')).toBeDisplayed()
  }
  if (process.env.BRAINSTORMING_EXPECT_GPU === '1') {
    await expect(browser.$('canvas[data-gpu-edge-ready="true"]')).toExist()
  }
  await shortcut('r')
  await expect(root()).toBeDisplayed()
  await focusNativeWindow()
  const environment = await browser.execute(() => ({
    width: innerWidth,
    height: innerHeight,
    ratio: devicePixelRatio,
  }))
  console.info('Native performance environment', environment)
  console.info(
    'Native reference mode',
    process.env.BRAINSTORMING_GPU_REFERENCE === '1' ? 'svg' : 'default',
  )
  const samples = []
  for (const kind of ['pan', 'zoom'] as const) {
    for (let run = 0; run < 3; run += 1) {
      await browser.$('button[aria-label="适应画布"]').click()
      await waitNativeCanvasQuiet()
      await shortcut('r')
      await focusNativeWindow()
      await waitNativeCanvasQuiet()
      const sample = await sampleNavigation(kind)
      console.info('Native 2D sample', { kind, run, ...sample })
      expect(sample.changed).toBe(true)
      expect(sample.mounted).toBeGreaterThan(0)
      expect(Number.isFinite(sample.fps)).toBe(true)
      samples.push({ kind, run, ...sample })
    }
  }
  let dragZoom = 0
  for (let run = 0; run < 3; run++) {
    // Navigation sampling dispatches a frame-dependent number of wheel events.
    // Reset through the visible controls so every drag cohort starts at the same zoom.
    await browser.$('button[aria-label="适应画布"]').click()
    await waitNativeCanvasQuiet()
    await shortcut('r')
    await expect(root()).toBeDisplayed()
    await focusNativeWindow()
    await waitNativeCanvasQuiet()
    const rootGesture = await nativePerformanceGesture('root')
    const before = rootGesture.rect
    const previousPath = await nativeStructuralEdgePath('edge-topic-1')
    if (!previousPath) throw new Error('Missing structural edge path')
    const { start, end } = rootGesture
    try {
      const dragSample = await previewNativeCanvasDrag(start, end, 'root', 60)
      console.info('Native 2D drag sample', { run, ...dragSample })
      expect(dragSample.changed).toBe(true)
      expect(dragSample.viewportUpdatedFrames).toBe(0)
      if (run === 0) dragZoom = dragSample.zoom ?? 0
      expect(dragZoom).toBeGreaterThan(0)
      expect(dragSample.zoom).toBeCloseTo(dragZoom, 6)
      expect({
        width: dragSample.width,
        height: dragSample.height,
        ratio: dragSample.ratio,
      }).toEqual(environment)
      if (process.env.BRAINSTORMING_EXPECT_SVG === '1') expect(dragSample.renderer).toBe('svg')
      if (process.env.BRAINSTORMING_EXPECT_GPU === '1') {
        expect(dragSample.renderer).toBe('webgl')
        expect(dragSample.gpuFrames).toBeGreaterThan(0)
        if (run === 0)
          await browser.saveScreenshot(await nativeArtifact('brainstorming-2d-gpu-drag.png'))
      }
      samples.push({ kind: 'drag', run, ...dragSample })
      await browser.waitUntil(
        async () => (await nativeStructuralEdgePath('edge-topic-1')) !== previousPath,
      )
    } finally {
      await finishNativeCanvasDrag(end)
    }
    await browser.waitUntil(async () => {
      const actual = await readDocument(name)
      return Math.abs(actual.sheets[0]?.document.topics.root?.style?.offsetX ?? 0) > 1
    })
    const moved = await readDocument(name)
    expect(Object.keys(moved.sheets[0]?.document.topics ?? {})).toHaveLength(1000)
    expect(moved.sheets[0]?.document.topics.root?.children).toEqual(
      fixtureDocument.topics.root?.children,
    )
    await shortcut('z')
    await browser.waitUntil(async () => {
      const restored = await readDocument(name)
      return (restored.sheets[0]?.document.topics.root?.style?.offsetX ?? 0) === 0
    })
    await browser.waitUntil(async () => Math.abs((await root().getLocation()).x - before.x) < 3)
  }
  // A leaf gesture exercises the indexed target finder; moving the root excludes every target.
  await focusNativeWindow()
  await waitNativeCanvasQuiet()
  const leaf = await nativePerformanceGesture('leaf')
  try {
    const sample = await previewNativeCanvasDrag(leaf.start, leaf.end, leaf.id)
    expect(sample.changed).toBe(true)
    console.info('Native 2D leaf drag sample', sample)
    samples.push({ kind: 'leaf-drag', run: 0, ...sample })
  } finally {
    await finishNativeCanvasDrag(leaf.end)
  }
  await browser.waitUntil(async () => {
    const saved = await readDocument(name)
    return Math.abs(saved.sheets[0]?.document.topics[leaf.id]?.style?.offsetX ?? 0) > 1
  })
  const leafMoved = await readDocument(name)
  expect(
    Object.fromEntries(
      Object.values(leafMoved.sheets[0]?.document.topics ?? {}).map(({ id, children }) => [
        id,
        children,
      ]),
    ),
  ).toEqual(
    Object.fromEntries(
      Object.values(fixtureDocument.topics).map(({ id, children }) => [id, children]),
    ),
  )
  await shortcut('z')
  await browser.waitUntil(async () => {
    const restored = await readDocument(name)
    return (restored.sheets[0]?.document.topics[leaf.id]?.style?.offsetX ?? 0) === 0
  })
  await writeFile(
    await nativeArtifact('brainstorming-2d-performance.json'),
    JSON.stringify(samples, null, 2),
  )
  await browser.saveScreenshot(await nativeArtifact('brainstorming-2d-performance.png'))
})
