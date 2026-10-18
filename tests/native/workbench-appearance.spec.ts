import { nativeArtifact } from '@tests/native/artifacts'
import { browser, expect } from '@wdio/globals'
import { Key } from 'webdriverio'
import { createWorkbook, serializeWorkbook } from '@core'
import { createWorkbenchDocument } from '@stories/workbenchFixture'
import {
  fixture,
  native,
  chooseFile,
  named,
  root,
  ensureProperties,
  home,
} from '@tests/native/driver'
import { checkMacChrome } from '@tests/native/chrome'

const theme = async (name: string) => {
  await named('应用外观').click()
  await browser.keys(Key.ArrowDown)
  await named(name).click()
}

describe('warm white and graphite native UI', () => {
  it('switches 2D/3D appearances and preserves native chrome', async () => {
    await home()
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
    await browser.waitUntil(async () =>
      browser.execute(() => {
        const center = document.querySelector('[data-testid="topic-root"]')
        const mode = document.querySelector('[aria-label="二维视图"]')
        return Boolean(
          center &&
          mode &&
          getComputedStyle(center).backgroundColor === 'rgb(65, 70, 79)' &&
          getComputedStyle(mode).backgroundColor === 'rgb(236, 235, 230)',
        )
      }),
    )
    await named('展开浮动工具栏').click()
    await browser.saveScreenshot(await nativeArtifact('native-light.png'))
    await theme('深色')
    await expect(browser.$('html')).toHaveAttribute('data-theme', 'dark')
    await browser.waitUntil(async () =>
      browser.execute(
        () =>
          getComputedStyle(document.querySelector('.canvas') ?? document.body).backgroundColor ===
          'rgb(28, 30, 34)',
      ),
    )
    await browser.saveScreenshot(await nativeArtifact('native-dark.png'))
    await named('三维视图').click()
    await expect(named('选择主题 视觉设计')).toBeDisplayed()
    await browser.saveScreenshot(await nativeArtifact('native-3d-dark.png'))
    await theme('浅色')
    await expect(browser.$('html')).toHaveAttribute('data-theme', 'light')
    await browser.saveScreenshot(await nativeArtifact('native-3d-light.png'))
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
