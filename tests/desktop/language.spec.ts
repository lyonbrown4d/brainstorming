import { _electron, expect, test, type ElectronApplication, type Page } from '@playwright/test'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { decodeBrainstorming } from '@formats/brainstorming'
import { mainWindow } from '@tests/desktop/windows'
import { enterExampleIfHome } from '@tests/e2e/workspace'
import { topicProperties } from '@tests/e2e/properties'
import { seedChinese, storedLanguage } from '@tests/electron/preferences'

const chooseLanguage = async (page: Page, label: string): Promise<void> => {
  await page.getByRole('button', { name: /^(界面语言|Interface language)$/ }).click()
  await page.getByRole('menuitemradio', { name: label, exact: true }).click()
}
const menuLabels = (app: ElectronApplication) =>
  app.evaluate(({ Menu }) => Menu.getApplicationMenu()?.items.map((item) => item.label) ?? [])

test('切换英文更新原生菜单并在重启后保留，切回中文不改文档标题与备注', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'brainstorming-language-'))
  await seedChinese(directory)
  const path = join(directory, '语言与内容.brainstorming')
  let app = await _electron.launch({
    colorScheme: null,
    args: ['.', `--user-data-dir=${directory}`],
  })
  try {
    let page = await mainWindow(app)
    await enterExampleIfHome(page)
    await page.getByTestId('topic-root').dblclick()
    await page.getByRole('textbox', { name: '编辑主题标题', exact: true }).fill('中文标题保持原样')
    await page.keyboard.press('Enter')
    const panel = await topicProperties(page)
    await panel.getByRole('textbox', { name: '主题备注', exact: true }).fill('中文备注\n保留第二行')
    await page.keyboard.press('Tab')
    await app.evaluate(({ dialog }, filePath) => {
      dialog.showSaveDialog = () => Promise.resolve({ canceled: false, filePath })
    }, path)
    await page.keyboard.press('ControlOrMeta+s')
    await expect(page.locator('.save-status')).toContainText('已保存')
    const before = decodeBrainstorming(await readFile(path))
    expect(before.sheets[0]?.document.topics.root?.notes).toBe('中文备注\n保留第二行')
    await chooseLanguage(page, 'English')
    await expect(
      page.getByRole('button', { name: 'Interface language', exact: true }),
    ).toBeVisible()
    await expect(page.getByRole('button', { name: 'Properties panel', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: '界面语言', exact: true })).toHaveCount(0)
    const englishPanel = page.getByRole('complementary', { name: 'Properties panel', exact: true })
    await englishPanel
      .getByRole('tablist', { name: 'Property categories', exact: true })
      .getByRole('tab', { name: 'Sheet', exact: true })
      .click()
    await englishPanel
      .getByRole('tablist', { name: 'Sheet settings', exact: true })
      .getByRole('tab', { name: 'Structure', exact: true })
      .click()
    const structures = englishPanel.getByRole('region', { name: 'Structure', exact: true })
    const longName = structures.getByRole('button', {
      name: 'Apply Downward organization chart',
      exact: true,
    })
    await expect(longName).toBeVisible()
    await expect
      .poll(() => longName.evaluate((element) => element.scrollWidth <= element.clientWidth))
      .toBe(true)
    await expect
      .poll(() => structures.evaluate((element) => element.scrollWidth <= element.clientWidth))
      .toBe(true)
    await expect.poll(() => menuLabels(app)).toContain('File')
    await expect.poll(() => storedLanguage(directory)).toBe('en')
    await expect(page.getByTestId('topic-root')).toContainText('中文标题保持原样')
    await app.close()
    app = await _electron.launch({
      colorScheme: null,
      args: ['.', `--user-data-dir=${directory}`, path],
    })
    page = await mainWindow(app)
    await expect.poll(() => menuLabels(app)).toContain('File')
    await expect(page.getByTestId('topic-root')).toContainText('中文标题保持原样')
    await chooseLanguage(page, '简体中文')
    await expect(page.getByRole('button', { name: '界面语言', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: '属性面板', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Interface language', exact: true })).toHaveCount(
      0,
    )
    await expect.poll(() => menuLabels(app)).toContain('文件')
    await expect.poll(() => storedLanguage(directory)).toBe('zh-CN')
    const restoredPanel = await topicProperties(page)
    await expect(restoredPanel.getByRole('textbox', { name: '主题备注', exact: true })).toHaveText(
      '中文备注\n保留第二行',
    )
    await page.keyboard.press('ControlOrMeta+s')
    await expect(page.locator('.save-status')).toContainText('已保存')
    expect(decodeBrainstorming(await readFile(path))).toEqual(before)
  } finally {
    app.process().kill('SIGKILL')
    await rm(directory, { recursive: true, force: true })
  }
})
