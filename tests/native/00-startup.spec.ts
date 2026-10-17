import { browser, expect } from '@wdio/globals'
import { Key } from 'webdriverio'
import { checkMacChrome } from '@tests/native/chrome'
import { create, fixture, home, named, native, rootHasText, shortcut } from '@tests/native/driver'

interface NativeWindowState {
  visible: boolean
  focused: boolean
  fullScreen: boolean
  maximized: boolean
}

describe('native startup, window chrome and menu shortcuts', () => {
  it('hands off the splash to the focused main window and retains native window actions', async () => {
    await browser.waitUntil(async () => (await browser.tauri.listWindows()).includes('main'))
    await browser.waitUntil(async () => !(await browser.tauri.listWindows()).includes('splash'))
    await browser.tauri.switchWindow('main')
    await browser.saveScreenshot('/private/tmp/brainstorming-native-startup.png')
    await browser.waitUntil(
      async () => (await fixture<NativeWindowState>('windowState', {})).focused,
      { timeoutMsg: 'The native main window did not receive focus after the splash handoff' },
    )
    const state = await fixture<NativeWindowState>('windowState', {})
    expect(state.visible).toBe(true)
    expect(state.focused).toBe(true)
    await checkMacChrome()
    await home()
    await shortcut('n')
    await expect(named('下一步')).toBeDisplayed()
    await create('快捷键窗口检查')
    await checkMacChrome()
    await shortcut('n')
    await expect(named('下一步')).toBeDisplayed()
    await browser.keys(Key.Escape)
    await rootHasText('快捷键窗口检查')
    await named('文件菜单').click()
    await browser.keys(Key.ArrowDown)
    await expect(named('保存导图')).toBeDisplayed()
    await browser.keys(Key.Escape)
    await expect(named('保存导图')).not.toBeDisplayed()
    if (process.platform !== 'darwin') {
      const previous = (await fixture<NativeWindowState>('windowState', {})).maximized
      await named('最大化或还原窗口').click()
      await browser.waitUntil(
        async () => (await fixture<NativeWindowState>('windowState', {})).maximized !== previous,
      )
      await named('最大化或还原窗口').click()
      await browser.waitUntil(
        async () => (await fixture<NativeWindowState>('windowState', {})).maximized === previous,
      )
      await expect(named('最小化窗口')).toBeDisplayed()
      await expect(named('关闭窗口')).toBeDisplayed()
    }
    const windowState = await native<{ focused: boolean; fullScreen: boolean }>('getWindowState')
    await expect(browser.$('[data-platform]')).toHaveAttribute(
      'data-fullscreen',
      String(windowState.fullScreen),
    )
  })
})
