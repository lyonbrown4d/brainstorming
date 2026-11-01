import { browser, expect } from '@wdio/globals'
import { Key } from 'webdriverio'
import {
  artifact,
  closeSaved,
  dockAction,
  editor,
  ensureProperties,
  home,
  named,
  openSaved,
  root,
  rootHasText,
  save,
} from '@tests/native/driver'
import { editorReady } from '@tests/native/readiness'
import {
  chooseNativeOption,
  dragNativeControl,
  openWorkflowFixture,
  renderedBox,
  saveWorkflowFixture,
  settledNativeControl,
} from '@tests/native/interaction-workflows'

const source = () => browser.$('[data-testid="topic-source"]')
const other = () => browser.$('[data-testid="topic-other"]')
const fill = (id: string) =>
  browser.execute((topicId) => {
    const element = document.querySelector(`[data-testid="topic-${topicId}"]`)
    if (!element) throw new Error('Missing styled native topic')
    return getComputedStyle(element).getPropertyValue('--topic-fill')
  }, id)

describe('native direct editing and workbench workflows', () => {
  it('quick blank immediately accepts typing and Tab, nearby add focuses, and docks pin independently', async () => {
    await home()
    await named('空白导图').click()
    await expect(editor()).toBeFocused()
    // No click or focus repair: the creation flow must place the caret itself.
    await editor().addValue('原生空白直写')
    await browser.keys(Key.Tab)
    await expect(editor()).toBeFocused()
    await editor().addValue('原生第一个想法')
    await browser.keys(Key.Enter)
    await editorReady('原生空白直写')
    await expect(browser.$$('.react-flow__node-topic')).toBeElementsArrayOfSize(2)
    await named('在此主题后添加同级主题').click()
    await expect(editor()).toBeFocused()
    await editor().addValue('原生邻近新增')
    await browser.keys(Key.Enter)
    await expect(browser.$$('.react-flow__node-topic')).toBeElementsArrayOfSize(3)

    const top = () => named('展开导图标签栏')
    const bottom = () => named('展开浮动工具栏')
    await top().click()
    if (await named('自动收起文档标签').isDisplayed()) await named('自动收起文档标签').click()
    await top().click()
    await named('固定文档标签').click()
    await bottom().click()
    if (await named('自动收起画布工具栏').isDisplayed()) await named('自动收起画布工具栏').click()
    await named('文件菜单').moveTo()
    await browser.keys(Key.Escape)
    await expect(top()).toHaveAttribute('aria-expanded', 'true')
    await expect(bottom()).toHaveAttribute('aria-expanded', 'false')
    await bottom().click()
    await named('固定画布工具栏').click()
    await named('自动收起文档标签').click()
    await named('文件菜单').moveTo()
    await browser.keys(Key.Escape)
    await expect(top()).toHaveAttribute('aria-expanded', 'false')
    await expect(bottom()).toHaveAttribute('aria-expanded', 'true')
    const name = artifact('quick-blank-native')
    const saved = await save(name)
    const document = saved.sheets[0]?.document
    expect(document?.topics.root?.title).toBe('原生空白直写')
    expect(document?.topics.root?.children).toHaveLength(2)
    expect(Object.values(document?.topics ?? {}).map((topic) => topic.title)).toContain(
      '原生邻近新增',
    )
    await closeSaved()
    await openSaved(name)
    await editorReady('原生空白直写')
    await rootHasText('原生空白直写')
    await expect(bottom()).toHaveAttribute('aria-expanded', 'true')
    await named('自动收起画布工具栏').click()
  })

  it('both width grips cancel and undo once, preserve text scale, and persist the committed width', async () => {
    const fixture = await openWorkflowFixture()
    await source().click()
    await ensureProperties()
    await named('聚焦选中主题').click()
    const width = () => browser.$('input[aria-label="主题宽度"]')
    const scale = () => browser.$('input[aria-label="主题缩放"]')
    await expect(width()).toHaveValue('260')
    await expect(scale()).toHaveValue('125')
    const font = await source().$('.topic-title').getCSSProperty('font-size')
    for (const side of ['right', 'left'] as const) {
      const grip = `.react-flow__node[data-id="source"] .topic-width-${side}`
      await expect(browser.$(grip)).toBeDisplayed()
      await settledNativeControl(grip)
      const original = await renderedBox('.react-flow__node[data-id="source"]')
      await dragNativeControl(grip, { dx: side === 'left' ? -50 : 50 }, { cancel: true })
      await expect(width()).toHaveValue('260')
      await browser.waitUntil(
        async () =>
          Math.abs(
            (await renderedBox('.react-flow__node[data-id="source"]')).width - original.width,
          ) < 1,
      )
      await dragNativeControl(grip, { dx: side === 'left' ? -50 : 50 })
      await browser.waitUntil(async () => Number(await width().getValue()) > 260)
      await expect(scale()).toHaveValue('125')
      expect((await source().$('.topic-title').getCSSProperty('font-size')).value).toBe(font.value)
      await dockAction('撤销')
      await expect(width()).toHaveValue('260')
    }
    await dragNativeControl('.react-flow__node[data-id="source"] .topic-width-right', { dx: 40 })
    await browser.waitUntil(async () => Number(await width().getValue()) > 260)
    const committed = Number(await width().getValue())
    const saved = await saveWorkflowFixture(
      fixture.name,
      (document) => document.topics.source?.style?.width === committed,
    )
    expect(saved.topics.source?.style).toEqual(
      expect.objectContaining({ width: committed, scale: 1.25, fontSize: 16 }),
    )
    await closeSaved()
    await openSaved(fixture.name)
    await editorReady('原生工作流')
    await source().click()
    await ensureProperties()
    await expect(width()).toHaveValue(String(committed))
    await expect(scale()).toHaveValue('125')
  })

  it('copies and undoes topic style, filters only the projection, and saves every topic intact', async () => {
    const fixture = await openWorkflowFixture()
    await source().click()
    await ensureProperties()
    const original = await fill('other')
    const copied = await fill('source')
    expect(copied).not.toBe(original)
    await named('复制主题样式').scrollIntoView()
    await named('复制主题样式').click()
    await other().click()
    await named('粘贴样式到选中主题（1）').scrollIntoView()
    await named('粘贴样式到选中主题（1）').click()
    await browser.waitUntil(async () => (await fill('other')) === copied)
    await dockAction('撤销')
    await browser.waitUntil(async () => (await fill('other')) === original)
    await dockAction('重做')
    await browser.waitUntil(async () => (await fill('other')) === copied)
    await dockAction('主题筛选')
    await browser.$('[role="combobox"][aria-label="画布显示"]').click()
    await chooseNativeOption('只显示匹配主题与祖先')
    await browser.$('[role="combobox"][aria-label="筛选标签"]').click()
    await chooseNativeOption('原生重点')
    await browser.keys(Key.Escape)
    await expect(other()).not.toExist()
    await expect(source()).toBeDisplayed()
    await expect(root()).toBeDisplayed()
    await named('退出筛选').click()
    await expect(other()).toBeDisplayed()
    // Projection changes do not consume an undo slot: the next undo restores target style.
    await dockAction('撤销')
    await browser.waitUntil(async () => (await fill('other')) === original)
    const document = await saveWorkflowFixture(
      fixture.name,
      (value) => value.topics.other?.style?.fill === '#f5e4d4',
    )
    expect(Object.keys(document.topics).sort()).toEqual(['other', 'root', 'source'])
    expect(document.topics.source?.metadata?.labels).toEqual(['原生重点'])
    expect(document.topics.other?.title).toBe('原生目标主题')
    expect(document.topics.other?.style?.fill).toBe('#f5e4d4')
  })
})
