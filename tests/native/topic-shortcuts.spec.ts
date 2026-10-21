import { browser, expect } from '@wdio/globals'
import { Key } from 'webdriverio'
import { getParentId } from '@core'
import {
  artifact,
  create,
  dockAction,
  editor,
  fillContentEditable,
  home,
  named,
  root,
  save,
  shortcut,
} from '@tests/native/driver'

// Native keyboard dispatch and saved SQLite topology complement the pointer-level canvas tests.
describe('Xmind-style native topic editing', () => {
  it('creates children and siblings continuously and keeps text editing separate from node commands', async () => {
    await home()
    await create('快捷键验收')
    await root().click()
    await browser.keys(Key.Tab)
    await expect(editor()).toBeFocused()
    await fillContentEditable(editor(), '子主题 A')
    const firstId = await browser.$('.react-flow__node-topic.selected').getAttribute('data-id')
    if (!firstId) throw new Error('Missing first child topic')
    const firstTopic = browser.$(`.react-flow__node[data-id="${firstId}"] .topic-title`)
    await browser.keys(Key.Enter)
    await expect(editor()).not.toBeExisting()
    await expect(browser.$$('.react-flow__node-topic')).toBeElementsArrayOfSize(2)
    await shortcut('z')
    await expect(firstTopic).toHaveText('新主题')
    await dockAction('重做')
    await expect(firstTopic).toHaveText('子主题 A')
    await firstTopic.click()
    await browser.keys(Key.Enter)
    await expect(editor()).toHaveText('新主题')
    await expect(editor()).toBeFocused()
    await fillContentEditable(editor(), '同级 B')
    await browser.keys(Key.Tab)
    await expect(editor()).toHaveText('新主题')
    await fillContentEditable(editor(), '未提交文字')
    // The embedded driver omits modifiers on special keys. Real Shift+Enter is
    // covered by topic-interaction.spec.ts; keep this check on native hierarchy.
    await browser.keys(Key.Escape)
    await named('适应画布').click()
    const workbook = await save(artifact('native-topic-shortcuts'))
    const document = workbook.sheets[0]?.document
    if (!document) throw new Error('Saved native document is missing')
    const first = Object.values(document.topics).find((topic) => topic.title === '子主题 A')
    const second = Object.values(document.topics).find((topic) => topic.title === '同级 B')
    if (!first || !second) throw new Error('Continuous topic text was not saved')
    expect(document.topics[document.rootId]?.children).toEqual([first.id, second.id])
    expect(second.children).toHaveLength(1)
    expect(getParentId(document, second.children[0] ?? '')).toBe(second.id)
    expect(document.topics[second.children[0] ?? '']?.title).toBe('新主题')

    await browser.$(`[data-testid="topic-${second.id}"]`).click()
    await browser.keys(Key.Space)
    await expect(editor()).toHaveText('同级 B')
    await browser.keys(Key.Backspace)
    await expect(editor()).toHaveText('同级', { trim: true })
    await browser.keys(Key.Escape)
    await expect(browser.$(`[data-testid="topic-${second.id}"]`)).toHaveText(
      expect.stringContaining('同级 B'),
    )
    await shortcut('0')
    await expect(browser.$('[aria-label="画布视图"]')).toHaveText(expect.stringContaining('100%'))
    await shortcut('r')
    await expect(root()).toHaveElementClass('is-selected')
  })
})
