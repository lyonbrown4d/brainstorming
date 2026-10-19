import { browser, expect } from '@wdio/globals'
import { Key } from 'webdriverio'
import { deserializeWorkbook } from '@core'
import {
  artifact,
  fillContentEditable,
  chooseFile,
  create,
  editor,
  fileAction,
  home,
  named,
  readDocument,
  recovery,
  reloadNativePage,
  renameRoot,
  root,
  rootHasText,
  save,
} from '@tests/native/driver'

describe('native document autosave', () => {
  beforeEach(async () => {
    await home()
  })

  it('writes a live Chinese draft without stealing focus and writes committed content after cancellation', async () => {
    await create('自动保存原文')
    const name = artifact('autosave-draft')
    await save(name)
    await root().click()
    await browser.keys(Key.F2)
    await fillContentEditable(editor(), '中文未提交草稿')
    const selection = await browser.execute(() => {
      const active = document.activeElement
      if (!(active instanceof HTMLElement)) throw new Error('Missing active Lexical editor')
      active.setAttribute('data-autosave-session', 'retained')
      const range = document.getSelection()
      return { anchor: range?.anchorOffset, focus: range?.focusOffset }
    })
    await browser.waitUntil(
      async () => (await readDocument(name)).sheets[0]?.document.title === '中文未提交草稿',
    )
    await expect(editor()).toBeFocused()
    await expect(editor()).toHaveAttribute('data-autosave-session', 'retained')
    expect(
      await browser.execute(() => {
        const range = document.getSelection()
        return { anchor: range?.anchorOffset, focus: range?.focusOffset }
      }),
    ).toEqual(selection)
    // The embedded driver inserts Chinese text without a native IME session.
    // Partial synthetic composition events leave WebKit/Lexical in an invalid lifecycle.
    await browser.keys(Key.Escape)
    await rootHasText('自动保存原文')
    await browser.waitUntil(
      async () => (await readDocument(name)).sheets[0]?.document.title === '自动保存原文',
    )
    await renameRoot('取消后继续编辑')
    await browser.waitUntil(
      async () => (await readDocument(name)).sheets[0]?.document.title === '取消后继续编辑',
    )
  })

  it('keeps unnamed tabs out of workspace recovery and loses them on reload', async () => {
    await create('有路径的导图')
    const name = artifact('autosave-named')
    const workbook = await save(name)
    await renameRoot('后台命名文档修改')
    await fileAction('新建导图')
    await create('只留在内存')
    await renameRoot('未命名内容不会恢复')
    await browser.waitUntil(async () => {
      const records = await recovery()
      return records.some(
        (record) =>
          record.contents &&
          deserializeWorkbook(record.contents).sheets[0]?.document.title === '后台命名文档修改',
      )
    })
    const records = await recovery()
    expect(records).toHaveLength(1)
    expect(deserializeWorkbook(records[0]?.contents ?? '').id).toBe(workbook.id)
    expect((await readDocument(name)).sheets[0]?.document.title).toBe('后台命名文档修改')
    await reloadNativePage()
    await expect(named('恢复上次打开的 1 份导图')).toBeDisplayed()
    await named('恢复上次打开的 1 份导图').click()
    await rootHasText('后台命名文档修改')
    await named('展开导图标签栏').click()
    await expect(
      browser.$$('[role="tablist"][aria-label="打开的导图"] [role="tab"]'),
    ).toBeElementsArrayOfSize(1)
  })

  it('rejects Save As over another open file and allows the same destination after reload', async () => {
    await create('占用目标文档')
    const destination = artifact('autosave-owned-destination')
    const original = await save(destination)
    await fileAction('新建导图')
    await create('另存为来源文档')
    const source = artifact('autosave-owned-source')
    const other = await save(source)
    await chooseFile('save', destination)
    await fileAction('另存为')
    await expect(browser.$('.error-banner[role="alert"]')).toHaveText(
      expect.stringContaining('其他导图标签'),
    )
    expect((await readDocument(destination)).id).toBe(original.id)
    expect((await readDocument(source)).id).toBe(other.id)
    await named('展开导图标签栏').click()
    await expect(
      browser.$$('[role="tablist"][aria-label="打开的导图"] [role="tab"]'),
    ).toBeElementsArrayOfSize(2)
    await home()
    await create('重载后新文档')
    await chooseFile('save', destination)
    await fileAction('另存为')
    await browser.waitUntil(
      async () => (await readDocument(destination)).sheets[0]?.document.title === '重载后新文档',
    )
    expect((await readDocument(destination)).id).not.toBe(original.id)
    expect((await readDocument(source)).id).toBe(other.id)
  })
})
