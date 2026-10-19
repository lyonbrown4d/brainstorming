import { nativeArtifact } from '@tests/native/artifacts'
import { browser, expect } from '@wdio/globals'
import { Key } from 'webdriverio'
import { validateTopicClipboard } from '@core'
import {
  artifact,
  chooseFile,
  closeSaved,
  create,
  dockAction,
  editor,
  fileAction,
  home,
  named,
  native,
  openSaved,
  root,
  rootHasText,
  textContains,
  renameRoot,
  save,
} from '@tests/native/driver'

// The same instrumented native executable, native IPC and SQLCipher are used in every flow.
// Only the OS picker choice is supplied by e2e_fixture; no DesktopAPI/document state is mocked.
describe('native editor and document workflow', () => {
  beforeEach(async () => {
    await home()
  })

  it('creates, edits Chinese topics, undoes/redoes, saves/reopens SQLite and preserves cancellation', async () => {
    await expect(browser.$$('button[aria-label^="选择"]')).toBeElementsArrayOfSize(15)
    await named('选择向下树形图').click()
    await create('原生创作')
    await renameRoot('中文原生保存')
    await dockAction('撤销')
    await rootHasText('原生创作')
    await dockAction('重做')
    await rootHasText('中文原生保存')
    await browser.saveScreenshot(await nativeArtifact('brainstorming-native-2d.png'))
    await root().click()
    await browser.keys(Key.Tab)
    await editor().setValue('子主题 A')
    await browser.keys(Key.Enter)
    const copiedId = await browser
      .$('.react-flow__node:not([data-id="root"])')
      .getAttribute('data-id')
    if (!copiedId) throw new Error('The new child topic has no native canvas identifier')
    await browser.$('.react-flow__node:not([data-id="root"]) .topic-title').click()
    await dockAction('复制主题')
    await browser.waitUntil(async () => {
      try {
        const raw = await native<string>('readTopicClipboard')
        const prefix = 'Brainstorming topics v1\n'
        if (!raw.startsWith(prefix)) return false
        const payload: unknown = JSON.parse(raw.slice(prefix.length))
        validateTopicClipboard(payload)
        return payload.roots.length === 1 && payload.roots[0] === copiedId
      } catch {
        return false
      }
    })
    await root().click()
    await dockAction('粘贴主题')
    await browser.waitUntil(
      async () =>
        (await browser.execute(
          () =>
            [...document.querySelectorAll('.topic-title')].filter(
              (title) => title.textContent.trim() === '子主题 A',
            ).length,
        )) === 2,
    )
    const name = artifact('editing')
    const workbook = await save(name)
    expect(workbook.sheets[0]?.document.settings?.layout).toBe('tree-down')
    expect(
      Object.values(workbook.sheets[0]?.document.topics ?? {}).map((topic) => topic.title),
    ).toContain('子主题 A')
    expect(
      Object.values(workbook.sheets[0]?.document.topics ?? {}).filter(
        (topic) => topic.title === '子主题 A',
      ),
    ).toHaveLength(2)
    await closeSaved()
    await openSaved(name)
    await rootHasText('中文原生保存')
    await textContains('.react-flow__nodes', '子主题 A')
    await chooseFile('open', name, true)
    await fileAction('打开导图')
    await expect(named('文件菜单')).toBeEnabled()
    await rootHasText('中文原生保存')
    await chooseFile('save', artifact('cancelled'), true)
    await fileAction('另存为')
    await expect(named('文件菜单')).toBeEnabled()
    await rootHasText('中文原生保存')
    await browser.saveScreenshot(await nativeArtifact('brainstorming-native-2d.png'))
  })

  it('keeps independent sheets and open documents with one-step sheet undo', async () => {
    await create('设计原稿')
    const firstSheet = await browser.$('.sheet-tab[aria-selected="true"]').getText()
    await named('新建画布').click()
    await named('选择垂直时间线').click()
    await named('下一步').click()
    await named('画布名称').setValue('发布排期')
    await named('创建画布').click()
    await expect(browser.$$('.sheet-tab')).toBeElementsArrayOfSize(2)
    await dockAction('撤销')
    await expect(browser.$$('.sheet-tab')).toBeElementsArrayOfSize(1)
    await dockAction('重做')
    await expect(browser.$$('.sheet-tab')).toBeElementsArrayOfSize(2)
    const original = await save(artifact('sheets'))
    expect(original.sheets.map((sheet) => sheet.name)).toEqual([firstSheet, '发布排期'])
    expect(original.sheets[1]?.document.settings?.layout).toBe('timeline-vertical')
    await fileAction('新建导图')
    await create('独立文档')
    const other = await save(artifact('independent'))
    expect(other.id).not.toBe(original.id)
    await named('展开导图标签栏').click()
    await expect(
      browser.$$('[role="tablist"][aria-label="打开的导图"] [role="tab"]'),
    ).toBeElementsArrayOfSize(2)
    await browser.$('[role="tablist"][aria-label="打开的导图"] [aria-label="设计原稿"]').click()
    await browser.keys(Key.Space)
    await rootHasText('发布排期')
    await browser.$('.sheet-tab').click()
    await browser.keys(Key.Enter)
    await rootHasText('设计原稿')
    await named('展开导图标签栏').click()
    await browser.$('[role="tablist"][aria-label="打开的导图"] [aria-label="独立文档"]').click()
    await browser.keys(Key.Space)
    await rootHasText('独立文档')
  })
})
