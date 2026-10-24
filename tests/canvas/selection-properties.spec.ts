import { expect, test } from '@playwright/test'

test('closed property sections mount on demand and preserve an unsubmitted field when folded', async ({
  page,
}) => {
  await page.goto('/iframe.html?id=brainstorming-思维导图--default&viewMode=story')
  const root = page.getByTestId('topic-root')
  await expect(root).toBeVisible()
  await page.getByRole('button', { name: '属性面板', exact: true }).click()
  const panel = page.getByRole('complementary', { name: '属性面板' })
  const node = page.locator('.react-flow__node-topic').filter({ hasNot: root }).first()
  await node.click()
  await expect(panel).toBeVisible()
  // Closed metadata never starts its content editors; opening and folding preserves the DOM.
  const metadata = panel.getByRole('button', { name: '主题扩展信息', exact: true })
  const link = panel.getByRole('textbox', { name: '新标签', exact: true })
  await expect(link).toHaveCount(0)
  await metadata.click()
  await expect(link).toBeVisible()
  await link.fill('未提交标签')
  const original = await link.elementHandle()
  await metadata.click()
  await expect(link).toBeHidden()
  await metadata.click()
  await expect(link).toHaveValue('未提交标签')
  expect(await link.evaluate((element, before) => element === before, original)).toBe(true)
  const position = panel.getByRole('button', { name: '分支位置', exact: true })
  await position.click()
  const chooser = panel.getByRole('combobox', { name: '移动到父主题', exact: true })
  await chooser.click()
  const search = page.getByRole('combobox', { name: '移动到父主题', exact: true }).last()
  await expect(search).toBeFocused()
  await search.fill('不可能匹配的主题')
  await expect(page.getByText('没有匹配的主题', { exact: true })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(chooser).toBeFocused()
  await chooser.click()
  const candidate = page.getByRole('option').last()
  const parentId = await candidate.getAttribute('data-value')
  const topicId = await node.getAttribute('data-id')
  if (!parentId || !topicId) throw new Error('Missing topic IDs in the parent chooser')
  expect(parentId).not.toBe(topicId)
  await candidate.click()
  await expect(page.locator(`.react-flow__edge[data-id="edge-${topicId}"]`)).toHaveAttribute(
    'aria-label',
    `Edge from ${parentId} to ${topicId}`,
  )
  await page.keyboard.press('ControlOrMeta+z')
  await expect(page.locator(`.react-flow__edge[data-id="edge-${topicId}"]`)).toHaveAttribute(
    'aria-label',
    `Edge from root to ${topicId}`,
  )
})

test('topic filters construct results on open and preserve criteria across reopening', async ({
  page,
}) => {
  await page.goto('/iframe.html?id=brainstorming-思维导图--default&viewMode=story')
  await expect(page.getByTestId('topic-root')).toBeVisible()
  const results = page.getByLabel('筛选结果', { exact: true })
  await expect(results).toHaveCount(0)
  await page.getByRole('button', { name: '展开浮动工具栏', exact: true }).click()
  await page.getByRole('button', { name: '主题筛选', exact: true }).click()
  const popup = page.getByRole('dialog', { name: '主题筛选', exact: true })
  await expect(popup).toBeVisible()
  expect(await results.getByRole('button').count()).toBeGreaterThan(5)
  const assignee = popup.getByRole('textbox')
  await assignee.fill('没有这个负责人')
  await expect(results.getByRole('button')).toHaveCount(0)
  await page.keyboard.press('Escape')
  await expect(results).toHaveCount(0)
  await page.getByRole('button', { name: '主题筛选', exact: true }).click()
  await expect(assignee).toHaveValue('没有这个负责人')
  await popup.getByRole('button', { name: '清空筛选', exact: true }).click()
  expect(await results.getByRole('button').count()).toBeGreaterThan(5)
  const match = results.getByRole('button').nth(1)
  const title = await match.innerText()
  await match.click()
  await expect(page.locator('.react-flow__node-topic.selected')).toContainText(title)
})
