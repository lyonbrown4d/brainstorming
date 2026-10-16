import { expect, test, type Page } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { importXmind } from '../../src/formats/xmind'
import { openDock, dockAction } from './dock'

async function fileAction(page: Page, label: string) {
  await page.getByRole('button', { name: '文件菜单', exact: true }).click()
  await page.getByRole('menuitem', { name: label, exact: true }).click()
}

test('完整导图可导出图片、PDF、大纲和XMind，超出当前视口的主题仍保留', async ({ page }) => {
  await page.goto('/')
  await openDock(page)
  await page.getByRole('button', { name: '导出', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: '导出导图', exact: true })
  for (const [label, extension] of [
    ['PNG 图片', 'png'],
    ['SVG 矢量图', 'svg'],
    ['PDF 文档', 'pdf'],
    ['Markdown 大纲', 'md'],
    ['OPML 大纲', 'opml'],
    ['纯文本大纲', 'txt'],
    ['XMind 工作簿', 'xmind'],
  ] as const) {
    await dialog.getByRole('combobox', { name: '导出格式', exact: true }).click()
    await page.getByRole('option', { name: label, exact: true }).click()
    const download = page.waitForEvent('download')
    await dialog.getByRole('button', { name: '导出文件', exact: true }).click()
    const file = await download
    expect(file.suggestedFilename()).toMatch(new RegExp(`\\.${extension}$`))
    const path = await file.path()
    if (!path) throw new Error('没有生成导出文件')
    const bytes = await readFile(path)
    if (extension === 'png') {
      expect(bytes.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
      expect(bytes.readUInt32BE(16)).toBeGreaterThan(500)
      expect(bytes.readUInt32BE(20)).toBeGreaterThan(200)
    } else if (extension === 'pdf') expect(bytes.subarray(0, 5).toString()).toBe('%PDF-')
    else if (extension === 'xmind') {
      const { workbook } = importXmind(bytes)
      expect(workbook.sheets).toHaveLength(1)
      expect(
        Object.values(workbook.sheets[0]?.document.topics ?? {}).some(
          (topic) => topic.title === '快捷记录灵感',
        ),
      ).toBe(true)
    } else {
      expect(bytes.toString()).toContain('产品规划')
      expect(bytes.toString()).toContain('快捷记录灵感')
    }
    await expect(dialog.getByRole('button', { name: '导出文件', exact: true })).toBeEnabled()
  }
})

test('跨Sheet查找、当前Sheet批量替换可整次撤销', async ({ page }) => {
  await page.goto('/')
  await page.getByTestId('topic-root').click()
  await page.keyboard.press('ControlOrMeta+f')
  const search = page.getByRole('dialog', { name: '查找与替换', exact: true })
  await search.getByRole('textbox', { name: '查找文本', exact: true }).fill('产品')
  await search.getByRole('textbox', { name: '替换为', exact: true }).fill('项目')
  await search.getByRole('button', { name: '替换当前画布全部', exact: true }).click()
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('topic-root')).toContainText('项目规划')
  await dockAction(page, '撤销')
  await expect(page.getByTestId('topic-root')).toContainText('产品规划')
  await page.keyboard.press('ControlOrMeta+f')
  await search.getByRole('button', { name: '所有画布', exact: true }).click()
  await search.getByRole('textbox', { name: '查找文本', exact: true }).fill('用户')
  const results = search.locator('[aria-label="查找结果"]')
  await expect(results.getByRole('button').first()).toBeVisible()
  await results
    .getByRole('button', { name: /用户研究 ·/ })
    .first()
    .click()
  await page.keyboard.press('Escape')
  await expect(
    page.getByRole('tab', { name: '用户研究', selected: true, exact: true }),
  ).toBeVisible()
})

test('密码保护的浏览器文件保存、错误重试、取消与重新解锁', async ({ page }) => {
  page.on('dialog', (dialog) => dialog.accept())
  await page.goto('/')
  await openDock(page)
  await page.getByRole('button', { name: '文件密码', exact: true }).click()
  const settings = page.getByRole('dialog', { name: '文件密码', exact: true })
  await settings.getByLabel('密码', { exact: true }).fill('test-passphrase-2026')
  await settings.getByLabel('确认密码', { exact: true }).fill('test-passphrase-2026')
  await settings.getByRole('button', { name: '启用密码', exact: true }).click()
  await expect(settings).toBeHidden()
  await page.keyboard.press('Escape')
  const download = page.waitForEvent('download')
  await fileAction(page, '保存导图')
  const downloaded = await download
  const saved = await downloaded.path()
  if (!saved) throw new Error('没有保存加密文件')
  const bytes = await readFile(saved)
  expect(bytes.includes(Buffer.from('产品规划'))).toBe(false)
  await fileAction(page, '新建导图')
  const open = async () => {
    const chooser = page.waitForEvent('filechooser')
    await fileAction(page, '打开导图')
    await (
      await chooser
    ).setFiles({
      name: downloaded.suggestedFilename(),
      mimeType: 'application/vnd.trelyx+zip',
      buffer: bytes,
    })
  }
  await open()
  const unlock = page.getByRole('dialog', { name: '解锁思维导图', exact: true })
  await unlock.getByLabel('密码', { exact: true }).fill('incorrect-password')
  await unlock.getByRole('button', { name: '解锁', exact: true }).click()
  await expect(unlock.getByRole('alert')).toContainText('密码错误')
  await unlock.getByRole('button', { name: '取消', exact: true }).click()
  await expect(page.getByTestId('topic-root')).toContainText('新的想法')
  await open()
  await unlock.getByLabel('密码', { exact: true }).fill('test-passphrase-2026')
  await unlock.getByRole('button', { name: '解锁', exact: true }).click()
  await expect(page.getByTestId('topic-root')).toContainText('产品规划')
})
