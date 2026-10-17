import { openDocumentTabs } from '@tests/e2e/documents'
import { nativeRecoveryContents, seedRecovery } from '@tests/electron/recovery'
import { seedChinese } from '@tests/electron/preferences'
import { mainWindow } from '@tests/desktop/windows'
import { completeDocumentCreation } from '@tests/e2e/workspace'
import { _electron as electron, expect, test } from '@playwright/test'
import { mkdtemp, rm, writeFile, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createDocument, createWorkbook } from '@core'
import { encodeBrainstorming, decodeBrainstorming } from '@tests/electron/codec'
import { modernXmind } from '@tests/fixtures/xmind/archive'
import { imageBase64, attachmentBytes } from '@tests/fixtures/content'

test('生产 Electron 启动、sandbox preload 和恢复闭环', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'brainstorming-desktop-'))
  await seedChinese(directory)
  const recovered = createWorkbook(createDocument('桌面恢复验证'))
  await seedRecovery(directory, recovered.id, await encodeBrainstorming(recovered))
  const app = await electron.launch({
    colorScheme: null,
    args: ['.', `--user-data-dir=${directory}`],
  })
  try {
    const page = await mainWindow(app)
    page.on('dialog', (dialog) => {
      void dialog.accept()
    })
    const errors: string[] = []
    page.on('pageerror', (error) => {
      errors.push(error.message)
    })
    await expect(page.getByRole('button', { name: '探索示例', exact: true })).toBeVisible()
    const security = await page.evaluate(() => ({
      nodeIntegration: 'require' in window,
      bridge: typeof window.brainstorming?.saveDocument,
    }))
    expect(security).toEqual({ nodeIntegration: false, bridge: 'function' })
    expect(await page.evaluate(() => typeof window.brainstorming?.saveDocument)).toBe('function')
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
    await expect.poll(() => nativeRecoveryContents(directory)).toContain('原生桌面编辑')
    await page.getByRole('button', { name: '属性面板', exact: true }).click()
    const panel = page.getByRole('complementary', { name: '属性面板', exact: true })
    await panel.getByRole('textbox', { name: '主题备注' }).fill('桌面备注\n第二行')
    const imagePath = join(directory, '桌面图片.png')
    const attachmentPath = join(directory, '资料.bin')
    await Promise.all([
      writeFile(imagePath, Buffer.from(imageBase64, 'base64')),
      writeFile(attachmentPath, attachmentBytes),
    ])
    await app.evaluate(({ dialog }, path) => {
      dialog.showOpenDialog = () => Promise.resolve({ canceled: false, filePaths: [path] })
    }, imagePath)
    await panel.getByRole('button', { name: '添加图片', exact: true }).click()
    await expect(panel.getByRole('img', { name: '桌面图片.png' })).toBeVisible()
    await app.evaluate(({ dialog }, path) => {
      dialog.showOpenDialog = () => Promise.resolve({ canceled: false, filePaths: [path] })
    }, attachmentPath)
    await panel.getByRole('button', { name: '添加附件', exact: true }).click()
    await expect(panel.getByText('资料.bin', { exact: true })).toBeVisible()
    const exportedPath = join(directory, 'exported.bin')
    await app.evaluate(({ dialog }, path) => {
      dialog.showSaveDialog = () => Promise.resolve({ canceled: false, filePath: path })
    }, exportedPath)
    await panel.getByRole('button', { name: '另存附件 资料.bin' }).click()
    await expect
      .poll(() => readFile(exportedPath).catch(() => Buffer.alloc(0)))
      .toEqual(Buffer.from(attachmentBytes))
    const savedPath = join(directory, 'native-save.brainstorming')
    await app.evaluate(({ dialog }, path) => {
      dialog.showSaveDialog = () => Promise.resolve({ canceled: false, filePath: path })
    }, savedPath)
    await page.getByRole('button', { name: '文件菜单', exact: true }).click()
    await page.getByRole('menuitem', { name: '保存导图', exact: true }).click()
    await expect
      .poll(async () =>
        readFile(savedPath)
          .then(async (bytes) => JSON.stringify(await decodeBrainstorming(bytes)))
          .catch(() => ''),
      )
      .toContain('原生桌面编辑')
    await expect(page.locator('.save-status')).toContainText('已保存')
    await page.getByRole('button', { name: '文件菜单', exact: true }).click()
    await page.getByRole('menuitem', { name: '新建导图', exact: true }).click()
    await completeDocumentCreation(page)
    await app.evaluate(({ dialog }, path) => {
      dialog.showOpenDialog = () => Promise.resolve({ canceled: false, filePaths: [path] })
    }, savedPath)
    await page.getByRole('button', { name: '文件菜单', exact: true }).click()
    await page.getByRole('menuitem', { name: '打开导图', exact: true }).click()
    await expect(page.getByTestId('topic-root')).toContainText('原生桌面编辑')
    await expect(panel.getByRole('textbox', { name: '主题备注' })).toHaveText('桌面备注\n第二行')
    await expect(panel.getByRole('img', { name: '桌面图片.png' })).toBeVisible()
    await expect(panel.getByText('资料.bin', { exact: true })).toBeVisible()
    expect(errors).toEqual([])
  } finally {
    // Terminate the test process rather than interact with the intentional native dirty-close prompt.
    app.process().kill('SIGKILL')
    await rm(directory, { recursive: true, force: true })
  }
})

test('系统传入的文件在启动和 macOS 打开事件中使用相同打开流程', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'brainstorming-file-open-'))
  await seedChinese(directory)
  const firstPath = join(directory, 'first.brainstorming')
  const secondPath = join(directory, 'second.xmind')
  const originalXmind = modernXmind()
  await Promise.all([
    writeFile(firstPath, await encodeBrainstorming(createWorkbook(createDocument('启动文件')))),
    writeFile(secondPath, originalXmind),
  ])
  const damagedRecovery = await seedRecovery(directory, 'damaged-workbook', 'damaged recovery')
  const app = await electron.launch({
    colorScheme: null,
    args: ['.', `--user-data-dir=${directory}`, firstPath],
  })
  try {
    const page = await mainWindow(app)
    await expect(page.getByTestId('topic-root')).toContainText('启动文件')
    await app.evaluate(({ app }, path) => {
      app.emit('open-file', { preventDefault: () => undefined }, path)
    }, secondPath)
    await expect(page.getByTestId('topic-root')).toContainText('中心主题')
    await expect(page.locator('.save-status')).toContainText('未保存')
    expect(await readFile(secondPath)).toEqual(Buffer.from(originalXmind))
    await page.getByTestId('topic-root').dblclick()
    await page.getByRole('textbox', { name: '编辑主题标题' }).fill('尚未保存')
    await page.locator('.react-flow__pane').click({ position: { x: 20, y: 20 } })
    const tabs = await openDocumentTabs(page)
    await app.evaluate(({ app }, path) => {
      app.emit('second-instance', {}, ['electron', path], '')
    }, firstPath)
    await expect(page.getByTestId('topic-root')).toContainText('启动文件')
    await expect(tabs.getByRole('tab')).toHaveCount(2)
    await tabs.getByRole('tab').last().click()
    await expect(page.getByTestId('topic-root')).toContainText('尚未保存')
    expect(await readFile(damagedRecovery, 'utf8')).toBe('damaged recovery')
  } finally {
    app.process().kill('SIGKILL')
    await rm(directory, { recursive: true, force: true })
  }
})
