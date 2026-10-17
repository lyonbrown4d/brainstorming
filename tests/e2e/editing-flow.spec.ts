import { expect, test } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { decodeTrelyx } from '@formats/trelyx'
import { openExample } from '@tests/e2e/workspace'
import { dockAction } from '@tests/e2e/dock'
import { composeChinese } from '@tests/e2e/ime'

for (const mode of ['2d', '3d'] as const) {
  test(`${mode} Tab / Enter 连续创建后自动聚焦并替换占位文字，保存保留主题层级`, async ({
    page,
  }) => {
    await page.goto('/')
    await page.getByRole('button', { name: '下一步', exact: true }).click()
    await page.getByRole('button', { name: '创建文档', exact: true }).click()
    if (mode === '3d') {
      await page.getByRole('button', { name: '三维视图', exact: true }).click()
      await page.getByRole('button', { name: '选择主题 新的想法', exact: true }).click()
    } else await page.getByTestId('topic-root').click()
    const input = page.getByRole('textbox', { name: '编辑主题标题', exact: true })
    const ids: string[] = []
    for (const [key, title] of [
      ['Tab', 'Alpha'],
      ['Tab', 'Beta'],
      ['Enter', 'Gamma'],
    ] as const) {
      if (key === 'Enter') await page.keyboard.press('Enter') // Commit the current text first.
      await page.keyboard.press(key)
      await expect(input).toBeFocused()
      expect(await page.evaluate(() => getSelection()?.toString())).toBe('新主题')
      await page.keyboard.type(title)
      await expect(input).toHaveText(title)
      const id = await input.getAttribute('data-topic-id')
      if (!id) throw new Error('新主题缺少 ID')
      ids.push(id)
    }
    const download = page.waitForEvent('download')
    await page.keyboard.press('ControlOrMeta+s')
    const path = await (await download).path()
    if (!path) throw new Error('没有生成保存文件')
    const document = decodeTrelyx(await readFile(path)).sheets[0]?.document
    expect(document?.topics[ids[0] ?? '']?.title).toBe('Alpha')
    expect(document?.topics[ids[0] ?? '']?.children).toEqual(ids.slice(1))
    expect(document?.topics[ids[1] ?? '']?.title).toBe('Beta')
    expect(document?.topics[ids[2] ?? '']?.title).toBe('Gamma')
    if (mode === '3d') {
      await page.getByRole('button', { name: '选择主题 Gamma', exact: true }).click()
      await page.keyboard.press('ArrowLeft')
      await expect(page.getByRole('button', { name: '选择主题 Alpha', exact: true })).toBeFocused()
      await page.keyboard.press('ArrowRight')
      await expect(page.getByRole('button', { name: '选择主题 Beta', exact: true })).toBeFocused()
      await page.keyboard.press('F2')
      await expect(input).toBeFocused()
      await page.keyboard.type('Beta changed')
      await expect(input).toHaveText('Beta changed')
      await page.keyboard.press('Escape')
      await expect(page.getByRole('button', { name: '选择主题 Beta', exact: true })).toBeVisible()
    }
  })
}

test('折叠分支新增子主题自动展开并聚焦，撤销一次恢复折叠和原有内容', async ({ page }) => {
  await openExample(page)
  await page.getByTestId('topic-experience').click()
  await page.getByRole('button', { name: '折叠 核心体验', exact: true }).click()
  await expect(page.getByTestId('topic-experience-0')).toHaveCount(0)
  await page.getByTestId('topic-experience').click()
  await page.keyboard.press('Tab')
  const input = page.getByRole('textbox', { name: '编辑主题标题', exact: true })
  await expect(input).toBeFocused()
  await expect(page.getByTestId('topic-experience-0')).toBeVisible()
  await expect(page.getByRole('button', { name: '折叠 核心体验', exact: true })).toBeVisible()
  const id = await input.getAttribute('data-topic-id')
  if (!id) throw new Error('新主题缺少 ID')
  await composeChinese(page, input, '新增体验')
  await page.keyboard.press('Escape')
  await dockAction(page, '撤销')
  await expect(page.getByTestId(`topic-${id}`)).toHaveCount(0)
  await expect(page.getByTestId('topic-experience-0')).toHaveCount(0)
  await expect(page.getByRole('button', { name: '展开 核心体验', exact: true })).toBeVisible()
  await dockAction(page, '重做')
  await expect(page.getByTestId(`topic-${id}`)).toContainText('新主题')
  await expect(page.getByTestId('topic-experience-0')).toBeVisible()
})
