import { browser, expect } from '@wdio/globals'
import { expectEmbeddedArtworkReady } from '@tests/native/imageReadiness'
import { Key } from 'webdriverio'
import {
  artifact,
  closeSaved,
  create,
  chooseFile,
  dockAction,
  fixture,
  ensureProperties,
  home,
  named,
  openSaved,
  root,
  rootHasText,
  save,
  shortcut,
} from '@tests/native/driver'

describe('offline built-in artwork', () => {
  it('inserts searchable artwork, undoes once, and preserves embedded images after saving and reopening', async () => {
    await home()
    await create('内置素材保存')
    await ensureProperties()
    await browser.$('aside[aria-label="属性面板"] [role="tablist"]').$('aria/主题').click()
    const trigger = named('贴图与插画')
    await trigger.scrollIntoView()
    await trigger.click()
    await named('搜索素材或关键词').setValue('露营')
    await named('添加图片 · 露营').click()
    const image = () => root().$('img[alt="camping.png"]')
    await expect(image()).toBeDisplayed()
    await shortcut('z')
    await expect(image()).not.toExist()
    await browser.keys([process.platform === 'darwin' ? Key.Command : Key.Control, Key.Shift, 'z'])
    await expect(image()).toBeDisplayed()
    const panel = browser.$('aside[aria-label="属性面板"]')
    await panel.$('button=图标与任务标记').click()
    await panel.$('section[aria-label="图标与任务标记"]').$('aria/优先级 9').click()
    await expect(root().$('button[aria-label="更改优先级 9"]')).toBeDisplayed()
    const name = artifact('embedded-artwork')
    const workbook = await save(name)
    const savedDocument = workbook.sheets[0]?.document
    const assetId = savedDocument?.topics[savedDocument.rootId]?.image?.assetId
    expect(assetId).toBe('builtin-art-v1-camping')
    const asset = assetId ? savedDocument.assets?.[assetId] : undefined
    expect(asset?.storage?.byteLength).toBeGreaterThan(100)
    expect(asset).not.toHaveProperty('data')
    expect(savedDocument?.topics[savedDocument.rootId]?.metadata?.task).toEqual({ priority: 9 })
    await closeSaved()
    await openSaved(name)
    await rootHasText('内置素材保存')
    await expect(root().$('button[aria-label="更改优先级 9"]')).toBeDisplayed()
    await expect(root().$('img[alt="camping.png"]')).toBeDisplayed()
    await expectEmbeddedArtworkReady()
    await dockAction('导出')
    const imageName = artifact('native-artwork-priority', 'png')
    await chooseFile('save', imageName)
    const dialog = browser.$('[role="dialog"]')
    const action = dialog.$('button=导出 PNG')
    await expect(action).toBeEnabled()
    await action.click()
    await expect(dialog.$('[role="status"]')).toHaveText('已导出')
    const exported = await fixture<{ length: number }>('inspect', { name: imageName })
    expect(exported.length).toBeGreaterThan(100)
    await dialog.$('button=关闭').click()
  })
})
