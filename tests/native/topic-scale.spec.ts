import { browser, expect } from '@wdio/globals'
import { Key } from 'webdriverio'
import { nativeArtifact } from '@tests/native/artifacts'
import {
  artifact,
  closeSaved,
  create,
  dockAction,
  ensureProperties,
  home,
  named,
  openSaved,
  root,
  rootHasText,
  save,
} from '@tests/native/driver'

// ChromeDriver's element size is the CSS layout box, excluding transforms.
// Observe the rendered extent in canvas coordinates, including topic scale.
const renderedWidth = () =>
  browser.execute(() => {
    const topic = document.querySelector('[data-testid="topic-root"]')
    const viewport = document.querySelector('.react-flow__viewport')
    if (!topic || !viewport) throw new Error('The planar topic is not ready')
    return (
      topic.getBoundingClientRect().width / new DOMMatrix(getComputedStyle(viewport).transform).a
    )
  })

// Real IPC, command history and SQLite complement the canvas pointer tests.
describe('native proportional topic scale', () => {
  it('scales a topic once, restores history, and preserves its scale after reopening', async () => {
    await home()
    await create('整体缩放验收')
    await root().click()
    await expect(browser.$$('.react-flow__resize-control')).toBeElementsArrayOfSize(4)
    await ensureProperties()
    const scale = () => browser.$('input[aria-label="主题缩放"]')
    await expect(scale()).toHaveValue('100')
    const before = await renderedWidth()
    await scale().setValue('175')
    await browser.keys(Key.Enter)
    await expect(scale()).toHaveValue('175')
    await browser.waitUntil(async () => Math.abs((await renderedWidth()) / before - 1.75) < 0.02)
    await dockAction('撤销')
    await expect(scale()).toHaveValue('100')
    await dockAction('重做')
    await expect(scale()).toHaveValue('175')
    await browser.saveScreenshot(await nativeArtifact('brainstorming-native-topic-scale.png'))

    const name = artifact('topic-scale')
    const workbook = await save(name)
    const style = workbook.sheets[0]?.document.topics.root?.style
    expect(style?.scale).toBe(1.75)
    expect(style?.fontSize).toBeUndefined()
    expect(style?.width).toBeUndefined()
    await closeSaved()
    await openSaved(name)
    await rootHasText('整体缩放验收')
    await root().click()
    await ensureProperties()
    await expect(scale()).toHaveValue('175')
    await named('重置为 100%').click()
    await expect(scale()).toHaveValue('100')
    await browser.waitUntil(async () => Math.abs((await renderedWidth()) / before - 1) < 0.02)
    await dockAction('撤销')
    await expect(scale()).toHaveValue('175')
  })
})
