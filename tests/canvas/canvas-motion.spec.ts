import { expect, test, type Page } from '@playwright/test'

const open = async (page: Page) => {
  await page.goto('/iframe.html?id=brainstorming-画布动效--default&viewMode=story')
  await expect(page.getByTestId('topic-root')).toBeVisible()
  await expect(page.locator('[data-canvas-loading]')).toHaveCount(0)
}

test('selection uses a short feedback animation without an extra outline or visible connector dots', async ({
  page,
}) => {
  await open(page)
  const node = page.getByTestId('topic-other')
  await node.hover()
  await expect(node).toHaveCSS('outline-width', '0px')
  const dots = node.locator('.topic-connect-handle')
  for (const dot of await dots.all()) {
    await expect(dot).toHaveCSS('opacity', '0')
    await expect(dot).toHaveCSS('pointer-events', 'none')
  }
  await node.click()
  await expect(node).toHaveClass(/is-selected/)
  await expect(node).toHaveCSS('outline-width', '0px')
  await expect(node).toHaveCSS('animation-name', 'topic-select')
  const arrows = page.locator('.topic-scale-control svg')
  await expect(arrows).toHaveCount(4)
  await expect(arrows.first()).toHaveCSS('animation-name', 'topic-controls-enter')
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.getByTestId('topic-a').click()
  await expect(page.getByTestId('topic-a')).toHaveCSS('animation-name', 'none')
  await expect(page.locator('.topic-scale-control svg').first()).toHaveCSS('animation-name', 'none')
})

const observeFade = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<boolean>((resolve) => {
        const observer = new MutationObserver(() => {
          const fading = [
            ...document.querySelectorAll<HTMLElement>('.react-flow__node-topic'),
          ].some((node) => node.style.opacity !== '' && Number(node.style.opacity) < 0.99)
          if (fading) {
            observer.disconnect()
            clearTimeout(timer)
            resolve(true)
          }
        })
        const timer = setTimeout(() => {
          observer.disconnect()
          resolve(false)
        }, 1500)
        observer.observe(document.body, {
          childList: true,
          subtree: true,
          attributes: true,
          attributeFilter: ['style'],
        })
      }),
  )

test('creation and deletion animate without delaying the title editor or leaving interactive ghosts', async ({
  page,
}) => {
  await open(page)
  await page.getByTestId('topic-root').click()
  const entrance = observeFade(page)
  await page.keyboard.press('Tab')
  const editor = page.getByRole('textbox', { name: '编辑主题标题', exact: true })
  await expect(editor).toBeFocused()
  expect(await entrance).toBe(true)
  await page.keyboard.insertText('动效期间继续输入')
  await page.keyboard.press('Enter')
  const node = page.locator('.react-flow__node-topic').filter({ hasText: '动效期间继续输入' })
  await expect(node).toHaveCSS('opacity', '1')
  const exit = observeFade(page)
  await page.keyboard.press('Backspace')
  expect(await exit).toBe(true)
  await expect(node).toHaveCount(0)
  await expect(page.locator('.react-flow__node-topic[inert]')).toHaveCount(0)
  await page.keyboard.press('ControlOrMeta+z')
  await expect(node).toBeVisible()
  await expect(node).toHaveCSS('opacity', '1')
})

test('reduced motion completes immediately and rapid keyboard creation keeps focus and history', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await open(page)
  await page.getByTestId('topic-root').click()
  const entrance = observeFade(page)
  await page.keyboard.press('Tab')
  const editor = page.getByRole('textbox', { name: '编辑主题标题', exact: true })
  await expect(editor).toBeFocused()
  await page.keyboard.insertText('第一项')
  await page.keyboard.press('Tab')
  await expect(editor).toBeFocused()
  await page.keyboard.insertText('第二项')
  await page.keyboard.press('Enter')
  expect(await entrance).toBe(false)
  await expect(page.getByText('第一项', { exact: true })).toBeVisible()
  await expect(page.getByText('第二项', { exact: true })).toBeVisible()
  await page.keyboard.press('ControlOrMeta+z')
  await expect(page.getByText('第二项', { exact: true })).toHaveCount(0)
  await expect(page.locator('.react-flow__node-topic[inert]')).toHaveCount(0)
})

test('style paste acknowledges the change and undo animates a moved topic back into place', async ({
  page,
}) => {
  await open(page)
  const source = page.getByTestId('topic-a')
  const target = page.getByTestId('topic-other')
  await source.click({ button: 'right' })
  await page.getByText('复制与应用样式', { exact: true }).hover()
  await page.getByRole('menuitem', { name: '复制主题样式', exact: true }).click()
  await target.click({ button: 'right' })
  await page.getByText('复制与应用样式', { exact: true }).hover()
  const appearance = observeFade(page)
  await page.getByRole('menuitem', { name: '粘贴样式到选中主题（1）', exact: true }).click()
  expect(await appearance).toBe(true)
  const node = page.locator('.react-flow__node-topic[data-id="other"]')
  await expect(node).toHaveCSS('opacity', '1')
  const original = await node.boundingBox()
  if (!original) throw new Error('Missing topic')
  await page.mouse.move(original.x + original.width / 2, original.y + 3)
  await page.mouse.down()
  await page.mouse.move(original.x + original.width / 2 + 100, original.y + 83, { steps: 12 })
  await page.mouse.up()
  await expect.poll(async () => (await node.boundingBox())?.x).toBeGreaterThan(original.x + 50)
  const movement = page.evaluate(
    () =>
      new Promise<boolean>((resolve) => {
        const node = document.querySelector<HTMLElement>('.react-flow__node-topic[data-id="other"]')
        if (!node) {
          resolve(false)
          return
        }
        const positions = new Set<string>()
        const observer = new MutationObserver(() => {
          positions.add(node.style.transform)
          if (positions.size >= 3) {
            observer.disconnect()
            clearTimeout(timer)
            resolve(true)
          }
        })
        const timer = setTimeout(() => {
          observer.disconnect()
          resolve(false)
        }, 1500)
        observer.observe(node, { attributes: true, attributeFilter: ['style'] })
      }),
  )
  await page.keyboard.press('ControlOrMeta+z')
  expect(await movement).toBe(true)
  await expect
    .poll(async () => Math.abs(((await node.boundingBox())?.x ?? Infinity) - original.x))
    .toBeLessThan(1)
  await node.click()
  await expect(node).toHaveClass(/selected/)
  await page.screenshot({ path: 'test-results/canvas/canvas-motion-settled.png' })
})
