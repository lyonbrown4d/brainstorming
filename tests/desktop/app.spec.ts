import { _electron as electron, expect, test } from '@playwright/test'
import { mkdtemp, rm, writeFile, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createDocument, serializeDocument } from '../../src/core'

test('生产 Electron 启动、sandbox preload 和恢复闭环', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'trelyx-desktop-'))
  await writeFile(
    join(directory, 'recovery.trelyx'),
    serializeDocument(createDocument('桌面恢复验证')),
  )
  const app = await electron.launch({ args: ['.', `--user-data-dir=${directory}`] })
  try {
    const page = await app.firstWindow()
    page.on('dialog', (dialog) => {
      void dialog.accept()
    })
    const errors: string[] = []
    page.on('pageerror', (error) => {
      errors.push(error.message)
    })
    await expect(page.getByTestId('topic-root')).toBeVisible()
    const security = await page.evaluate(() => ({
      nodeIntegration: 'require' in window,
      bridge: typeof window.trelyx?.saveDocument,
    }))
    expect(security).toEqual({ nodeIntegration: false, bridge: 'function' })
    expect(await page.evaluate(() => typeof window.trelyx?.saveDocument)).toBe('function')
    await expect(page.getByRole('button', { name: /恢复/ })).toBeVisible()
    await page.getByRole('button', { name: /恢复/ }).click()
    await expect(page.getByTestId('topic-root')).toContainText('桌面恢复验证')
    await page.getByTestId('topic-root').dblclick()
    const input = page.getByRole('textbox', { name: '编辑主题标题' })
    await input.fill('原生桌面编辑')
    await input.press('End')
    await page.keyboard.insertText('继续')
    await expect(input).toHaveText('原生桌面编辑继续')
    const invokeEditMenu = async (label: string) => {
      await app.evaluate(({ Menu }, name) => {
        const item = Menu.getApplicationMenu()
          ?.items.find((entry) => entry.label === '编辑')
          ?.submenu?.items.find((entry) => entry.label === name)
        if (!item) throw new Error('缺少原生编辑菜单')
        Reflect.apply(item.click, item, [])
      }, label)
    }
    await invokeEditMenu('撤销')
    await expect(input).not.toHaveText('原生桌面编辑继续')
    await invokeEditMenu('重做')
    await expect(input).toHaveText('原生桌面编辑继续')
    await page.locator('.react-flow__pane').click({ position: { x: 20, y: 20 } })
    await expect
      .poll(async () => page.evaluate(() => window.trelyx?.readRecovery()))
      .toContain('原生桌面编辑')
    const savedPath = join(directory, 'native-save.trelyx')
    await app.evaluate(({ dialog }, path) => {
      dialog.showSaveDialog = () => Promise.resolve({ canceled: false, filePath: path })
    }, savedPath)
    await page.getByRole('button', { name: '文件菜单', exact: true }).click()
    await page.getByRole('menuitem', { name: '保存导图', exact: true }).click()
    await expect
      .poll(async () => readFile(savedPath, 'utf8').catch(() => ''))
      .toContain('原生桌面编辑')
    await expect(page.locator('.save-status')).toContainText('已保存')
    await page.getByRole('button', { name: '文件菜单', exact: true }).click()
    await page.getByRole('menuitem', { name: '新建导图', exact: true }).click()
    await app.evaluate(({ dialog }, path) => {
      dialog.showOpenDialog = () => Promise.resolve({ canceled: false, filePaths: [path] })
    }, savedPath)
    await page.getByRole('button', { name: '文件菜单', exact: true }).click()
    await page.getByRole('menuitem', { name: '打开导图', exact: true }).click()
    await expect(page.getByTestId('topic-root')).toContainText('原生桌面编辑')
    expect(errors).toEqual([])
  } finally {
    // Terminate the test process rather than interact with the intentional native dirty-close prompt.
    app.process().kill('SIGKILL')
    await rm(directory, { recursive: true, force: true })
  }
})
