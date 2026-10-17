import { reloadWindow } from '@tests/electron/session'
import { expect, test } from '@tests/electron/fixture'
import { openExample } from '@tests/e2e/workspace'
import { dockAction } from '@tests/e2e/dock'

for (const mode of ['2d', '3d'] as const) {
  test(`${mode} 选择与文字编辑分开，Space 续写、文本选择删除和 Enter 确认`, async ({ page }) => {
    await openExample(page)
    if (mode === '3d') await page.getByRole('button', { name: '三维视图', exact: true }).click()
    const topic =
      mode === '2d'
        ? page.getByTestId('topic-vision')
        : page.getByRole('button', { name: '选择主题 产品愿景', exact: true })
    await topic.click()
    await expect(page.getByRole('textbox', { name: '编辑主题标题', exact: true })).toHaveCount(0)
    await page.keyboard.type('AB', { delay: 40 })
    await expect(page.getByRole('textbox', { name: '编辑主题标题', exact: true })).toHaveText('AB')
    await page.keyboard.press('Escape')
    await expect(topic).toContainText('产品愿景')
    await topic.click()
    const ime = await page.context().newCDPSession(page)
    try {
      if (mode === '3d')
        await ime.send('Input.dispatchKeyEvent', {
          type: 'keyDown',
          key: 'Process',
          windowsVirtualKeyCode: 229,
          nativeVirtualKeyCode: 229,
        })
      await ime.send('Input.imeSetComposition', {
        text: 'zhongwen',
        selectionStart: 8,
        selectionEnd: 8,
      })
      const composing = page.getByRole('textbox', { name: '编辑主题标题', exact: true })
      await expect(composing).toContainText('zhongwen')
      await ime.send('Input.insertText', { text: '中文' })
      await expect(composing).toHaveText('中文')
      await page.keyboard.press('Escape')
    } finally {
      await ime.detach()
    }
    await page.keyboard.press('Space')
    const editor = page.getByRole('textbox', { name: '编辑主题标题', exact: true })
    await expect(editor).toBeFocused()
    await editor.click()
    await expect(editor).toBeFocused()
    await page.keyboard.press('End')
    expect(await page.evaluate(() => getSelection()?.toString())).toBe('')
    await page.keyboard.type('1234')
    await expect(editor).toHaveText('产品愿景1234')
    await page.keyboard.press('Shift+ArrowLeft')
    await page.keyboard.press('Shift+ArrowLeft')
    expect(await page.evaluate(() => getSelection()?.toString())).toBe('34')
    await page.keyboard.press('Backspace')
    await expect(editor).toHaveText('产品愿景12')
    await page.keyboard.type('34')
    await page.keyboard.press('Shift+ArrowLeft')
    await page.keyboard.press('Shift+ArrowLeft')
    expect(await page.evaluate(() => getSelection()?.toString())).toBe('34')
    await page.keyboard.press('Delete')
    await expect(editor).toHaveText('产品愿景12')
    await page.keyboard.press('Enter')
    await expect(page.getByRole('textbox', { name: '编辑主题标题', exact: true })).toHaveCount(0)
    await expect(page.locator('.topic-count')).toContainText('13 个主题')
    const updated =
      mode === '2d' ? topic : page.getByRole('button', { name: '选择主题 产品愿景12', exact: true })
    await updated.dblclick()
    await page.keyboard.type('x')
    await expect(editor).toHaveText('产品愿景12x')
    await page.keyboard.press('Escape')
    await expect(updated).toContainText('产品愿景12')
    await dockAction(page, '撤销')
    await expect(
      mode === '2d' ? topic : page.getByRole('button', { name: '选择主题 产品愿景', exact: true }),
    ).toContainText('产品愿景')
  })
}

test('父主题、仅删除当前主题、折叠和画布缩放走文档命令与视图快捷键', async ({ page }) => {
  await openExample(page)
  await page.getByTestId('topic-vision').click()
  await page.keyboard.press('ControlOrMeta+Enter')
  const editor = page.getByRole('textbox', { name: '编辑主题标题', exact: true })
  await expect(editor).toBeFocused()
  const id = await editor.getAttribute('data-topic-id')
  await page.keyboard.type('父主题')
  await page.keyboard.press('Enter')
  await expect(page.locator('.topic-count')).toContainText('14 个主题')
  await page.keyboard.press('ControlOrMeta+/')
  await expect(page.getByTestId('topic-vision')).toHaveCount(0)
  await page.keyboard.press('ControlOrMeta+/')
  await expect(page.getByTestId('topic-vision')).toBeVisible()
  await page.keyboard.press('ControlOrMeta+Backspace')
  await expect(page.getByTestId(`topic-${id}`)).toHaveCount(0)
  await expect(page.getByTestId('topic-vision')).toBeVisible()
  await expect(page.locator('.topic-count')).toContainText('13 个主题')
  await page.keyboard.press('ControlOrMeta+z')
  await expect(page.getByTestId(`topic-${id}`)).toBeVisible()
  await page.getByTestId('topic-root').click()
  await page.keyboard.press('ControlOrMeta+0')
  await expect(page.locator('.zoom-value')).toHaveText('100%')
  await page.keyboard.press('ControlOrMeta+=')
  await expect(page.locator('.zoom-value')).not.toHaveText('100%')
  await page.keyboard.press('ControlOrMeta+r')
  await expect(page.getByTestId('topic-root')).toHaveClass(/is-selected/)
})

test('React Flow 缩略图可关闭重新打开，开关跨刷新保留且不会修改文档', async ({ page }) => {
  await openExample(page)
  await expect(page.getByRole('img', { name: '画布缩略图' })).toBeVisible()
  await page.getByRole('button', { name: '关闭缩略图', exact: true }).click()
  await expect(page.locator('.react-flow__minimap')).toHaveCount(0)
  await expect(page.locator('.save-status')).toContainText('本地草稿')
  await reloadWindow(page)
  const restore = page.getByRole('button', { name: '恢复上次打开的 1 份导图', exact: true })
  await expect
    .poll(
      async () =>
        (await restore.isVisible()) ||
        (await page.getByRole('button', { name: '探索示例', exact: true }).isVisible()),
    )
    .toBe(true)
  if (await restore.isVisible()) await restore.click()
  else await page.getByRole('button', { name: '探索示例', exact: true }).click()
  await expect(page.getByRole('button', { name: '显示缩略图', exact: true })).toBeVisible()
  await page.getByRole('button', { name: '显示缩略图', exact: true }).click()
  await expect(page.locator('.react-flow__minimap')).toBeVisible()
})

test('检查器普通点击保留原生光标，输入追加文字而不替换整个标题', async ({ page }) => {
  await openExample(page)
  await page.getByTestId('topic-vision').click()
  await page.getByRole('button', { name: '属性面板', exact: true }).click()
  const input = page.getByRole('textbox', { name: '主题名称', exact: true })
  const box = await input.boundingBox()
  if (!box) throw new Error('主题名称输入框不可见')
  await input.click({ position: { x: box.width - 12, y: box.height / 2 } })
  await expect(input).toBeFocused()
  expect(await page.evaluate(() => getSelection()?.toString())).toBe('')
  await page.keyboard.type('X')
  await expect(input).toHaveText('产品愿景X')
  await page.keyboard.press('Enter')
  await expect(page.getByTestId('topic-vision')).toContainText('产品愿景X')
})
