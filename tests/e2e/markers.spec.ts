import { expect, test } from '@playwright/test'
import { openExample } from '@tests/e2e/workspace'
import { dockAction } from '@tests/e2e/dock'
test('Dock 图标和任务标记即时应用，并可撤销', async ({ page }) => {
  await openExample(page)
  await page.getByTestId('topic-vision').click()
  await dockAction(page, '图标与任务标记')
  await page.getByRole('button', { name: '优先级 1', exact: true }).click()
  await expect(page.getByTestId('topic-vision')).toContainText('P1')
  await page.getByRole('button', { name: '星标', exact: true }).click()
  await expect(page.getByTestId('topic-vision').getByLabel('星标', { exact: true })).toBeVisible()
  await page.getByRole('combobox', { name: '快捷任务进度', exact: true }).click()
  await page.getByRole('option', { name: '50%', exact: true }).click()
  await expect(page.getByTestId('topic-vision')).toContainText('50%')
  await page.keyboard.press('Escape')
  await dockAction(page, '撤销')
  await expect(page.getByTestId('topic-vision')).not.toContainText('50%')
  await expect(page.getByTestId('topic-vision')).toContainText('P1')
})
test('Simple Icons 本地图标可搜索选择，三维视图仍显示图标', async ({ page }) => {
  const remote: string[] = []
  page.on('request', (request) => {
    if (/https?:\/\/[^/]*iconify/.test(request.url())) remote.push(request.url())
  })
  await openExample(page)
  await page.getByTestId('topic-vision').click()
  await dockAction(page, '图标与任务标记')
  await page.getByRole('combobox', { name: '图标库', exact: true }).click()
  await page.getByRole('option', { name: '品牌图标', exact: true }).click()
  await page.getByRole('textbox', { name: '搜索图标', exact: true }).fill('github')
  await page.getByRole('button', { name: '品牌图标 github', exact: true }).click()
  await expect(page.getByTestId('topic-vision').getByLabel('github', { exact: true })).toBeVisible()
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: '三维视图', exact: true }).click()
  await expect(page.getByLabel('github', { exact: true }).first()).toBeVisible()
  expect(remote).toEqual([])
})
test('画布图标可用两侧手柄缩放、拖动换位，取消与撤销不移动主题', async ({ page }) => {
  await openExample(page)
  const topic = page.getByTestId('topic-vision')
  await topic.click()
  const title = topic.getByRole('textbox', { name: '主题内容', exact: true })
  const titleHeight = await title.evaluate(
    (element) => element.querySelector('p')?.getBoundingClientRect().height,
  )
  await dockAction(page, '图标与任务标记')
  await page.getByRole('button', { name: '星标', exact: true }).click()
  await page.keyboard.press('Escape')
  await expect
    .poll(() =>
      title.evaluate((element) => element.querySelector('p')?.getBoundingClientRect().height),
    )
    .toBe(titleHeight)
  const icon = topic.getByLabel('星标', { exact: true })
  const before = await icon.evaluate((svg) => svg.getBoundingClientRect().width)
  const handle = topic.getByRole('button', { name: '从右侧缩放图标', exact: true })
  const box = await handle.boundingBox()
  if (!box) throw new Error('图标缩放手柄不可见')
  expect(box.width).toBeGreaterThanOrEqual(24)
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width / 2 + 1, box.y + box.height / 2)
  await page.mouse.up()
  await dockAction(page, '撤销')
  await expect(icon).toHaveCount(0)
  await dockAction(page, '重做')
  await expect(icon).toBeVisible()
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width / 2 + 28, box.y + box.height / 2, { steps: 6 })
  await expect
    .poll(() =>
      title.evaluate((element) => element.querySelector('p')?.getBoundingClientRect().height),
    )
    .toBe(titleHeight)
  await page.mouse.up()
  await expect
    .poll(() => icon.evaluate((svg) => svg.getBoundingClientRect().width))
    .toBeGreaterThan(before + 10)
  const enlarged = await icon.evaluate((svg) => svg.getBoundingClientRect().width)
  await dockAction(page, '撤销')
  await expect
    .poll(() => icon.evaluate((svg) => svg.getBoundingClientRect().width))
    .toBeCloseTo(before, 0)
  await dockAction(page, '重做')
  await expect
    .poll(() => icon.evaluate((svg) => svg.getBoundingClientRect().width))
    .toBeCloseTo(enlarged, 0)
  const body = await topic.boundingBox()
  const move = await topic.getByRole('button', { name: '移动主题图标', exact: true }).boundingBox()
  if (!body || !move) throw new Error('主题或图标不可见')
  await page.mouse.move(move.x + move.width / 2, move.y + move.height / 2)
  await page.mouse.down()
  await page.mouse.move(body.x + 2, body.y + body.height / 2, { steps: 5 })
  await expect(topic.getByLabel('主题图标', { exact: true })).toHaveAttribute(
    'data-position',
    'bottom',
  )
  await expect(topic.getByRole('status')).toHaveText('松开放到左侧')
  await page.mouse.up()
  await expect(topic.getByLabel('主题图标', { exact: true })).toHaveAttribute(
    'data-position',
    'left',
  )
  await expect(topic).toContainText('产品愿景')
  const left = await topic
    .getByRole('button', { name: '从左侧缩放图标', exact: true })
    .boundingBox()
  if (!left) throw new Error('左侧手柄不可见')
  const fold = await topic.getByRole('button', { name: '折叠 产品愿景', exact: true }).boundingBox()
  if (!fold) throw new Error('折叠按钮不可见')
  expect(left.x).toBeGreaterThan(fold.x + fold.width / 2)
  await page.mouse.move(left.x + left.width / 2, left.y + left.height / 2)
  await page.mouse.down()
  await page.mouse.move(left.x + 20, left.y)
  await page.keyboard.press('Escape')
  await page.mouse.up()
  await expect
    .poll(() => icon.evaluate((svg) => svg.getBoundingClientRect().width))
    .toBeCloseTo(enlarged, 0)
  await dockAction(page, '撤销')
  await expect(topic.getByLabel('主题图标', { exact: true })).toHaveAttribute(
    'data-position',
    'bottom',
  )
})
test('品牌图标虚拟滚动可直达末尾、键盘选择，搜索重置滚动且节点数量有界', async ({ page }) => {
  await openExample(page)
  await page.getByTestId('topic-vision').click()
  await dockAction(page, '图标与任务标记')
  await page.getByRole('combobox', { name: '图标库', exact: true }).click()
  await page.getByRole('option', { name: '品牌图标', exact: true }).click()
  const grid = page.getByRole('group', { name: '品牌图标', exact: true })
  const buttons = grid.getByRole('button')
  await expect(buttons.first()).toBeVisible()
  expect(await buttons.count()).toBeLessThan(100)
  const first = await buttons.first().getAttribute('aria-label')
  await buttons.first().focus()
  await page.keyboard.press('End')
  await expect(buttons.last()).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page.getByLabel('已选图标', { exact: true }).getByRole('button')).toHaveCount(1)
  expect(await buttons.count()).toBeLessThan(100)
  expect(await buttons.last().getAttribute('aria-label')).not.toBe(first)
  await page.getByRole('textbox', { name: '搜索图标', exact: true }).fill('github')
  await expect(grid.getByRole('button', { name: '品牌图标 github', exact: true })).toBeVisible()
  await page.getByRole('textbox', { name: '搜索图标', exact: true }).fill('no-such-trelyx-icon')
  await expect(page.getByText('没有匹配的图标。', { exact: true })).toBeVisible()
  await page.getByRole('textbox', { name: '搜索图标', exact: true }).fill('')
  await expect(buttons.first()).toHaveAttribute('aria-label', first ?? '')
  await expect(buttons.first()).toBeVisible()
})
