import { invokeNative, switchNativeWindow } from '@tests/native/cef-api'
import { creationReady, editorReady, fileMenuItemReady } from '@tests/native/readiness'
import { browser, expect } from '@wdio/globals'
import { Key, type ChainablePromiseElement } from 'webdriverio'
import { randomUUID } from 'node:crypto'
import { deserializeWorkbook, type MindMapWorkbook } from '@core'
import type { OpenedDocument } from '@shared/contracts'

export const named = (name: string) => browser.$(`aria/${name}`)
export const root = () => browser.$('[data-testid="topic-root"]')
export const editor = () => browser.$('[role="textbox"][aria-label="编辑主题标题"]')
export const textContains = async (selector: string, text: string): Promise<void> => {
  await browser.waitUntil(
    async () => {
      try {
        return (await browser.$(selector).getText()).includes(text)
      } catch {
        return false
      }
    },
    { timeoutMsg: `The native UI did not show ${text}` },
  )
}
export const rootHasText = async (text: string): Promise<void> => {
  await textContains('[data-testid="topic-root"]', text)
}
export const artifact = (prefix: string, extension = 'brainstorming') =>
  `${prefix}-${randomUUID()}.${extension}`
export const native = async <T>(method: string, args: Record<string, unknown> = {}): Promise<T> =>
  invokeNative<T>('native_request', {
    method,
    args,
  })
export const fixture = async <T>(action: string, args: Record<string, unknown>): Promise<T> =>
  invokeNative<T>('e2e_fixture', {
    action,
    args,
  })
export const chooseFile = async (
  kind: 'open' | 'save' | 'asset',
  name: string,
  cancel = false,
): Promise<string> => {
  const choice = await fixture<{ path: string }>('dialog', { kind, name, cancel })
  return choice.path
}
/** Switching WebDriver targets does not always focus the native CEF contents. */
export const focusNativeWindow = async (): Promise<void> => {
  const focused = async (): Promise<boolean> =>
    (await native<{ focused: boolean }>('getWindowState')).focused &&
    (await browser.execute(() => document.visibilityState === 'visible' && document.hasFocus()))
  if (!(await focused())) {
    await native('startupReady')
    await browser.sendCommandAndGetResult('Page.bringToFront', {})
  }
  await browser.waitUntil(focused, {
    timeoutMsg: 'The native main window must be visible and focused before UI input',
  })
}
export const shortcut = async (key: string): Promise<void> => {
  await focusNativeWindow()
  await browser.keys([process.platform === 'darwin' ? Key.Command : Key.Control, key])
  // WebdriverIO keys() releases actions; the embedded driver treats Key.NULL as text.
}
/** Native selection keystrokes keep Lexical in charge of content and history. */
export const fillContentEditable = async (
  element: ChainablePromiseElement,
  text: string,
): Promise<void> => {
  await focusNativeWindow()
  await expect(element).toBeDisplayed()
  await element.waitForClickable()
  await element.click()
  await expect(element).toBeFocused()
  await shortcut('a')
  await element.addValue(text)
  await expect(element).toHaveText(text)
}
export const reloadNativePage = async (): Promise<void> => {
  await focusNativeWindow()
  const previousDocument = await browser.execute(() => performance.timeOrigin)
  // WebKit's embedded refresh waits on the JS context it immediately destroys.
  // Return the driver response first, then perform a real next-frame navigation.
  await browser.execute(() => {
    requestAnimationFrame(() => {
      window.location.reload()
    })
  })
  await browser.waitUntil(async () => {
    try {
      const page = await browser.execute(() => ({
        epoch: performance.timeOrigin,
        ready: document.readyState,
      }))
      return page.epoch !== previousDocument && page.ready === 'complete'
    } catch {
      return false
    }
  })
  await expect(browser.$('#startup-screen')).not.toExist()
  await switchNativeWindow('main')
  await native('startupReady')
  await focusNativeWindow()
}
export const home = async (): Promise<void> => {
  await switchNativeWindow('main')
  const pendingDialogs = await fixture<{ kinds: string[] }>('dialogState', {})
  if (pendingDialogs.kinds.length)
    console.warn('Discarding unused native picker fixtures before Home:', pendingDialogs.kinds)
  await fixture('resetDialogs', {})
  await native('setLanguage', { language: 'zh-CN' })
  // Reload now preserves the HashRouter view, including an open Settings route.
  // Reset through the real router before starting a new workflow fixture.
  await browser.execute(() => {
    window.location.hash = '/home'
  })
  await reloadNativePage()
  // Initial route normalization can finish during refresh; navigate the ready app again.
  await browser.execute(() => {
    window.location.hash = '/home'
  })
  await browser.waitUntil(async () => (await browser.getUrl()).endsWith('#/home'))
  await creationReady('structure')
  await expect(named('探索示例')).toBeDisplayed()
  // Test setup starts with no prior recovery. A save from the previous page
  // can finish after the new renderer's initial read; do not infer UI state
  // from a second backend read performed at a different point in time.
  await native('writeWorkspaceRecovery', { contents: [] })
  if (await named('忽略记录').isDisplayed()) {
    await named('忽略记录').click()
    await expect(named('忽略记录')).not.toBeDisplayed()
  }
  await creationReady('structure')
}
export const create = async (title: string): Promise<void> => {
  await focusNativeWindow()
  await creationReady('structure')
  await named('下一步').click()
  await creationReady('configuration')
  await expect(named('文档名称')).toBeDisplayed()
  await named('文档名称').setValue(title)
  await named('创建文档').click()
  await editorReady(title)
  await rootHasText(title)
  await expect(root()).toBeDisplayed()
}
export const fileAction = async (action: string): Promise<void> => {
  await focusNativeWindow()
  await editorReady()
  await named('文件菜单').click()
  await browser.keys(Key.ArrowDown)
  await fileMenuItemReady(action)
  await named(action).click()
  await expect(browser.$('[role="menu"]')).not.toBeDisplayed()
}
export const dockAction = async (action: string): Promise<void> => {
  await named('展开浮动工具栏').click()
  await browser
    .$(
      `//*[@data-slot="canvas-dock"]//button[@aria-label="${action}" or normalize-space(.)="${action}"]`,
    )
    .click()
}
export const renameRoot = async (title: string): Promise<void> => {
  await focusNativeWindow()
  await editorReady()
  await root().click()
  await browser.keys(Key.F2)
  await expect(editor()).toBeDisplayed()
  await expect(editor()).toBeFocused()
  await fillContentEditable(editor(), title)
  await named('适应画布').click()
  await rootHasText(title)
}
export const readDocument = async (name: string, password?: string): Promise<MindMapWorkbook> =>
  deserializeWorkbook(
    JSON.stringify(
      await fixture<unknown>('readDocument', { name, ...(password ? { password } : {}) }),
    ),
  )
export const save = async (name: string, password?: string): Promise<MindMapWorkbook> => {
  await editorReady()
  const destination = await chooseFile('save', name)
  await shortcut('s')
  let result: MindMapWorkbook | undefined
  await browser.waitUntil(
    async () => {
      try {
        result = await readDocument(name, password)
        return true
      } catch {
        return false
      }
    },
    { timeoutMsg: 'The native save did not produce a readable SQLite document.' },
  )
  await browser.waitUntil(
    async () =>
      browser.execute((path) => {
        const status = document.querySelector('.save-status')
        const menu = document.querySelector('button[aria-label="文件菜单"]')
        return (
          status?.getAttribute('title') === path &&
          status.textContent.includes('已保存') &&
          menu instanceof HTMLButtonElement &&
          !menu.disabled
        )
      }, destination),
    { timeoutMsg: 'The saved file did not become the active document save baseline.' },
  )
  if (!result) throw new Error('Native document was not saved')
  return readDocument(name, password)
}
export const closeSaved = async (): Promise<void> => {
  await named('展开导图标签栏').click()
  await browser.$('[aria-label^="关闭导图 "]').click()
  await expect(named('探索示例')).toBeDisplayed()
}
export const openSaved = async (name: string): Promise<void> => {
  await chooseFile('open', name)
  await browser.$('button[aria-label="打开本地文件"]').click()
}
export const ensureProperties = async (): Promise<void> => {
  await editorReady()
  const panel = () => browser.$('aside[aria-label="属性面板"]')
  const toggle = () => browser.$('button[aria-label="属性面板"]')
  if ((await toggle().getAttribute('aria-pressed')) !== 'true') await toggle().click()
  await browser.waitUntil(async () => (await browser.getUrl()).includes('/style/'))
  await expect(toggle()).toHaveAttribute('aria-pressed', 'true')
  await expect(panel()).toBeDisplayed()
}
export const recovery = async (): Promise<OpenedDocument[]> => {
  const items = await native<OpenedDocument[]>('readWorkspaceRecovery')
  for (const item of items) {
    if (item.lockedToken) await native('cancelUnlock', { token: item.lockedToken })
  }
  return items
}
