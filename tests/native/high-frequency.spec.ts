import { browser, expect } from '@wdio/globals'
import { writeFile } from 'node:fs/promises'
import { createFixtureDocument, createWorkbook, serializeWorkbook } from '@core'
import { nativeArtifact } from '@tests/native/artifacts'
import { finishNativeCanvasDrag, previewNativeCanvasDrag } from '@tests/native/canvas-drag'
import {
  nativePerformanceGesture,
  waitNativeCanvasQuiet,
} from '@tests/native/canvas-performance-geometry'
import { sampleHighFrequencyNavigation } from '@tests/native/high-frequency-navigation'
import { sampleHighFrequencySelection } from '@tests/native/high-frequency-selection'
import {
  artifact,
  chooseFile,
  focusNativeWindow,
  home,
  native,
  openSaved,
  readDocument,
  root,
  shortcut,
} from '@tests/native/driver'

for (const mode of ['2d'] as const) {
  it(`renders burst navigation, dragging and selection on a thousand-topic native ${mode} map`, async () => {
    await home()
    const document = { ...createFixtureDocument(1000), id: artifact('fixture') }
    const name = artifact(`high-frequency-${mode}`)
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
    await focusNativeWindow()
    await expect(browser.$('[data-canvas-loading]')).not.toExist({ wait: 15_000 })
    await expect(browser.$(`[data-view-mode="${mode}"]`)).toBeDisplayed()
    await focusNativeWindow()
    await expect(browser.$('[data-canvas-loading]')).not.toExist({ wait: 15_000 })
    const navigation: Awaited<ReturnType<typeof sampleHighFrequencyNavigation>>[] = []
    const dragging: Awaited<ReturnType<typeof previewNativeCanvasDrag>>[] = []
    const report: { selection?: Awaited<ReturnType<typeof sampleHighFrequencySelection>> } = {}
    const persist = async () =>
      writeFile(
        await nativeArtifact(`brainstorming-high-frequency-${mode}.json`),
        JSON.stringify({ mode, nodeCount: 1000, navigation, dragging, ...report }, null, 2),
      )
    for (const burst of [1, 4] as const) {
      await expect(browser.$(`[data-view-mode="${mode}"]`)).toBeDisplayed()
      await browser.$('button[aria-label="适应画布"]').click()
      await focusNativeWindow()
      await waitNativeCanvasQuiet()
      const sample = await sampleHighFrequencyNavigation(burst)
      navigation.push(sample)
      await persist()
      expect(sample.durationMs).toBeGreaterThanOrEqual(4000)
      expect(sample.eventCount).toBe(sample.frames.length * burst)
      expect(sample.nodeUpdatesFps).toBeGreaterThan(0)
      for (const kind of ['pan', 'zoom'] as const)
        expect(
          sample.phases
            .filter((phase) => phase.kind === kind)
            .reduce((sum, phase) => sum + phase.semanticUpdates, 0),
        ).toBeGreaterThan(0)
      expect(sample.viewportUpdatesFps).toBeGreaterThan(0)
      console.info(`Native ${mode} synthetic burst navigation`, {
        burst,
        ...sample,
        frames: undefined,
      })

      const epoch = await browser.execute(() => performance.timeOrigin)
      await shortcut('r')
      expect(await browser.execute(() => performance.timeOrigin)).toBe(epoch)
      await expect(browser.$(`[data-view-mode="${mode}"]`)).toBeDisplayed()
      await expect(root()).toBeDisplayed()
      await focusNativeWindow()
      await waitNativeCanvasQuiet()
      const gesture = await nativePerformanceGesture('root')
      try {
        const drag = await previewNativeCanvasDrag(
          gesture.start,
          gesture.end,
          gesture.id,
          60,
          burst,
        )
        dragging.push(drag)
        await persist()
        expect(drag.changed).toBe(true)
        expect(drag.updatedFrames).toBeGreaterThan(0)
        expect(drag.eventCount).toBe(60 * burst)
        expect(Math.abs(drag.screenDelta.x - drag.expectedDelta.x)).toBeLessThan(12)
        expect(Math.abs(drag.screenDelta.y - drag.expectedDelta.y)).toBeLessThan(12)
      } finally {
        await finishNativeCanvasDrag(gesture.end)
      }
      await browser.waitUntil(async () => {
        const saved = await readDocument(name)
        return Math.abs(saved.sheets[0]?.document.topics.root?.style?.offsetX ?? 0) > 1
      })
      const moved = await readDocument(name)
      expect(Object.keys(moved.sheets[0]?.document.topics ?? {})).toHaveLength(1000)
      expect(moved.sheets[0]?.document.topics.root?.children).toEqual(
        document.topics.root?.children,
      )
      await shortcut('z')
      await expect(browser.$(`[data-view-mode="${mode}"]`)).toBeDisplayed()
      await browser.waitUntil(async () => {
        const saved = await readDocument(name)
        return (saved.sheets[0]?.document.topics.root?.style?.offsetX ?? 0) === 0
      })
    }
    await browser.$('button[aria-label="适应画布"]').click()
    await focusNativeWindow()
    await waitNativeCanvasQuiet()
    const selection = await sampleHighFrequencySelection()
    report.selection = selection
    await persist()
    expect(selection.matched).toBe(selection.events)
    expect(selection.actualChanges).toBeGreaterThan(20)
    console.info(`Native ${mode} synthetic burst interaction`, { dragging, selection })
    await browser.saveScreenshot(await nativeArtifact(`brainstorming-high-frequency-${mode}.png`))
  })
}
