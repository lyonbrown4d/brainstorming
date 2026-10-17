import { seedChinese } from '@tests/electron/preferences'
import { mainWindow } from '@tests/desktop/windows'
import { _electron as electron, expect, test } from '@playwright/test'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { decodeBrainstorming } from '@tests/electron/codec'

test('桌面首页创建并保存后，新建独立画布沿用原文件路径，最近文件可从首页重新打开', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'brainstorming-create-desktop-'))
  await seedChinese(directory)
  const path = join(directory, '设计工作簿.brainstorming')
  const app = await electron.launch({
    colorScheme: null,
    args: ['.', `--user-data-dir=${directory}`],
  })
  try {
    const page = await mainWindow(app)
    await expect(page.getByRole('button', { name: '探索示例', exact: true })).toBeVisible()
    await expect(page.getByTestId('topic-root')).toHaveCount(0)
    await page.getByRole('button', { name: '选择向右括号图', exact: true }).click()
    await page.getByRole('button', { name: '下一步', exact: true }).click()
    await page.getByRole('textbox', { name: '文档名称', exact: true }).fill('桌面设计')
    await page.getByRole('button', { name: '创建文档', exact: true }).click()
    await expect(page.getByTestId('topic-root')).toContainText('桌面设计')
    await app.evaluate(({ dialog }, savePath) => {
      dialog.showSaveDialog = () => Promise.resolve({ canceled: false, filePath: savePath })
    }, path)
    await page.keyboard.press('ControlOrMeta+s')
    await expect
      .poll(async () =>
        readFile(path)
          .then(async (bytes) => (await decodeBrainstorming(bytes)).sheets.length)
          .catch(() => 0),
      )
      .toBe(1)
    const original = await decodeBrainstorming(await readFile(path))
    // A misplaced save-as flow now cancels instead of silently reusing our fixture path.
    await app.evaluate(({ dialog }) => {
      dialog.showSaveDialog = () => Promise.resolve({ canceled: true, filePath: '' })
    })
    await page.getByRole('button', { name: '新建画布', exact: true }).click()
    await page.getByRole('button', { name: '选择垂直时间线', exact: true }).click()
    await page.getByRole('button', { name: '下一步', exact: true }).click()
    await page.getByRole('textbox', { name: '画布名称', exact: true }).fill('时间安排')
    await page.getByRole('button', { name: '创建画布', exact: true }).click()
    await expect(
      page.getByRole('tablist', { name: '文档画布', exact: true }).getByRole('tab'),
    ).toHaveCount(2)
    await page.keyboard.press('ControlOrMeta+s')
    await expect
      .poll(async () => (await decodeBrainstorming(await readFile(path))).sheets.length)
      .toBe(2)
    const saved = await decodeBrainstorming(await readFile(path))
    expect(saved.id).toBe(original.id)
    expect(saved.sheets[0]).toEqual(original.sheets[0])
    expect(saved.sheets[1]?.document.settings?.layout).toBe('timeline-vertical')
    await page.getByRole('button', { name: '返回首页', exact: true }).click()
    const recent = page.getByRole('button', { name: /设计工作簿\.brainstorming/ })
    await expect(recent).toBeVisible()
    await recent.click()
    await expect(
      page.getByRole('tablist', { name: '文档画布', exact: true }).getByRole('tab'),
    ).toHaveCount(2)
    // Reopening an already open native path preserves its active Sheet.
    await expect(page.getByTestId('topic-root')).toContainText('时间安排')
    await page
      .getByRole('tablist', { name: '文档画布', exact: true })
      .getByRole('tab', { name: '桌面设计', exact: true })
      .click()
    await expect(page.getByTestId('topic-root')).toContainText('桌面设计')
    // The native menu remains usable while a renderer dialog has focus.
    await page.keyboard.press('ControlOrMeta+f')
    const search = page.getByRole('dialog', { name: '查找与替换', exact: true })
    await search.getByRole('textbox', { name: '查找文本', exact: true }).fill('桌面')
    await app.evaluate(({ Menu }) => {
      const item = Menu.getApplicationMenu()
        ?.items.find((entry) => entry.label === '文件')
        ?.submenu?.items.find((entry) => entry.label === '新建')
      if (!item) throw new Error('缺少原生新建菜单')
      Reflect.apply(item.click, item, [])
    })
    await expect(page.getByRole('heading', { name: '新建文档', exact: true })).toBeVisible()
    await expect(search).toHaveCount(0)
    await page.getByRole('button', { name: '返回画布', exact: true }).click()
    await expect(search).toHaveCount(0)
    await expect(page.getByTestId('topic-root')).toContainText('桌面设计')
    await expect(
      page.getByRole('tablist', { name: '文档画布', exact: true }).getByRole('tab'),
    ).toHaveCount(2)
  } finally {
    app.process().kill('SIGKILL')
    await rm(directory, { recursive: true, force: true })
  }
})
