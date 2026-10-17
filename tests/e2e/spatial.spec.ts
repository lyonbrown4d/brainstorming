import { closeDocumentTab } from '@tests/e2e/documents'
import { prepareNativeSave, prepareNativeOpen } from '@tests/electron/native-files'
import { resizeWindow } from '@tests/electron/session'
import { reloadWindow } from '@tests/electron/session'
import { completeDocumentCreation, enterExampleIfHome, openExample } from '@tests/e2e/workspace'
import { dockAction } from '@tests/e2e/dock'
import { expect, test, type Page } from '@tests/electron/fixture'

const fileAction = async (page: Page, name: string) => {
  await page.getByRole('button', { name: '文件菜单', exact: true }).click()
  await page.getByRole('menuitem', { name, exact: true }).click()
  if (name === '新建导图') await completeDocumentCreation(page)
}

test.beforeEach(async ({ page }) => {
  page.on('dialog', (dialog) => dialog.accept())
  await openExample(page)
})

test('三维聚焦、折叠、中文编辑与二维共享历史，整份文档保存重开', async ({ page }, testInfo) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.getByRole('button', { name: '三维视图', exact: true }).click()
  const experience = page.getByRole('button', { name: '选择主题 核心体验', exact: true })
  await expect(experience).toBeVisible()
  await expect(page.locator('.save-status')).toContainText('本地草稿')
  await page.screenshot({ path: testInfo.outputPath('spatial-overview.png') })
  await experience.click()
  await page.getByRole('button', { name: '聚焦主题 核心体验', exact: true }).click()
  await expect(page.getByRole('navigation', { name: '聚焦路径' })).toContainText('核心体验')
  const title = page.getByRole('textbox', { name: '主题名称', exact: true })
  await expect(title).toHaveText('核心体验')
  await page.screenshot({ path: testInfo.outputPath('spatial-focus.png') })
  await title.fill('三维中文体验')
  const notes = page.getByRole('textbox', { name: '主题备注', exact: true })
  await notes.fill('空间中查看\n侧栏中编辑')
  await page.getByRole('button', { name: '返回全图', exact: true }).click()
  await page.getByRole('button', { name: '折叠 三维中文体验', exact: true }).click()
  await expect(
    page.getByRole('button', { name: '选择主题 快捷记录灵感', exact: true }),
  ).toHaveCount(0)
  await dockAction(page, '撤销')
  await expect(
    page.getByRole('button', { name: '选择主题 快捷记录灵感', exact: true }),
  ).toBeVisible()
  await page.getByRole('button', { name: '二维视图', exact: true }).click()
  await expect(page.getByTestId('topic-experience')).toContainText('三维中文体验')
  await expect(notes).toHaveText('空间中查看\n侧栏中编辑')
  await dockAction(page, '撤销')
  await expect(notes).toHaveText('')
  await dockAction(page, '重做')
  await page.getByRole('button', { name: '三维视图', exact: true }).click()
  const download = await prepareNativeSave(page)
  await fileAction(page, '保存导图')
  const saved = await download.path()
  if (!saved) throw new Error('没有保存文件')
  await fileAction(page, '新建导图')
  await closeDocumentTab(page)
  await expect(page.getByRole('button', { name: '二维视图' })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  const chooser = await prepareNativeOpen(page)
  await fileAction(page, '打开导图')
  await chooser.selectFile(saved)
  await page.getByRole('button', { name: '三维视图', exact: true }).click()
  await page.getByRole('button', { name: '选择主题 三维中文体验', exact: true }).click()
  await page.getByRole('button', { name: '聚焦主题 三维中文体验', exact: true }).click()
  await expect(notes).toHaveText('空间中查看\n侧栏中编辑')
  expect(errors).toEqual([])
})

test('各 Sheet 记住维度和聚焦，缩放与重置可用，窄窗可以收放面板', async ({ page }) => {
  await page.getByRole('button', { name: '三维视图', exact: true }).click()
  await page.getByRole('button', { name: '选择主题 核心体验', exact: true }).click()
  await page.getByRole('button', { name: '聚焦主题 核心体验', exact: true }).click()
  const zoom = page.getByRole('status', { name: '3D 缩放比例' })
  await expect(zoom).toContainText('%')
  const before = await zoom.textContent()
  await page.getByRole('button', { name: '放大 3D 画布', exact: true }).click()
  await expect(zoom).not.toHaveText(before ?? '')
  await page
    .getByRole('tablist', { name: '文档画布', exact: true })
    .getByRole('tab', { name: '用户研究', exact: true })
    .click()
  await expect(page.getByRole('button', { name: '二维视图' })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await page
    .getByRole('tablist', { name: '文档画布', exact: true })
    .getByRole('tab', { name: '产品总览', exact: true })
    .click()
  await expect(page.getByRole('button', { name: '三维视图' })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await expect(page.getByRole('navigation', { name: '聚焦路径' })).toContainText('核心体验')
  await page.getByRole('button', { name: '重置视角', exact: true }).click()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('button', { name: '返回全图', exact: true })).toHaveCount(0)
  await resizeWindow(page, { width: 800, height: 600 })
  await page.getByRole('button', { name: '关闭属性面板', exact: true }).click()
  await expect(page.getByRole('button', { name: '二维视图' })).toBeInViewport()
  await expect(page.getByRole('button', { name: '适应全图' })).toBeInViewport()
})

test('图形能力不可用时说明原因并能返回二维继续编辑', async ({ page }) => {
  await page.addInitScript(() => {
    // eslint-disable-next-line @typescript-eslint/unbound-method -- The replacement preserves the original canvas receiver with apply.
    const original = HTMLCanvasElement.prototype.getContext
    HTMLCanvasElement.prototype.getContext = new Proxy(original, {
      apply: (target, receiver: HTMLCanvasElement, args: Parameters<typeof original>) => {
        if (args[0].startsWith('webgl')) return null
        return target.apply(receiver, args)
      },
    })
  })
  await reloadWindow(page)
  await enterExampleIfHome(page)
  await page.getByRole('button', { name: '三维视图', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('WebGL 2')
  await page.getByRole('button', { name: '返回二维视图' }).click()
  await expect(page.getByTestId('topic-root')).toContainText('产品规划')
  await expect(page.locator('.save-status')).toContainText('本地草稿')
})

test('三维卡片原位中文编辑，触控板平移、捏合和修饰键旋转不修改文档', async ({ page }) => {
  await page.getByRole('button', { name: '三维视图', exact: true }).click()
  const root = page.getByRole('button', { name: '选择主题 产品规划', exact: true })
  await expect(root).toBeVisible()
  const bounds = await root.boundingBox()
  const canvas = page.locator('canvas').first()
  if (!bounds) throw new Error('缺少三维主题')
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2)
  await page.mouse.wheel(100, 60)
  await expect.poll(async () => (await root.boundingBox())?.x).not.toBe(bounds.x)
  const zoom = page.getByRole('status', { name: '3D 缩放比例' })
  const previousZoom = await zoom.textContent()
  await canvas.dispatchEvent('wheel', {
    ctrlKey: true,
    deltaY: -120,
    bubbles: true,
    cancelable: true,
  })
  await expect(zoom).not.toHaveText(previousZoom ?? '')
  const beforeRotate = await root.boundingBox()
  await canvas.dispatchEvent('wheel', {
    altKey: true,
    deltaX: 60,
    deltaY: 15,
    bubbles: true,
    cancelable: true,
  })
  await expect.poll(async () => (await root.boundingBox())?.x).not.toBe(beforeRotate?.x)
  await page.getByRole('button', { name: '重置视角', exact: true }).click()
  await expect(page.locator('.save-status')).toContainText('本地草稿')
  await root.dblclick()
  const editor = page.getByRole('textbox', { name: '编辑主题标题', exact: true })
  await expect(editor).toBeFocused()
  await editor.fill('空间中文输入')
  await editor.dispatchEvent('compositionstart')
  await editor.press('Enter')
  await editor.dispatchEvent('compositionend', { data: '输入' })
  await editor.press('Shift+Enter')
  await editor.press('End')
  await editor.press('x')
  await page.getByRole('button', { name: '二维视图', exact: true }).click()
  await expect(page.getByTestId('topic-root')).toContainText('空间中文输入')
  await expect(page.locator('.status-bar')).toContainText('13 个主题')
  await dockAction(page, '撤销')
  await expect(page.getByTestId('topic-root')).toContainText('产品规划')
  await page.getByRole('button', { name: '三维视图', exact: true }).click()
  await root.dblclick()
  await editor.fill('不应保存的内容')
  await editor.press('Escape')
  await expect(root).toBeVisible()
  await expect(page.locator('.save-status')).toContainText('本地草稿')
})
