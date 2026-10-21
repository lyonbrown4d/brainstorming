import { browser, expect } from '@wdio/globals'
import { Key } from 'webdriverio'
import { chooseAppearance } from '@tests/native/appearance'
import { nativeArtifact } from '@tests/native/artifacts'
import {
  artifact,
  closeSaved,
  create,
  dockAction,
  editor,
  fillContentEditable,
  home,
  named,
  openSaved,
  root,
  rootHasText,
  save,
} from '@tests/native/driver'

const depth = () => browser.$('input[aria-label="主题深度数值"]')
const openDepth = async (): Promise<void> => {
  if (!(await depth().isDisplayed())) await named('深度').click()
  await expect(depth()).toBeDisplayed()
}

describe('native spatial canvas', () => {
  it('edits in 3D and persists topic depth through SQLite save and reopen', async () => {
    await home()
    await create('空间创作')
    await named('三维视图').click()
    await expect(browser.$('[data-view-mode="3d"]')).toBeDisplayed()
    await expect(browser.$('[data-spatial-renderer]')).toBeDisplayed()
    await expect(browser.$('[data-spatial-renderer] canvas')).toBeDisplayed()
    await root().click()
    await openDepth()
    await depth().setValue('175')
    await browser.keys(Key.Enter)
    await expect(depth()).toHaveValue('175')
    await root().click()
    await dockAction('撤销')
    await openDepth()
    await expect(depth()).toHaveValue('0')
    await root().click()
    await dockAction('重做')
    await openDepth()
    await expect(depth()).toHaveValue('175')

    await root().click()
    await browser.keys(Key.F2)
    await expect(editor()).toBeFocused()
    await fillContentEditable(editor(), '空间创作完成')
    await browser.keys(Key.Enter)
    await rootHasText('空间创作完成')
    await expect(editor()).not.toExist()
    await named('二维视图').click()
    await expect(browser.$('[data-view-mode="2d"]')).toBeDisplayed()
    await rootHasText('空间创作完成')
    await named('三维视图').click()
    await expect(browser.$('[data-view-mode="3d"]')).toBeDisplayed()

    const name = artifact('spatial')
    const workbook = await save(name)
    expect(workbook.sheets[0]?.document.topics.root?.style?.spatialDepth).toBe(175)
    expect(workbook.sheets[0]?.document.topics.root?.title).toBe('空间创作完成')
    expect(workbook.sheets[0]?.document.settings?.spatial).toEqual({
      mode: '3d',
      yaw: 0.7,
      pitch: 0.5,
      spacing: 100,
    })
    await closeSaved()
    await openSaved(name)
    await rootHasText('空间创作完成')
    await expect(browser.$('[data-view-mode="3d"]')).toBeDisplayed()
    await expect(browser.$('[data-spatial-renderer]')).toBeDisplayed()
    await expect(browser.$('[data-spatial-renderer] canvas')).toBeDisplayed()
    await root().click()
    await openDepth()
    await expect(depth()).toHaveValue('175')
    await browser.saveScreenshot(await nativeArtifact('brainstorming-native-spatial.png'))
    await browser.keys(Key.Escape)
    await chooseAppearance('深色')
    await expect(browser.$('html')).toHaveAttribute('data-theme', 'dark')
    await expect(browser.$('[data-view-mode="3d"]')).toBeDisplayed()
    await expect(browser.$('[data-spatial-renderer] canvas')).toBeDisplayed()
    await browser.saveScreenshot(await nativeArtifact('brainstorming-native-spatial-dark.png'))
    await chooseAppearance('跟随系统')
  })
})
