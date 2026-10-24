import { browser, expect } from '@wdio/globals'
import { writeFile } from 'node:fs/promises'
import { nativeArtifact } from '@tests/native/artifacts'
import { ensureProperties, focusNativeWindow, shortcut } from '@tests/native/driver'
import {
  openIndependentFixture,
  quietIndependentSpatial,
  waitIndependentSpatial,
} from '@tests/native/independent-spatial'
import { waitNativeCanvasQuiet } from '@tests/native/canvas-performance-geometry'
import { sampleKeyboardSelection } from '@tests/native/selection-keyboard'
import { sampleHighFrequencySelection } from '@tests/native/high-frequency-selection'

it('measures thousand-topic selection with closed and open properties in both independent canvases', async () => {
  await openIndependentFixture(1000)
  const reports: unknown[] = []
  const persist = async () =>
    writeFile(
      await nativeArtifact('brainstorming-selection-performance.json'),
      JSON.stringify(reports, null, 2),
    )
  for (const mode of ['2d', '3d'] as const) {
    await browser.$(`button[aria-label="${mode === '2d' ? '二维视图' : '三维视图'}"]`).click()
    await expect(browser.$('[data-canvas-loading]')).not.toExist({ wait: 20_000 })
    if (mode === '3d') await waitIndependentSpatial()
    for (const properties of [false, true]) {
      if (properties) await ensureProperties()
      else if (await browser.$('button[aria-label="关闭属性面板"]').isExisting())
        await browser.$('button[aria-label="关闭属性面板"]').click()
      await shortcut('r')
      await browser.$('button[aria-label="适应画布"]').click()
      await focusNativeWindow()
      if (mode === '3d') await quietIndependentSpatial()
      else await waitNativeCanvasQuiet()
      for (let repeat = 0; repeat < 3; repeat += 1) {
        const selection = await sampleKeyboardSelection(mode)
        reports.push({ mode, properties, repeat, selection })
        await persist()
        expect(selection.matched).toBe(selection.events)
        expect(selection.rendered).toBe(selection.events)
        console.info('Native keyboard selection', {
          mode,
          properties,
          repeat,
          ...selection,
          samples: undefined,
        })
      }
      if (mode === '2d') {
        const click = await sampleHighFrequencySelection()
        reports.push({ mode, properties, click })
        await persist()
        expect(click.matched).toBe(click.events)
      }
    }
  }
})
