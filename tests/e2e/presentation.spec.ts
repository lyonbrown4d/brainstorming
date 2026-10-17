import { prepareNativeSave } from '@tests/electron/native-files'
import { expect, test, type Page } from '@tests/electron/fixture'
import { readFile } from 'node:fs/promises'
import { decodeBrainstorming } from '@tests/electron/codec'
import { openExample } from '@tests/e2e/workspace'

const savedWorkbook = async (page: Page) => {
  const pending = await prepareNativeSave(page)
  await page.keyboard.press('ControlOrMeta+s')
  const path = await pending.path()
  if (!path) throw new Error('没有生成保存文件')
  return await decodeBrainstorming(await readFile(path))
}

for (const mode of ['2d', '3d'] as const) {
  test(`${mode} 自动演示只读导航，拒绝全屏仍可播放，退出恢复选择与视图`, async ({ page }) => {
    await page.addInitScript(() => {
      Element.prototype.requestFullscreen = () =>
        Promise.reject(new Error('Fullscreen unavailable'))
    })
    await openExample(page)
    await page.getByTestId('topic-experience').click()
    const before = await savedWorkbook(page)
    if (mode === '3d') {
      await page.getByRole('button', { name: '三维视图', exact: true }).click()
      await expect(
        page.getByRole('button', { name: '选择主题 核心体验', exact: true }),
      ).toBeVisible()
    }
    let beforeViewport: string | null = null
    if (mode === '2d') {
      const pane = await page.locator('.react-flow__pane').boundingBox()
      if (!pane) throw new Error('缺少画布')
      await page.mouse.move(pane.x + 40, pane.y + 30)
      await page.mouse.down({ button: 'middle' })
      await page.mouse.move(pane.x + pane.width - 40, pane.y + 30, { steps: 12 })
      await page.mouse.up({ button: 'middle' })
      beforeViewport = await page.locator('.react-flow__viewport').getAttribute('style')
    }
    await expect(page.getByRole('button', { name: '开始演示', exact: true })).toBeEnabled()
    await page.getByRole('button', { name: '开始演示', exact: true }).click()
    const playback = page.getByRole('toolbar', { name: '演示播放控制', exact: true })
    await expect(playback).toContainText('自动演示')
    await expect(page.getByRole('button', { name: '文件菜单', exact: true })).toHaveCount(0)
    await expect(page.getByRole('button', { name: '展开浮动工具栏', exact: true })).toHaveCount(0)
    await playback.getByRole('button', { name: '全屏演示', exact: true }).click()
    await expect(playback).toBeVisible()
    await page.keyboard.press('End')
    await expect(playback.getByRole('button', { name: '下一步演示', exact: true })).toBeDisabled()
    await page.keyboard.press('Home')
    await expect(playback.getByRole('button', { name: '上一步演示', exact: true })).toBeDisabled()
    await page.keyboard.press('ArrowRight')
    await expect(playback).toContainText('2 /')
    await page.keyboard.press('F2')
    await page.keyboard.press('x')
    await page.keyboard.press('Delete')
    await page.keyboard.press('ControlOrMeta+z')
    await expect(page.getByRole('textbox', { name: '编辑主题标题', exact: true })).toHaveCount(0)
    await page.keyboard.press('Escape')
    await expect(playback).toHaveCount(0)
    await expect(page.getByRole('button', { name: '文件菜单', exact: true })).toBeVisible()
    if (mode === '3d') {
      await expect(
        page.getByRole('button', { name: '选择主题 核心体验', exact: true }),
      ).toHaveAttribute('aria-pressed', 'true')
      await expect(page.getByRole('button', { name: '三维视图', exact: true })).toHaveAttribute(
        'aria-pressed',
        'true',
      )
    }
    if (beforeViewport) {
      await page.evaluate(
        () =>
          new Promise<void>((resolve) =>
            requestAnimationFrame(() =>
              requestAnimationFrame(() => {
                resolve()
              }),
            ),
          ),
      )
      await expect(page.locator('.react-flow__viewport')).toHaveAttribute('style', beforeViewport)
    }
    if (mode === '2d') {
      // The original selection is offscreen and intentionally virtualized after restoration.
      await page.getByRole('button', { name: '聚焦选中主题', exact: true }).click()
      await expect(page.getByTestId('topic-experience')).toHaveClass(/is-selected/)
    }
    expect(await savedWorkbook(page)).toEqual(before)
  })
}
