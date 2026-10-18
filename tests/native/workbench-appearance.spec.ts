import { browser, expect } from '@wdio/globals'
import { Key } from 'webdriverio'
import { mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createWorkbook, serializeWorkbook } from '@core'
import { createWorkbenchDocument } from '@stories/workbenchFixture'
import { fixture, native, chooseFile, named, root, ensureProperties } from '@tests/native/driver'
import { checkMacChrome } from '@tests/native/chrome'

const screenshots = join(tmpdir(), 'brainstorming-theme-qa')

const theme = async (name: string) => {
  await named('应用外观').click()
  await browser.keys(Key.ArrowDown)
  await named(name).click()
}

describe('warm white and graphite native UI', () => {
  it('switches 2D/3D appearances and preserves native chrome', async () => {
    await browser.tauri.switchWindow('main')
    await native('setLanguage', { language: 'zh-CN' })
    await named('探索示例').waitForDisplayed()
    await mkdir(screenshots, { recursive: true })
    await checkMacChrome()
    const workbook = createWorkbook(createWorkbenchDocument())
    const name = `theme-qa-${Date.now()}.brainstorming`
    await chooseFile('save', name)
    await native('saveDocument', {
      request: { path: null, contents: serializeWorkbook(workbook), suggestedName: name },
    })
    await chooseFile('open', name)
    await named('打开本地文件').click()
    await expect(root()).toBeDisplayed()
    await browser.$('[data-testid="topic-design"]').click()
    await ensureProperties()
    await theme('浅色')
    await expect(browser.$('html')).toHaveAttribute('data-theme', 'light')
    await named('展开浮动工具栏').click()
    await browser.saveScreenshot(join(screenshots, 'native-light.png'))
    await theme('深色')
    await expect(browser.$('html')).toHaveAttribute('data-theme', 'dark')
    await browser.waitUntil(async () =>
      browser.execute(
        () =>
          getComputedStyle(document.querySelector('.canvas') ?? document.body).backgroundColor ===
          'rgb(28, 30, 34)',
      ),
    )
    await browser.saveScreenshot(join(screenshots, 'native-dark.png'))
    await named('三维视图').click()
    await expect(named('选择主题 视觉设计')).toBeDisplayed()
    await browser.saveScreenshot(join(screenshots, 'native-3d-dark.png'))
    await theme('浅色')
    await expect(browser.$('html')).toHaveAttribute('data-theme', 'light')
    await browser.saveScreenshot(join(screenshots, 'native-3d-light.png'))
    await theme('跟随系统')
    const expected = await browser.execute(() =>
      matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light',
    )
    await expect(browser.$('html')).toHaveAttribute('data-theme', expected)
    expect(await browser.execute(() => localStorage.getItem('brainstorming-appearance'))).toBe(
      'system',
    )
    expect((await fixture<{ sqlite: boolean }>('inspect', { name })).sqlite).toBe(true)
  })
})
