import { execFile } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { promisify } from 'node:util'
import { strFromU8, unzipSync } from 'fflate'
import { browser, expect } from '@wdio/globals'
import { artifact, chooseFile, fixture, named, native } from '@tests/native/driver'

export const exportDialog = () => browser.$('[role="dialog"]')
export const selectExportOption = async (label: string, option: string): Promise<void> => {
  await named(label).click()
  await browser.$(`[role="option"]=${option}`).click()
}
export const selectExportFormat = async (group: string, label: string): Promise<void> => {
  await exportDialog().$(`button=${group}`).click()
  await selectExportOption('导出格式', label)
}
export const writeExport = async (extension: string): Promise<string> => {
  const path = await chooseFile('save', artifact('export-center', extension))
  const action = exportDialog().$(`button=导出 ${extension.toUpperCase()}`)
  await expect(action).toBeEnabled()
  await action.click()
  await expect(exportDialog().$('[role="status"]')).toHaveText('已导出')
  await expect(exportDialog().$('button=打开文件')).toBeDisplayed()
  await expect(exportDialog().$('button=在文件夹中显示')).toBeDisplayed()
  return path
}
export const zipContents = async (path: string): Promise<Record<string, string>> => {
  const bytes = await readFile(path)
  expect(bytes.subarray(0, 4).toString('hex')).toBe('504b0304')
  return Object.fromEntries(
    Object.entries(unzipSync(bytes)).map(([name, value]) => [name, strFromU8(value)]),
  )
}
export const searchablePdf = async (path: string): Promise<string> => {
  const bytes = await readFile(path)
  expect(bytes.subarray(0, 5).toString()).toBe('%PDF-')
  const { stdout } = await promisify(execFile)('pdftotext', ['-layout', path, '-'], {
    timeout: 15_000,
    maxBuffer: 2 * 1024 * 1024,
  })
  return stdout
}

// Observe real DOM state transitions without delaying or replacing the export service.
export const observeExportStates = async (): Promise<void> => {
  await browser.execute(() => {
    const target = document.querySelector('[role="dialog"]')
    if (!target) throw new Error('Export dialog is missing')
    const state = window as Window & { exportStates?: string[]; exportObserver?: MutationObserver }
    state.exportObserver?.disconnect()
    state.exportStates = []
    const record = () => {
      state.exportStates?.push(target.textContent)
    }
    state.exportObserver = new MutationObserver(record)
    state.exportObserver.observe(target, { subtree: true, childList: true, characterData: true })
    record()
  })
}
export const recordedExportStates = async (): Promise<string[]> =>
  browser.execute(() => {
    const state = window as Window & { exportStates?: string[]; exportObserver?: MutationObserver }
    state.exportObserver?.disconnect()
    return state.exportStates ?? []
  })

interface NativeMenuItem {
  readonly id: string
  readonly title: string
  readonly enabled: boolean
  readonly items?: readonly NativeMenuItem[]
}
export const nativeMenus = (): Promise<NativeMenuItem[]> => fixture('menuSnapshot', {})
export const menuEntry = (
  menus: readonly NativeMenuItem[],
  id: string,
): NativeMenuItem | undefined => {
  for (const item of menus) {
    if (item.id === id) return item
    const child = item.items && menuEntry(item.items, id)
    if (child) return child
  }
  return undefined
}
export const assertNativeMenus = async (enabled: boolean): Promise<void> => {
  if (process.platform !== 'darwin') {
    expect(await nativeMenus()).toEqual([])
    return
  }
  await browser.waitUntil(async () => menuEntry(await nativeMenus(), 'export')?.enabled === enabled)
  const menus = await nativeMenus()
  expect(menus.map((menu) => menu.title)).toEqual(
    expect.arrayContaining(['文件', '编辑', '视图', '演示', '窗口', '帮助']),
  )
  const file = menus.find((menu) => menu.title === '文件')
  expect(file?.items?.map((item) => item.id)).toEqual(
    expect.arrayContaining(['newWindow', 'openNewWindow', 'export', 'print']),
  )
  expect(menuEntry(menus, 'print')?.enabled).toBe(enabled)
  const application = menus.find((menu) => menu.title === 'Brainstorming')
  expect(application?.items?.some((item) => item.id === 'settings')).toBe(true)
}

export const decodedPng = async (path: string): Promise<{ width: number; height: number }> => {
  const bytes = await readFile(path)
  expect(bytes.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a')
  return browser.execute(async (base64) => {
    const image = new Image()
    image.src = `data:image/png;base64,${base64}`
    await image.decode()
    return { width: image.naturalWidth, height: image.naturalHeight }
  }, bytes.toString('base64'))
}

/** A closing WebView cannot reliably return its own IPC response. */
export const closeSecondaryWindow = async (): Promise<void> => {
  await browser.tauri.execute(({ core }) => {
    void core.invoke('native_request', { method: 'closeWindow', args: {} })
  })
  await browser.tauri.switchWindow('main')
  await browser.waitUntil(
    async () => (await native<readonly { id: string }[]>('listWindows')).length === 1,
    { timeoutMsg: 'The secondary native window did not close' },
  )
}
