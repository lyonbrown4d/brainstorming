import { completeDocumentCreation, openExample } from './workspace'
import { expect, test, type Page } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { decodeTrelyx } from '../../src/formats/trelyx'
import { legacyXmind, modernXmind } from '../fixtures/xmind/archive'

async function fileAction(page: Page, name: string) {
  if (name === '打开导图')
    await expect
      .poll(
        async () =>
          (await page.getByRole('button', { name: '打开本地文件', exact: true }).isVisible()) ||
          (await page.getByRole('button', { name: '文件菜单', exact: true }).isVisible()),
      )
      .toBe(true)
  if (
    name === '打开导图' &&
    (await page.getByRole('button', { name: '打开本地文件', exact: true }).isVisible())
  ) {
    await page.getByRole('button', { name: '打开本地文件', exact: true }).click()
    return
  }
  await page.getByRole('button', { name: '文件菜单', exact: true }).click()
  await page.getByRole('menuitem', { name, exact: true }).click()
  if (name === '新建导图') await completeDocumentCreation(page)
}

for (const variant of [
  { name: '现代', bytes: modernXmind, root: 'root', title: '中心主题', sheet: '第二页' },
  { name: '旧版', bytes: legacyXmind, root: 'legacy-root', title: '中文旧版', sheet: '旧版第二页' },
]) {
  test(`${variant.name} XMind 导入、查看报告、编辑、保存原生文件并重开`, async ({ page }) => {
    page.on('dialog', (dialog) => dialog.accept())
    await page.goto('/')
    const picker = page.waitForEvent('filechooser')
    await fileAction(page, '打开导图')
    await (
      await picker
    ).setFiles({
      name: 'example.xmind',
      mimeType: 'application/zip',
      buffer: Buffer.from(variant.bytes()),
    })
    const root = page.getByTestId(`topic-${variant.root}`)
    await expect(root).toContainText(variant.title)
    await expect(page.getByRole('tab')).toHaveCount(2)
    await expect(page.locator('.save-status')).toContainText('未保存')
    await page.getByRole('button', { name: '查看导入报告' }).click()
    const report = page.getByRole('dialog', { name: '导入报告' })
    await expect(report).toContainText('example.xmind')
    await expect(report.locator('li')).not.toHaveCount(0)
    await page.keyboard.press('Escape')
    await page.getByRole('tab', { name: variant.sheet, exact: true }).click()
    await page.getByRole('tab').first().click()
    await root.dblclick()
    await page.getByRole('textbox', { name: '编辑主题标题' }).fill('导入后继续编辑')
    await page.locator('.react-flow__pane').click({ position: { x: 20, y: 20 } })
    const download = page.waitForEvent('download')
    await fileAction(page, '保存导图')
    const file = await download
    expect(file.suggestedFilename()).toMatch(/\.trelyx$/u)
    const path = await file.path()
    if (!path) throw new Error('没有生成原生文件')
    expect(decodeTrelyx(await readFile(path)).sheets[0]?.document.title).toBe('导入后继续编辑')
    await fileAction(page, '新建导图')
    const reopen = page.waitForEvent('filechooser')
    await fileAction(page, '打开导图')
    await (await reopen).setFiles(path)
    await expect(root).toContainText('导入后继续编辑')
    await expect(page.getByRole('tab')).toHaveCount(2)
    await expect(page.locator('.import-banner')).toHaveCount(0)
  })
}

test('旧 JSON 文件与损坏 XMind 不替换当前导图', async ({ page }) => {
  page.on('dialog', (dialog) => dialog.accept())
  await openExample(page)
  for (const [name, contents] of [
    ['old.trelyx', '{"format":"trelyx","version":2}'],
    ['bad.xmind', 'bad'],
  ] as const) {
    const picker = page.waitForEvent('filechooser')
    await fileAction(page, '打开导图')
    await (
      await picker
    ).setFiles({ name, mimeType: 'application/zip', buffer: Buffer.from(contents) })
    await expect(page.getByRole('alert')).toBeVisible()
    await expect(page.getByTestId('topic-root')).toContainText('产品规划')
  }
})
