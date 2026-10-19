import { expect, test, type Page } from '@playwright/test'

// Lexical on macOS Chrome rejects insertText in the same task as Select All,
// protecting against system text replacements. CDP insertText has no keydown.
const selectAll = async (page: Page) => {
  await page.keyboard.press('ControlOrMeta+a')
  await page.evaluate(() => new Promise<void>((resolve) => setTimeout(resolve, 0)))
}

const inputStory = '/iframe.html?id=brainstorming-多行文本输入--editing&viewMode=story'

test('literal multiline input preserves selection, undo, external reset and limit', async ({
  page,
}) => {
  await page.goto(inputStory)
  const input = page.getByRole('textbox', { name: '多行正文' })
  await expect(input).toHaveText('原始文字', { timeout: 15000 })
  await input.click()
  await page.keyboard.press('End')
  await page.keyboard.press('ArrowLeft')
  await page.keyboard.press('Shift+ArrowLeft')
  await page.keyboard.insertText('新')
  await expect(page.getByLabel('草稿')).toHaveText('原始新字')
  await page.keyboard.press('ControlOrMeta+z')
  await expect(page.getByLabel('草稿')).toHaveText('原始文字')
  await selectAll(page)
  await page.keyboard.insertText('# 标题')
  await expect(page.getByLabel('草稿')).toHaveText('# 标题')
  await page.keyboard.press('Enter')
  await page.keyboard.insertText('**原样保留**')
  await expect(page.getByLabel('草稿')).toHaveText('# 标题\n**原样保留**')
  await expect(input.locator('strong,h1,h2')).toHaveCount(0)
  await page.getByRole('button', { name: '重置', exact: true }).click()
  await expect(input).toHaveText('外部重置')
  await input.click()
  await page.keyboard.press('ControlOrMeta+z')
  await expect(input).toHaveText('外部重置')
  await page.keyboard.insertText('长文本'.repeat(20))
  await expect(input).toHaveText('外部重置')
})

test('composition-safe reset uses the latest controlled value', async ({ page, context }) => {
  await page.goto(inputStory)
  const input = page.getByRole('textbox', { name: '多行正文' })
  await input.click()
  await page.keyboard.press('End')
  const session = await context.newCDPSession(page)
  await session.send('Input.imeSetComposition', {
    text: '候选',
    selectionStart: 2,
    selectionEnd: 2,
  })
  const draft = await page.getByLabel('草稿').textContent()
  await page.getByRole('button', { name: '重置', exact: true }).click()
  await page.getByRole('button', { name: '恢复外部值' }).click()
  await session.send('Input.insertText', { text: '候选' })
  await expect(input).toHaveText(draft ?? '')
  await expect(page.getByLabel('草稿')).toHaveText(draft ?? '')
  await session.detach()
})

test('IME keys cannot commit or cancel, Enter inserts a line and modifier Enter commits', async ({
  page,
}) => {
  await page.goto(inputStory)
  const input = page.getByRole('textbox', { name: '多行正文' })
  await input.click()
  await selectAll(page)
  await page.keyboard.insertText('中文输入')
  await expect(page.getByLabel('草稿')).toHaveText('中文输入')
  // Keyboard guard fixture; real candidate editing is covered with the CDP composition test.
  await input.evaluate((element) => {
    element.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'Enter',
        ctrlKey: true,
        isComposing: true,
        bubbles: true,
      }),
    )
    element.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'Escape',
        isComposing: true,
        bubbles: true,
      }),
    )
  })
  await expect(page.getByLabel('提交')).toBeEmpty()
  await expect(page.getByLabel('取消')).toHaveText('false')
  await page.keyboard.press('Enter')
  await page.keyboard.insertText('继续')
  await expect(page.getByLabel('草稿')).toHaveText('中文输入\n继续')
  await page.keyboard.press('Control+Enter')
  await expect(page.getByLabel('提交')).toHaveText('中文输入\n继续')
  await page.keyboard.insertText('。')
  await page.keyboard.press('Tab')
  await expect(page.getByLabel('提交')).toHaveText('中文输入\n继续。')
  await input.click()
  await page.keyboard.press('Escape')
  await expect(page.getByLabel('取消')).toHaveText('true')
})

test('annotation autofocus selects existing text and keeps newline and cancel semantics', async ({
  page,
}) => {
  await page.goto('/iframe.html?id=brainstorming-多行文本输入--annotation&viewMode=story')
  const input = page.getByRole('textbox', { name: '编辑标注文字' })
  await expect(input).toBeFocused()
  await page.keyboard.insertText('新标注')
  await page.keyboard.press('Enter')
  await page.keyboard.insertText('第二行')
  await expect(page.getByLabel('提交')).toBeEmpty()
  await page.keyboard.press('Control+Enter')
  await expect(page.getByLabel('提交')).toHaveText('新标注\n第二行')
  await page.keyboard.press('Escape')
  await expect(page.getByLabel('取消')).toHaveText('true')
})
