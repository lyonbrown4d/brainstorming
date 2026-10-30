import { switchNativeWindow } from '@tests/native/cef-api'
import { browser, expect } from '@wdio/globals'
import { Key } from 'webdriverio'
import { fileMenuItemReady } from '@tests/native/readiness'
import { nativeArtifact } from '@tests/native/artifacts'
import { closeSecondaryWindow } from '@tests/native/export-files'
import {
  artifact,
  create,
  fixture,
  home,
  named,
  native,
  renameRoot,
  rootHasText,
  save,
  shortcut,
  focusNativeWindow,
} from '@tests/native/driver'
import type { EditorWindow } from '@shared/windows'

const windows = (): Promise<EditorWindow[]> => native('listWindows')
const secondWindow = async (): Promise<string> => {
  let label = ''
  await browser.waitUntil(
    async () => {
      const all = await windows()
      label = all.find((window) => window.id !== 'main')?.id ?? ''
      return label !== ''
    },
    { timeoutMsg: 'The native second window was not created' },
  )
  return label
}

describe('native desktop windows', () => {
  it('transfers unsaved edits with undo, focuses the saved document owner, and keeps another window alive on close', async () => {
    await home()
    await create('窗口 A 原文')
    await renameRoot('窗口 A 未保存修改')
    // The native File menu routes to the focused renderer and creates a real window.
    await fixture('menu', { id: 'newWindow' })
    const second = await secondWindow()
    await switchNativeWindow(second)
    await expect(browser.$('#startup-screen')).not.toExist()
    await native('startupReady')
    await create('窗口 B 独立导图')
    const secondName = artifact('window-b')
    await save(secondName)
    const initialWindows = await windows()
    const main = initialWindows.find((window) => window.id === 'main')
    const current = initialWindows.find((window) => window.current)
    if (!main || !current) throw new Error('Expected both native editor windows')
    await named('文件菜单').click()
    await browser.keys(Key.ArrowDown)
    await fileMenuItemReady(main.title)
    await expect(
      browser.$(`[role="menuitem"][aria-label="${current.title}（当前窗口）"]`),
    ).toHaveAttribute('aria-disabled', 'true')
    await browser.saveScreenshot(await nativeArtifact('multi-window-file-menu.png'))
    await browser.$(`[role="menuitem"][aria-label="${main.title}"]`).click()
    await expect(browser.$('[role="menu"]')).not.toBeDisplayed()
    await switchNativeWindow('main')
    await browser.waitUntil(
      async () => (await native<{ focused: boolean }>('getWindowState')).focused,
      { timeoutMsg: 'The titlebar file menu did not focus the selected native window' },
    )
    await rootHasText('窗口 A 未保存修改')
    await focusNativeWindow()
    await named('展开导图标签栏').click()
    await browser.waitUntil(async () =>
      browser.execute(() => {
        const tabs = document.querySelector('#open-map-tabs')
        return (
          tabs?.getAttribute('aria-hidden') === 'false' && getComputedStyle(tabs).opacity === '1'
        )
      }),
    )
    await named('窗口操作').click()
    await browser.keys(Key.ArrowDown)
    await expect(named('窗口操作')).toHaveAttribute('aria-expanded', 'true')
    const entries = await windows()
    const destination = entries.find((window) => window.id === second)
    if (!destination) throw new Error('Missing target window')
    await named(`移到 ${destination.title}`).click()
    await switchNativeWindow(second)
    await focusNativeWindow()
    await rootHasText('窗口 A 未保存修改')
    await shortcut('z')
    await rootHasText('窗口 A 原文')
    // Saving a transferred tab uses its moved grants and the existing native editor session.
    const firstName = artifact('window-a-transferred')
    await save(firstName)
    const recent = await native<{ path: string; name: string }[]>('getRecentFiles')
    expect(recent.map((file) => file.name)).toEqual(expect.arrayContaining([firstName, secondName]))
    await expect(
      browser.$$('[role="tablist"][aria-label="打开的导图"] [role="tab"]'),
    ).toBeElementsArrayOfSize(2)
    const firstPath = recent.find((file) => file.name === firstName)?.path
    if (!firstPath) throw new Error('Transferred document was not saved')
    await switchNativeWindow('main')
    await native('startupReady')
    expect(await native('openRecent', { path: firstPath })).toBeNull()
    await switchNativeWindow(second)
    await rootHasText('窗口 A 原文')
    await browser.waitUntil(
      async () => (await native<{ focused: boolean }>('getWindowState')).focused,
      { timeoutMsg: 'Opening an owned document did not focus its native window' },
    )
    // Closing a saved secondary window must leave process services and main usable.
    await closeSecondaryWindow()
    await native('startupReady')
    await fixture('menu', { id: 'new' })
    await create('关闭后仍可编辑')
    await renameRoot('共享服务继续工作')
    await shortcut('z')
    await rootHasText('关闭后仍可编辑')
  })
})
