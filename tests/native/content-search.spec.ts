import { browser, expect } from '@wdio/globals'
import { Key } from 'webdriverio'
import type { ContentSearchResult } from '@shared/contentSearch'
import { nativeArtifact } from '@tests/native/artifacts'
import {
  artifact,
  fillContentEditable,
  focusNativeWindow,
  create,
  ensureProperties,
  fileAction,
  home,
  named,
  native,
  renameRoot,
  root,
  rootHasText,
  save,
  shortcut,
} from '@tests/native/driver'

const palette = () => browser.$('[data-command-palette]')
const search = async (query: string): Promise<void> => {
  await focusNativeWindow()
  await browser.keys([process.platform === 'darwin' ? Key.Command : Key.Control, Key.Shift, 'p'])
  await expect(palette()).toBeDisplayed()
  await palette().$('[cmdk-input]').setValue(query)
}
const contentOption = (title: string) =>
  palette().$(`.//*[@cmdk-item and starts-with(@data-value, "content:")][contains(., "${title}")]`)
const matches = (query: string) =>
  native<ContentSearchResult[]>('searchContent', { input: { query } })

describe('native command palette and content index', () => {
  beforeEach(home)

  it('indexes unsaved notes, locates another document and Sheet, and removes closed content', async () => {
    await named('不使用预设').click()
    await create('原生索引文档')
    await expect(browser.$$('.react-flow__node')).toBeElementsArrayOfSize(1)
    await ensureProperties()
    await fillContentEditable(named('主题备注'), '待讨论的星轨方案')
    await root().click()
    await named('新建画布').click()
    await named('下一步').click()
    await named('画布名称').setValue('跨表检索')
    await named('创建画布').click()
    await expect(browser.$('.sheet-tab[aria-selected="true"]')).toHaveText('跨表检索')
    await renameRoot('跨画布星轨目标')
    await save(artifact('search-source'))
    await fileAction('新建导图')
    await create('另一份导图')

    await search('星轨')
    await expect(contentOption('跨画布星轨目标')).toBeDisplayed()
    await expect(contentOption('原生索引文档')).toBeDisplayed()
    await browser.saveScreenshot(await nativeArtifact('brainstorming-native-content-search.png'))
    await contentOption('跨画布星轨目标').click()
    await expect(palette()).not.toExist()
    await rootHasText('跨画布星轨目标')
    await expect(browser.$('.sheet-tab[aria-selected="true"]')).toHaveText('跨表检索')
    await expect(browser.$('.react-flow__node[data-id="root"]')).toHaveElementClass('selected')

    await renameRoot('已更新天文目标')
    await search('天文')
    await expect(contentOption('已更新天文目标')).toBeDisplayed()
    expect(await matches('跨画布星轨')).toHaveLength(0)
    await browser.keys(Key.Escape)
    await expect(palette()).not.toExist()
    await shortcut('s')
    await expect(named('文件菜单')).toBeEnabled()
    await named('展开导图标签栏').click()
    await browser.$('[aria-label="关闭导图 原生索引文档"]').click()
    await rootHasText('另一份导图')
    await search('天文')
    await expect(palette().$('[cmdk-empty]')).toBeDisplayed()
    expect(await matches('天文')).toHaveLength(0)
    expect(await matches('星轨')).toHaveLength(0)
    await browser.keys(Key.Escape)
  })
})
