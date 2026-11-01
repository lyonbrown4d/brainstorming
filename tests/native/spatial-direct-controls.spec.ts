import { browser, expect } from '@wdio/globals'
import { Key } from 'webdriverio'
import { nativeArtifact } from '@tests/native/artifacts'
import {
  closeSaved,
  dockAction,
  editor,
  ensureProperties,
  named,
  openSaved,
} from '@tests/native/driver'
import {
  chooseNativeOption,
  dragNativeControl,
  openWorkflowFixture,
  renderedBox,
  saveWorkflowFixture,
  settledNativeControl,
} from '@tests/native/interaction-workflows'
import {
  clickIndependentTopic,
  quietIndependentSpatial,
  readIndependentSpatial,
  waitIndependentSpatial,
} from '@tests/native/independent-spatial'

const controls = '[data-spatial-topic-controls]'
const preview = '[data-spatial-width-preview]'
const width = () => browser.$('input[aria-label="主题宽度"]')
const scale = () => browser.$('input[aria-label="主题缩放"]')
const grip = (side: 'left' | 'right') =>
  `${controls} button[aria-label="${side === 'left' ? '从左侧拖动调整主题宽度' : '拖动调整主题宽度'}"]`

const enterSpatial = async () => {
  await named('三维视图').click()
  await waitIndependentSpatial()
  await named('适应画布').click()
  await quietIndependentSpatial()
}

describe('native independent spatial direct controls', () => {
  it('drags both width grips with trusted input, cancels, undoes once, and preserves saved scale', async () => {
    const fixture = await openWorkflowFixture()
    await enterSpatial()
    await clickIndependentTopic('source')
    await ensureProperties()
    await named('聚焦选中主题').click()
    await quietIndependentSpatial()
    await clickIndependentTopic('source')
    await expect(width()).toHaveValue('260')
    await expect(scale()).toHaveValue('125')
    await expect(browser.$$('.react-flow')).toBeElementsArrayOfSize(0)
    for (const side of ['left', 'right'] as const) {
      await expect(browser.$(grip(side))).toBeDisplayed()
      await settledNativeControl(grip(side))
      const original = (await readIndependentSpatial()).rectangles.find(
        (item) => item.id === 'source',
      )
      if (!original) throw new Error('The source topic is missing from the ready Three projection')
      const drag = { dx: side === 'left' ? -45 : 45 }
      await dragNativeControl(grip(side), drag, {
        cancel: true,
        held: async () => {
          await expect(browser.$(preview)).toBeDisplayed()
          const box = await renderedBox(preview)
          expect(box.width).toBeGreaterThan(original.width + 20)
          expect(side === 'left' ? box.x + box.width : box.x).toBeCloseTo(
            side === 'left' ? original.x + original.width : original.x,
            0,
          )
          expect(
            (await browser.$(`${preview} .topic-title`).getCSSProperty('font-size')).value,
          ).toBe('16px')
          await expect(scale()).toHaveValue('125')
        },
      })
      await expect(browser.$(preview)).not.toExist()
      await expect(width()).toHaveValue('260')
      const restored = (await readIndependentSpatial()).rectangles.find(
        (item) => item.id === 'source',
      )
      expect(restored?.width).toBeCloseTo(original.width, 0)
      expect(restored?.x).toBeCloseTo(original.x, 0)
      await dragNativeControl(grip(side), drag)
      await browser.waitUntil(async () => Number(await width().getValue()) > 260)
      await expect(scale()).toHaveValue('125')
      await waitIndependentSpatial()
      await dockAction('撤销')
      await expect(width()).toHaveValue('260')
      await waitIndependentSpatial()
      await quietIndependentSpatial()
    }
    await dragNativeControl(grip('left'), { dx: -35 })
    await browser.waitUntil(async () => Number(await width().getValue()) > 260)
    const committed = Number(await width().getValue())
    const document = await saveWorkflowFixture(
      fixture.name,
      (value) => value.topics.source?.style?.width === committed,
    )
    expect(document.topics.source?.style).toEqual(
      expect.objectContaining({ width: committed, scale: 1.25, fontSize: 16 }),
    )
    expect(Object.keys(document.topics).sort()).toEqual(['other', 'root', 'source'])
    await closeSaved()
    await openSaved(fixture.name)
    await waitIndependentSpatial()
    await quietIndependentSpatial()
    await clickIndependentTopic('source')
    await ensureProperties()
    await expect(width()).toHaveValue(String(committed))
    await expect(scale()).toHaveValue('125')
    await browser.saveScreenshot(await nativeArtifact('brainstorming-spatial-direct-width.png'))
  })

  it('nearby child and sibling creation focus the title, and filtering exits without deleting 3D content', async () => {
    const fixture = await openWorkflowFixture()
    await enterSpatial()
    await clickIndependentTopic('source')
    await named('在此主题下添加子主题').click()
    await expect(editor()).toBeFocused()
    const childId = await browser.$('[data-spatial-editor]').getAttribute('data-topic-id')
    if (!childId)
      throw new Error('Nearby child creation did not open the shared spatial title editor')
    // No click or focus repair: native nearby creation owns initial title selection.
    await editor().addValue('原生三维邻近子主题')
    await browser.keys(Key.Enter)
    await expect(editor()).not.toExist()
    await waitIndependentSpatial()
    await quietIndependentSpatial()
    await expect(named('在此主题后添加同级主题')).toBeDisplayed()
    await named('在此主题后添加同级主题').click()
    await expect(editor()).toBeFocused()
    const siblingId = await browser.$('[data-spatial-editor]').getAttribute('data-topic-id')
    if (!siblingId || siblingId === childId)
      throw new Error('Nearby sibling must create a distinct topic')
    await editor().addValue('原生三维邻近同级')
    await browser.keys(Key.Enter)
    await expect(editor()).not.toExist()
    await waitIndependentSpatial()
    const before = await saveWorkflowFixture(
      fixture.name,
      (document) =>
        document.topics[childId]?.title === '原生三维邻近子主题' &&
        document.topics[siblingId]?.title === '原生三维邻近同级',
    )
    expect(before.topics.source?.children).toEqual([childId, siblingId])
    expect((await readIndependentSpatial()).topicCount).toBe(5)
    await dockAction('主题筛选')
    await browser.$('[role="combobox"][aria-label="画布显示"]').click()
    await chooseNativeOption('只显示匹配主题与祖先')
    await browser.$('[role="combobox"][aria-label="筛选标签"]').click()
    await chooseNativeOption('原生重点')
    await browser.keys(Key.Escape)
    await waitIndependentSpatial()
    await browser.waitUntil(async () => (await readIndependentSpatial()).topicCount === 2)
    expect(
      (await readIndependentSpatial()).rectangles
        .filter((item) => item.kind === 'topic')
        .map((item) => item.id)
        .sort(),
    ).toEqual(['root', 'source'])
    await named('退出筛选').click()
    await waitIndependentSpatial()
    await browser.waitUntil(async () => (await readIndependentSpatial()).topicCount === 5)
    const after = await saveWorkflowFixture(
      fixture.name,
      (document) => Object.keys(document.topics).length === 5,
    )
    expect(after.topics).toEqual(before.topics)
    expect(after.topics.source?.metadata?.labels).toEqual(['原生重点'])
    expect(after.topics.source?.style?.scale).toBe(1.25)
    await browser.saveScreenshot(await nativeArtifact('brainstorming-spatial-filter-restored.png'))
    await named('二维视图').click()
    await expect(browser.$('[data-canvas-loading]')).not.toExist()
    await expect(browser.$$('.react-flow__node-topic')).toBeElementsArrayOfSize(5)
    await expect(browser.$(`[data-testid="topic-${childId}"]`)).toHaveText(
      expect.stringContaining('原生三维邻近子主题'),
    )
    await expect(browser.$(`[data-testid="topic-${siblingId}"]`)).toHaveText(
      expect.stringContaining('原生三维邻近同级'),
    )
  })
})
