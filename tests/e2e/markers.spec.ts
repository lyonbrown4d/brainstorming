import { expect, test } from '@playwright/test'
import { openExample } from './workspace'
import { dockAction } from './dock'

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
