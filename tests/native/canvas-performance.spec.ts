import { browser, expect } from '@wdio/globals'
import { writeFile } from 'node:fs/promises'
import { createFixtureDocument, createWorkbook, serializeWorkbook } from '@core'
import { nativeArtifact } from '@tests/native/artifacts'
import { previewNativeCanvasDrag, finishNativeCanvasDrag } from '@tests/native/canvas-drag'
import {
  artifact,
  chooseFile,
  home,
  native,
  named,
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
  const document = createFixtureDocument(1000)
  const source = createWorkbook(document)
  const sheet = source.sheets[0]
  if (!sheet) throw new Error('Missing fixture sheet')
  const workbook = { ...source, sheets: [{ ...sheet, document }] }
  const name = artifact('large-2d')
  const path = await chooseFile('save', name)
  await native('saveDocument', {
    request: { path: null, contents: serializeWorkbook(workbook), suggestedName: name },
  })
  await native('releaseDocument', { path })
  await openSaved(name)
  await expect(browser.$('[data-canvas-loading]')).not.toExist()
  await expect(browser.$('[data-view-mode="2d"]')).toBeDisplayed()
  await expect(root()).toBeDisplayed()
  await focusNativeWindow()
  const samples = []
  for (const kind of ['pan', 'zoom'] as const) {
    for (let run = 0; run < 3; run += 1) {
      await named('适应画布').click()
      let previous: string | null = null
      await browser.waitUntil(async () => {
        const current = await browser.$('.react-flow__viewport').getAttribute('style')
        const settled = current !== null && current === previous
        previous = current
        return settled
      })
      await focusNativeWindow()
      const sample = await sampleNavigation(kind)
      console.info('Native 2D sample', { kind, run, ...sample })
      expect(sample.changed).toBe(true)
      expect(sample.mounted).toBeGreaterThan(0)
      expect(Number.isFinite(sample.fps)).toBe(true)
      samples.push({ kind, run, ...sample })
    }
  }
  await shortcut('r')
  await expect(root()).toBeDisplayed()
  let last = { x: Infinity, y: Infinity }
  await browser.waitUntil(async () => {
    const current = await root().getLocation()
    const settled = Math.abs(current.x - last.x) < 0.1 && Math.abs(current.y - last.y) < 0.1
    last = current
    return settled
  })
  const before = await root().getLocation()
  const size = await root().getSize()
  const edge = () => browser.$('.react-flow__edge path.react-flow__edge-path')
  const previousPath = await edge().getAttribute('d')
  if (!previousPath) throw new Error('Missing structural edge path')
  const x = Math.round(before.x + size.width / 2),
    y = Math.round(before.y + size.height / 2)
  await focusNativeWindow()
  const end = { x: x + 120, y: y + 70 }
  try {
    const dragSample = await previewNativeCanvasDrag({ x, y }, end)
    console.info('Native 2D drag sample', dragSample)
    expect(dragSample.changed).toBe(true)
    samples.push({ kind: 'drag', run: 0, ...dragSample })
    await expect(edge()).not.toHaveAttribute('d', previousPath)
  } finally {
    await finishNativeCanvasDrag(end)
  }
  await browser.waitUntil(async () => {
    const actual = await readDocument(name)
    return Math.abs(actual.sheets[0]?.document.topics.root?.style?.offsetX ?? 0) > 1
  })
  const moved = await readDocument(name)
  expect(Object.keys(moved.sheets[0]?.document.topics ?? {})).toHaveLength(1000)
  expect(moved.sheets[0]?.document.topics.root?.children).toEqual(document.topics.root?.children)
  await shortcut('z')
  await browser.waitUntil(async () => {
    const restored = await readDocument(name)
    return (restored.sheets[0]?.document.topics.root?.style?.offsetX ?? 0) === 0
  })
  await browser.waitUntil(async () => Math.abs((await root().getLocation()).x - before.x) < 3)
  // A leaf gesture exercises the indexed target finder; moving the root excludes every target.
  const leaf = await browser.execute(() => {
    for (const node of window.document.querySelectorAll<HTMLElement>('.react-flow__node-topic')) {
      const id = node.dataset.id
      if (!id?.startsWith('topic-') || Number(id.split('-')[1]) < 250) continue
      const rect = node.getBoundingClientRect()
      const x = rect.x + rect.width / 2,
        y = rect.y + rect.height / 2
      if (x < 120 || x > innerWidth - 120 || y < 140 || y > innerHeight - 200) continue
      const end = { x: x < innerWidth / 2 ? 160 : innerWidth - 160, y: 180 }
      if (window.document.elementFromPoint(end.x, end.y)?.closest('.react-flow__node')) continue
      return { id, start: { x, y }, end }
    }
    return null
  })
  if (!leaf) throw new Error('No visible leaf for the thousand-topic drag check')
  await focusNativeWindow()
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
