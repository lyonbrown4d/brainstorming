import { browser, expect } from '@wdio/globals'
import { Key } from 'webdriverio'
import { dockAction, fillContentEditable, named, shortcut } from '@tests/native/driver'
import { editorReady } from '@tests/native/readiness'
import { nativeArtifact } from '@tests/native/artifacts'
import {
  dragNativeControl,
  openWorkflowFixture,
  saveWorkflowFixture,
} from '@tests/native/interaction-workflows'

const workspace = () => browser.$('[data-outline-workspace]')
const row = (id: string) => workspace().$(`[data-outline-topic="${id}"]`)
const title = () => workspace().$('[role="textbox"][aria-label="大纲主题名称"]')
const undo = () => workspace().$('button[aria-label="撤销"]').click()

describe('native outline workspace and Rust topology history', () => {
  it('edits with Enter/Tab, cancels a real subtree drag, undoes a drop, and saves topology', async () => {
    const fixture = await openWorkflowFixture()
    await dockAction('大纲编辑')
    await expect(workspace()).toBeDisplayed()
    await row('source').$('button=原生来源主题').doubleClick()
    await expect(title()).toBeFocused()
    await fillContentEditable(title(), '原生大纲编辑')
    await browser.keys(Key.Enter)
    await expect(row('source')).toHaveText(expect.stringContaining('原生大纲编辑'))
    await expect(title()).toBeFocused()
    const id = await workspace()
      .$('[data-outline-topic]:has([contenteditable="true"])')
      .getAttribute('data-outline-topic')
    if (!id) throw new Error('Native Enter did not create a sibling outline row')
    await expect(row(id)).toHaveAttribute('data-outline-parent', 'root')
    await fillContentEditable(title(), '原生大纲新增')
    await browser.keys(Key.Tab)
    await expect(row(id)).toHaveAttribute('data-outline-parent', 'source')
    await expect(title()).toBeFocused()
    await browser.keys(Key.Escape)
    await undo()
    await expect(row(id)).toHaveAttribute('data-outline-parent', 'root')
    await workspace().$('button[aria-label="重做"]').click()
    await expect(row(id)).toHaveAttribute('data-outline-parent', 'source')

    const grip = '[data-outline-topic="other"] button[aria-label="拖动主题：原生目标主题"]'
    const zone = '[data-outline-topic="source"] [data-outline-drop="inside"]'
    const held = async () => {
      await expect(browser.$(zone)).toHaveAttribute('data-drop-active', 'true')
    }
    await dragNativeControl(grip, { selector: zone }, { cancel: true, held })
    await expect(row('other')).toHaveAttribute('data-outline-parent', 'root')
    await dragNativeControl(grip, { selector: zone }, { held })
    await expect(row('other')).toHaveAttribute('data-outline-parent', 'source')
    await shortcut('z')
    await expect(row('other')).toHaveAttribute('data-outline-parent', 'root')
    await expect(row(id)).toHaveAttribute('data-outline-parent', 'source')
    await browser.saveScreenshot(await nativeArtifact('brainstorming-outline-workspace.png'))
    await named('返回画布').click()
    await expect(workspace()).not.toExist()
    await editorReady('原生工作流')
    const document = await saveWorkflowFixture(
      fixture.name,
      (value) =>
        value.topics.source?.title === '原生大纲编辑' &&
        value.topics.source.children[0] === id &&
        value.topics.other?.children.length === 0 &&
        value.topics.root?.children.includes('other') === true,
    )
    expect(document.topics.source?.title).toBe('原生大纲编辑')
    expect(document.topics.source?.children).toEqual([id])
    expect(document.topics[id]?.title).toBe('原生大纲新增')
    expect(document.topics.root?.children).toEqual(['source', 'other'])
  })
})
