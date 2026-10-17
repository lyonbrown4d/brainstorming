import { openExample } from '@tests/e2e/workspace'
import { expect, test, type Page } from '@playwright/test'
import { structureOptions } from '@renderer/components/documents/structureOptions'
import { dockAction } from '@tests/e2e/dock'

const applyStructure = async (page: Page, label: string) => {
  await dockAction(page, '图形结构')
  const picker = page.getByRole('dialog', { name: '图形结构', exact: true })
  const option = picker.getByRole('button', { name: `应用${label}`, exact: true })
  await option.click()
  await expect(option).toHaveAttribute('aria-pressed', 'true')
  await page.keyboard.press('Escape')
}

const newStructures = new Set([
  'tree-down',
  'tree-up',
  'brace-right',
  'brace-left',
  'timeline-vertical',
  'tree-table-right',
  'tree-table-down',
])

test('三维显示全部结构并保留可编辑主题，记录实际 WebGL 画面', async ({ page }, testInfo) => {
  test.setTimeout(120_000)
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await openExample(page)
  await page.getByRole('button', { name: '三维视图', exact: true }).click()
  for (const { value, label } of structureOptions) {
    await applyStructure(page, label)
    await expect(page.getByRole('button', { name: '选择主题 产品规划', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: /^选择主题 / })).toHaveCount(13)
    await expect(page.getByRole('button', { name: '三维视图', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    const surface = page.getByRole('region', { name: '3D 思维导图', exact: true })
    await expect(surface.locator('canvas')).toBeVisible()
    // Capture the rendered WebGL canvas together with editable labels, rather than inspecting data attributes.
    await testInfo.attach(`3d-${value}`, {
      body: await surface.screenshot(),
      contentType: 'image/png',
    })
  }
  expect(errors).toEqual([])
})

test('新增三维结构均可原位中文编辑并与二维共用一次撤销重做', async ({ page }) => {
  test.setTimeout(180_000)
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await openExample(page)
  await page.getByRole('button', { name: '三维视图', exact: true }).click()
  for (const { label } of structureOptions.filter((option) => newStructures.has(option.value))) {
    await applyStructure(page, label)
    const root = page.getByRole('button', { name: '选择主题 产品规划', exact: true })
    await expect(root).toBeVisible()
    await root.dblclick()
    const editor = page.getByRole('textbox', { name: '编辑主题标题', exact: true })
    await expect(editor).toBeFocused()
    const title = `三维${label}中文输入`
    await editor.fill(title)
    await editor.dispatchEvent('compositionstart')
    await editor.press('Enter')
    await expect(editor).toBeVisible()
    await editor.dispatchEvent('compositionend', { data: '输入' })
    await page.getByRole('button', { name: '二维视图', exact: true }).click()
    await expect(page.getByTestId('topic-root')).toContainText(title)
    await expect(page.locator('.status-bar')).toContainText('13 个主题')
    await dockAction(page, '撤销')
    await expect(page.getByTestId('topic-root')).toContainText('产品规划')
    await dockAction(page, '重做')
    await expect(page.getByTestId('topic-root')).toContainText(title)
    await dockAction(page, '撤销')
    await page.getByRole('button', { name: '三维视图', exact: true }).click()
    await expect(root).toBeVisible()
    await dockAction(page, '图形结构')
    await expect(page.getByRole('button', { name: `应用${label}`, exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await page.keyboard.press('Escape')
  }
  expect(errors).toEqual([])
})
