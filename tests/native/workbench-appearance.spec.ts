import { chooseAppearance } from '@tests/native/appearance'
import { nativeArtifact } from '@tests/native/artifacts'
import { browser, expect } from '@wdio/globals'
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

describe('warm white and graphite native UI', () => {
  it('switches appearances and preserves native chrome', async () => {
    await home()
    await checkMacChrome()
    const workbook = createWorkbook(createWorkbenchDocument())
    const name = `theme-qa-${Date.now()}.brainstorming`
    const path = await chooseFile('save', name)
    await native('saveDocument', {
      request: { path: null, contents: serializeWorkbook(workbook), suggestedName: name },
    })
    await native('releaseDocument', { path })
    await chooseFile('open', name)
    await named('打开本地文件').click()
    await expect(root()).toBeDisplayed()
    await browser.$('[data-testid="topic-design"]').click()
    await ensureProperties()
    await chooseAppearance('浅色')
    await expect(browser.$('html')).toHaveAttribute('data-theme', 'light')
    await browser.waitUntil(async () =>
      browser.execute(() => {
        const center = document.querySelector('[data-testid="topic-root"] > svg path')
        return Boolean(center && getComputedStyle(center).fill === 'rgb(65, 70, 79)')
      }),
    )
    await named('展开浮动工具栏').click()
    await browser.waitUntil(() =>
      browser.execute(() => {
        const dock = document.getElementById('floating-map-actions')
        return (
          dock?.getAttribute('aria-hidden') === 'false' && getComputedStyle(dock).opacity === '1'
        )
      }),
    )
    await browser.saveScreenshot(await nativeArtifact('native-light.png'))
    await chooseAppearance('深色')
    await expect(browser.$('html')).toHaveAttribute('data-theme', 'dark')
    await browser.waitUntil(async () =>
      browser.execute(
        () =>
          getComputedStyle(document.querySelector('.canvas') ?? document.body).backgroundColor ===
          'rgb(28, 30, 34)',
      ),
    )
    await browser.saveScreenshot(await nativeArtifact('native-dark.png'))
    await chooseAppearance('跟随系统')
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
