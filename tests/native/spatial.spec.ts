import { browser, expect } from '@wdio/globals'
import { Key } from 'webdriverio'
import { chooseAppearance } from '@tests/native/appearance'
import { nativeArtifact } from '@tests/native/artifacts'
import { verifySpatialPinch } from '@tests/native/spatial-gestures'
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
  readDocument,
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
    await verifySpatialPinch()
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
  it('persists a preset camera and focused target with one undo step per view change', async () => {
    await home()
    await create('空间视角验收')
    await root().click()
    await browser.keys(Key.Tab)
    await expect(editor()).toBeFocused()
    await fillContentEditable(editor(), '聚焦分支')
    await browser.keys(Key.Enter)
    await expect(editor()).not.toExist()
    const childId = await browser
      .$('.react-flow__node-topic:not([data-id="root"])')
      .getAttribute('data-id')
    if (!childId) throw new Error('The focus topic has no canvas ID')
    await browser.keys(Key.Tab)
    await fillContentEditable(editor(), '验证需求')
    await browser.keys(Key.Enter)
    await root().click()
    await browser.keys(Key.Tab)
    await fillContentEditable(editor(), '迭代计划')
    await browser.keys(Key.Enter)

    await named('三维视图').click()
    await expect(browser.$('[data-view-mode="3d"]')).toBeDisplayed()
    await expect(browser.$('[data-canvas-loading]')).not.toExist()
    await browser.$(`.react-flow__node[data-id="${childId}"] .topic-title`).click()
    const horizontal = () => browser.$('[role="slider"][aria-label="水平角度"]')
    const vertical = () => browser.$('[role="slider"][aria-label="垂直角度"]')
    await named('视角').click()
    await named('背面').click()
    await expect(horizontal()).toHaveAttribute('aria-valuenow', '180')
    await expect(vertical()).toHaveAttribute('aria-valuenow', '0')
    await browser.keys(Key.Escape)
    await dockAction('撤销')
    await named('视角').click()
    await expect(horizontal()).toHaveAttribute('aria-valuenow', '40')
    await expect(vertical()).toHaveAttribute('aria-valuenow', '29')
    await browser.keys(Key.Escape)
    await dockAction('重做')
    await named('视角').click()
    await expect(horizontal()).toHaveAttribute('aria-valuenow', '180')
    await expect(vertical()).toHaveAttribute('aria-valuenow', '0')
    await named('聚焦目标').click()
    await browser.keys(Key.Escape)
    await dockAction('撤销')
    await named('视角').click()
    await expect(horizontal()).toHaveAttribute('aria-valuenow', '180')
    await expect(vertical()).toHaveAttribute('aria-valuenow', '0')
    await browser.keys(Key.Escape)
    await dockAction('重做')

    const name = artifact('spatial-camera')
    const workbook = await save(name)
    const spatial = workbook.sheets[0]?.document.settings?.spatial
    expect(spatial?.mode).toBe('3d')
    expect(spatial?.yaw).toBe(Math.PI)
    expect(spatial?.pitch).toBe(0)
    const target = spatial?.target
    if (!target) throw new Error('The focused camera target was not saved')
    expect([target.x, target.y, target.z].every(Number.isFinite)).toBe(true)
    expect(Math.hypot(target.x, target.y)).toBeGreaterThan(1)
    expect(target.z).toBe(65)

    await closeSaved()
    await openSaved(name)
    await rootHasText('空间视角验收')
    await expect(browser.$('[data-view-mode="3d"]')).toBeDisplayed()
    await expect(browser.$('[data-canvas-loading]')).not.toExist()
    await named('视角').click()
    await expect(horizontal()).toHaveAttribute('aria-valuenow', '180')
    await expect(vertical()).toHaveAttribute('aria-valuenow', '0')
    await browser.saveScreenshot(await nativeArtifact('brainstorming-native-camera.png'))
    const reopened = await readDocument(name)
    expect(reopened.sheets[0]?.document.settings?.spatial?.target).toEqual(target)
    await named('等轴测').click()
    await browser.keys(Key.Escape)
    await chooseAppearance('浅色')
    await browser.saveScreenshot(await nativeArtifact('brainstorming-native-stage-light.png'))
    await chooseAppearance('深色')
    await browser.saveScreenshot(await nativeArtifact('brainstorming-native-stage-dark.png'))
    await chooseAppearance('跟随系统')
  })
})
