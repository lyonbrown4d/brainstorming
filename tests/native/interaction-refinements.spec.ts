import { browser, expect } from '@wdio/globals'
import { Key } from 'webdriverio'
import {
  artifact,
  closeSaved,
  create,
  dockAction,
  editor,
  ensureProperties,
  fillContentEditable,
  home,
  named,
  openSaved,
  root,
  save,
} from '@tests/native/driver'

describe('native document geometry and summary persistence', () => {
  it('saves and reopens manual width and a real summary subtree through SQLite', async () => {
    await home()
    await create('宽度与概要验收')
    await root().click()
    await ensureProperties()
    const width = browser.$('input[aria-label="主题宽度"]')
    await width.scrollIntoView()
    await width.setValue('240')
    await browser.keys(Key.Enter)
    await expect(width).toHaveValue('240')
    await expect(named('适应内容')).toBeEnabled()
    await root().click()
    await browser.keys(Key.Tab)
    await fillContentEditable(editor(), '保存范围主题')
    const sourceId = await browser.$('.react-flow__node-topic.selected').getAttribute('data-id')
    if (!sourceId) throw new Error('Missing newly created source topic')
    await named('适应画布').click()
    await browser.$(`.react-flow__node[data-id="${sourceId}"]`).click()
    await dockAction('添加概要')
    await fillContentEditable(editor(), '保存概要')
    await browser.keys(Key.Tab)
    await fillContentEditable(editor(), '概要子主题')
    await named('适应画布').click()
    const name = artifact('manual-width-summary')
    const saved = await save(name)
    const document = saved.sheets[0]?.document
    if (!document) throw new Error('Missing saved sheet')
    expect(document.topics[document.rootId]?.style?.width).toBe(240)
    const group = document.groups?.find((item) => item.summaryTopicId !== undefined)
    const summaryId = group?.summaryTopicId
    if (!summaryId) throw new Error('Saved summary lost its topic reference')
    expect(group.topicIds).toContain(sourceId)
    expect(document.topics[summaryId]?.title).toBe('保存概要')
    const childId = document.topics[summaryId]?.children[0]
    if (!childId) throw new Error('Saved summary lost its child')
    expect(document.topics[childId]?.title).toBe('概要子主题')
    await closeSaved()
    await openSaved(name)
    await expect(browser.$(`.react-flow__node[data-id="${summaryId}"]`)).toHaveText('保存概要')
    await expect(browser.$(`.react-flow__node[data-id="${childId}"]`)).toHaveText('概要子主题')
    await root().click()
    await ensureProperties()
    await expect(width).toHaveValue('240')
  })
})
