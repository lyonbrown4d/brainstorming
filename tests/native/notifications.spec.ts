import { selectExportOption } from '@tests/native/export-files'
import { browser, expect } from '@wdio/globals'
import {
  artifact,
  chooseFile,
  create,
  dockAction,
  fixture,
  home,
  named,
  native,
  rootHasText,
} from '@tests/native/driver'
import type { NotificationSettings } from '@shared/notifications'

describe('native notification settings', () => {
  it('reads the device preference and shows disabled notifications without requesting permission', async () => {
    await home()
    await native('setNotificationsEnabled', { enabled: false })
    const before = await native<NotificationSettings>('getNotificationSettings')
    expect(before.enabled).toBe(false)
    await named('应用设置').click()
    const dialog = browser.$('[role="dialog"]')
    await expect(dialog).toBeDisplayed()
    await expect(named('启用通知')).toBeEnabled()
    await expect(dialog.$('[role="status"]')).toHaveText('已关闭')
    const after = await native<NotificationSettings>('getNotificationSettings')
    expect(after).toEqual(before)
    // Never enable notifications here: native permission dialogs belong to user gestures.
    await browser.keys('Escape')
    await expect(dialog).not.toExist()
  })

  it('keeps high quality PNG, SVG export and cancellation usable while system notifications are off', async () => {
    await home()
    await native('setNotificationsEnabled', { enabled: false })
    await create('导出通知')
    await dockAction('导出')
    const dialog = browser.$('[role="dialog"]')
    await expect(dialog).toBeDisplayed()
    const pngName = artifact('native-hd-export', 'png')
    await chooseFile('save', pngName)
    await expect(dialog.$('button=导出 PNG')).toBeEnabled()
    await dialog.$('button=导出 PNG').click()
    await expect(dialog.$('[role="status"]')).toHaveText('已导出')
    const pngFile = await fixture<{ length: number }>('inspect', { name: pngName })
    expect(pngFile.length).toBeGreaterThan(100)
    await selectExportOption('导出格式', 'SVG 矢量图')
    const name = artifact('notification-export', 'svg')
    await chooseFile('save', name)
    await dialog.$('button=导出 SVG').click()
    await expect(dialog.$('[role="status"]')).toHaveText('已导出')
    const file = await fixture<{ length: number }>('inspect', { name })
    expect(file.length).toBeGreaterThan(0)
    await chooseFile('save', artifact('notification-cancel', 'svg'), true)
    await dialog.$('button=导出 SVG').click()
    await expect(dialog.$('[role="status"]')).toHaveText('已取消导出')
    const close = dialog.$('button=关闭')
    await expect(close).toBeEnabled()
    await close.click()
    await expect(dialog).not.toExist()
    await rootHasText('导出通知')
  })
})
