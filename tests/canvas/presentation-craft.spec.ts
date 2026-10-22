import { expect, test, type Page } from '@playwright/test'

const open = async (page: Page, story = 'audience') => {
  await page.goto(`/iframe.html?id=brainstorming-演示页面--${story}&viewMode=story`)
  await expect(
    page.getByRole('region', {
      name: story === 'english-audience' ? 'Audience view' : '观众画面',
      exact: true,
    }),
  ).toBeVisible()
}
const current = (page: Page) =>
  page.locator('[data-presentation-surface] [data-presentation-slide]')

test('controls recede after idle and remain available to keyboard focus and the searchable page picker', async ({
  page,
}) => {
  await page.clock.install()
  await open(page)
  const chrome = page.locator('[data-presentation-chrome]')
  await page.clock.fastForward(3000)
  await expect(chrome).toHaveAttribute('data-presentation-chrome', 'hidden')
  await page.keyboard.press('ArrowRight')
  await expect(chrome).toHaveAttribute('data-presentation-chrome', 'visible')
  await expect(current(page).locator('article')).toHaveCount(1)
  const jump = page.getByRole('button', { name: '跳转到页面', exact: true })
  await jump.focus()
  await page.clock.fastForward(3000)
  await expect(chrome).toHaveAttribute('data-presentation-chrome', 'visible')
  await jump.click()
  const search = page.getByRole('combobox', { name: '跳转到页面', exact: true })
  await expect(search).toBeFocused()
  await search.fill('不存在的页面')
  await expect(page.getByText('没有匹配的页面', { exact: true })).toBeVisible()
  await expect(current(page)).toHaveAttribute('aria-label', '行程安排')
  await search.fill('住宿')
  await page.keyboard.press('ArrowDown')
  await expect(current(page)).toHaveAttribute('aria-label', '行程安排')
  await page.keyboard.press('Escape')
  await expect(search).toHaveCount(0)
  await expect(current(page)).toHaveAttribute('aria-label', '行程安排')
  await expect(jump).toBeFocused()
  await jump.click()
  await page.getByRole('combobox', { name: '跳转到页面', exact: true }).fill('住宿')
  await page.getByRole('option').filter({ hasText: '住宿信息' }).click()
  await expect(current(page)).toHaveAttribute('data-slide-composition', 'focus')
  await expect(current(page)).toHaveAttribute('aria-label', '住宿信息')
  await expect(page.getByRole('region', { name: '观众画面', exact: true })).toBeFocused()
  await page.keyboard.press('Space')
  await expect(page.locator('[data-presentation-page-jump]')).toHaveCount(0)
  await expect(current(page)).toHaveCount(1)
  await page.keyboard.press('Escape')
  await expect(page.getByRole('region', { name: '演示编排', exact: true })).toBeVisible()
})

test('rapid forward/back navigation keeps one live page and reduced motion removes spatial transitions', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce', colorScheme: 'dark' })
  await open(page)
  await page.keyboard.press('Home')
  await expect(current(page)).toHaveAttribute('data-slide-composition', 'cover')
  for (const key of ['End', 'Home', 'End', 'ArrowLeft']) await page.keyboard.press(key)
  await expect(current(page)).toHaveAttribute('aria-label', '行程安排')
  await expect(current(page)).toHaveCount(1)
  await expect
    .poll(() =>
      current(page).evaluate(
        (element) => getComputedStyle(element.parentElement ?? element).transform,
      ),
    )
    .toBe('none')
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('ArrowRight')
  await expect(current(page).locator('article')).toHaveCount(2)
  await expect(current(page).locator('h2')).toHaveCSS('opacity', '1')
  await page.screenshot({ path: 'test-results/canvas/presentation-stage-content.png' })
  await page.keyboard.press('Home')
  await page.screenshot({ path: 'test-results/canvas/presentation-stage-cover.png' })
})

test('English playback exposes named controls and a usable page search', async ({ page }) => {
  await open(page, 'english-audience')
  await page.getByRole('button', { name: 'Jump to slide', exact: true }).click()
  await page.getByRole('combobox', { name: 'Jump to slide', exact: true }).fill('3')
  await expect(page.getByRole('option')).toHaveCount(1)
  await page.keyboard.press('Enter')
  await expect(current(page)).toHaveAttribute('aria-label', '住宿信息')
  await page.getByRole('button', { name: 'Presenter view', exact: true }).click()
  await expect(page.getByRole('region', { name: 'Presenter view', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Audience view', exact: true })).toHaveCount(1)
})
