import { browser, expect } from '@wdio/globals'
import { Key } from 'webdriverio'
import { randomUUID } from 'node:crypto'
import type { MindMapWorkbook } from '@core'
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
  (await browser.tauri.execute(({ core }, request) => core.invoke('native_request', request), {
    method,
    args,
  })) as T
export const fixture = async <T>(action: string, args: Record<string, unknown>): Promise<T> =>
  (await browser.tauri.execute(({ core }, request) => core.invoke('e2e_fixture', request), {
    action,
    args,
  })) as T
export const chooseFile = async (
  kind: 'open' | 'save' | 'asset',
  name: string,
  cancel = false,
): Promise<void> => {
  await fixture('dialog', { kind, name, cancel })
}
export const shortcut = async (key: string): Promise<void> => {
  await browser.keys([process.platform === 'darwin' ? Key.Command : Key.Control, key])
  // WebdriverIO keys() releases actions; the embedded driver treats Key.NULL as text.
}
export const reloadNativePage = async (): Promise<void> => {
  const previousDocument = await browser.execute(() => performance.timeOrigin)
  await browser.refresh()
  // Embedded refresh returns before navigation; startupReady later focuses the window.
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
  await browser.tauri.switchWindow('main')
  await native('startupReady')
  await browser.waitUntil(
    async () =>
      (await native<{ focused: boolean }>('getWindowState')).focused &&
      (await browser.execute(() => document.visibilityState === 'visible' && document.hasFocus())),
    { timeoutMsg: 'The native editor did not become visible and focused after reload' },
  )
}
export const home = async (): Promise<void> => {
  await browser.tauri.switchWindow('main')
  await native('setLanguage', { language: 'zh-CN' })
  await reloadNativePage()
  await expect(named('探索示例')).toBeDisplayed()
  await expect(named('下一步')).toBeEnabled()
  if ((await recovery()).length > 0) {
    await expect(named('忽略记录')).toBeDisplayed()
    await named('忽略记录').click()
    await expect(named('忽略记录')).not.toBeDisplayed()
  }
}
export const create = async (title: string): Promise<void> => {
  await named('下一步').click()
  await named('文档名称').setValue(title)
  await named('创建文档').click()
  await rootHasText(title)
  await expect(root()).toBeDisplayed()
}
export const fileAction = async (action: string): Promise<void> => {
  await named('文件菜单').click()
  await browser.keys(Key.ArrowDown)
  await named(action).click()
}
export const dockAction = async (action: string): Promise<void> => {
  await named('展开浮动工具栏').click()
  await named(action).click()
}
export const renameRoot = async (title: string): Promise<void> => {
  await root().click()
  await browser.keys(Key.F2)
  await editor().setValue(title)
  await browser.keys(Key.Enter)
  await rootHasText(title)
}
export const readDocument = async (name: string, password?: string): Promise<MindMapWorkbook> =>
  await fixture('readDocument', { name, ...(password ? { password } : {}) })
export const save = async (name: string, password?: string): Promise<MindMapWorkbook> => {
  await chooseFile('save', name)
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
  await expect(named('文件菜单')).toBeEnabled()
  if (!result) throw new Error('Native document was not saved')
  return result
}
export const closeSaved = async (): Promise<void> => {
  await named('展开导图标签栏').click()
  await browser.$('[aria-label^="关闭导图 "]').click()
  await expect(named('探索示例')).toBeDisplayed()
}
export const openSaved = async (name: string): Promise<void> => {
  await chooseFile('open', name)
  await named('打开本地文件').click()
}
export const ensureProperties = async (): Promise<void> => {
  const panel = browser.$('aside[aria-label="属性面板"]')
  const toggle = browser.$('button[aria-label="属性面板"]')
  if ((await toggle.getAttribute('aria-pressed')) !== 'true') await toggle.click()
  await expect(toggle).toHaveAttribute('aria-pressed', 'true')
  await expect(panel).toBeDisplayed()
}
export const recovery = async (): Promise<OpenedDocument[]> => {
  const items = await native<OpenedDocument[]>('readWorkspaceRecovery')
  for (const item of items) {
    if (item.lockedToken) await native('cancelUnlock', { token: item.lockedToken })
  }
  return items
}
