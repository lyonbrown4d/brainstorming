import { browser, expect } from '@wdio/globals'
import { Key } from 'webdriverio'
import { nativeArtifact } from '@tests/native/artifacts'
import {
  artifact,
  create,
  editor,
  ensureProperties,
  home,
  named,
  root,
  rootHasText,
  save,
  closeSaved,
  openSaved,
} from '@tests/native/driver'

describe('mind-first native workflow', () => {
  it('preserves node appearance and slide notes through native SQLite save and reopen', async () => {
    await home()
    await create('旅行头脑风暴')
    await root().click()
    await browser.keys(Key.Tab)
    await editor().setValue('海边散步')
    await browser.keys(Key.Enter)
    await root().click()
    await ensureProperties()
    await browser.$('button[aria-label="表现形态"]').click()
    await named('便签').click()
    await expect(root()).toHaveAttribute('data-appearance', 'sticky')

    await browser.$('button[aria-label="演示编排"]').click()
    await expect(browser.$('[aria-label="演示编排"]')).toBeDisplayed()
    await browser.$('#presentation-notes').setValue('按时间说明这次出行安排')
    await named('从头播放').click()
    await expect(browser.$('[aria-label="观众画面"]')).toBeDisplayed()
    await browser.keys(Key.Space)
    await browser.keys(Key.Escape)
    await expect(browser.$('[aria-label="演示编排"]')).toBeDisplayed()
    await named('返回画布').click()
    await rootHasText('旅行头脑风暴')
    await browser.saveScreenshot(await nativeArtifact('mind-first-editor.png'))

    const name = artifact('mind-first')
    const workbook = await save(name)
    const document = workbook.sheets[0]?.document
    expect(document?.topics[document.rootId]?.style?.shape).toBe('sticky')
    expect(document?.presentation?.[0]?.notes).toBe('按时间说明这次出行安排')
    expect(Object.values(document?.topics ?? {}).map((topic) => topic.title)).toContain('海边散步')
    await closeSaved()
    await openSaved(name)
    await expect(root()).toHaveAttribute('data-appearance', 'sticky')
  })

  it('opens route-based settings and returns to the same canvas without discarding content', async () => {
    await home()
    await create('设置导航')
    const before = await browser.getUrl()
    await named('应用设置').click()
    await expect(browser.$('[role="dialog"]')).toBeDisplayed()
    expect(await browser.getUrl()).toContain('#/settings')
    await named('画布').click()
    await expect(named('画布缩略图')).toBeDisplayed()
    await browser.saveScreenshot(await nativeArtifact('mind-first-settings.png'))
    await browser.keys(Key.Escape)
    await expect(browser.$('[role="dialog"]')).not.toExist()
    expect(await browser.getUrl()).toBe(before)
    await rootHasText('设置导航')
  })
})
