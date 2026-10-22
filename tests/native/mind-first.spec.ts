import { browser, expect } from '@wdio/globals'
import { Key } from 'webdriverio'
import { nativeArtifact } from '@tests/native/artifacts'
import {
  artifact,
  fillContentEditable,
  create,
  editor,
  ensureProperties,
  home,
  named,
  root,
  rootHasText,
  save,
  closeSaved,
  openSaved,
} from '@tests/native/driver'

// The embedded driver's aria selector does not resolve names through aria-labelledby.
const chooseOption = async (label: string): Promise<void> => {
  await expect(browser.$('[role="listbox"]')).toBeDisplayed()
  for await (const option of browser.$$('[role="option"]')) {
    if ((await option.getText()).trim() === label) {
      await option.click()
      return
    }
  }
  throw new Error(`Missing visible select option: ${label}`)
}

describe('mind-first native workflow', () => {
  it('preserves node appearance and slide notes through native SQLite save and reopen', async () => {
    await home()
    await create('旅行头脑风暴')
    await root().click()
    await browser.keys(Key.Tab)
    await expect(editor()).toBeDisplayed()
    await expect(editor()).toBeFocused()
    await fillContentEditable(editor(), '海边散步')
    await expect(editor()).toHaveText('海边散步')
    await browser.keys(Key.Enter)
    await root().click()
    await ensureProperties()
    await browser.$('button[aria-label="表现形态"]').click()
    await named('便签').click()
    await expect(root()).toHaveAttribute('data-appearance', 'sticky')

    await browser.$('button[aria-label="演示编排"]').click()
    await expect(browser.$('[data-presentation-composer]')).toBeDisplayed()
    await named('标题').click()
    await named('字号比例').click()
    await chooseOption('125%')
    await named('对齐').click()
    await chooseOption('居中')
    await expect(browser.$('[data-presentation-composer] main h2')).toHaveAttribute(
      'style',
      expect.stringContaining('text-align: center'),
    )
    await browser.saveScreenshot(await nativeArtifact('presentation-composer.png'))
    await fillContentEditable(browser.$('#presentation-notes'), '按时间说明这次出行安排')
    await named('从头播放').click()
    await expect(browser.$('[aria-label="观众画面"]')).toBeDisplayed()
    await expect(browser.$('[aria-label="观众画面"] h2')).toHaveAttribute(
      'style',
      expect.stringContaining('text-align: center'),
    )
    await browser.waitUntil(() =>
      browser.execute(() => {
        const stage = window.document.querySelector(
          '[aria-label="观众画面"] [data-presentation-slide]',
        )?.parentElement
        const title = stage?.querySelector('header')
        const clip = title ? getComputedStyle(title).clipPath.match(/[\d.]+/g) : null
        return Boolean(
          stage &&
          title &&
          getComputedStyle(stage).opacity === '1' &&
          getComputedStyle(title).opacity === '1' &&
          (!clip || clip.every((value) => Number(value) === 0)),
        )
      }),
    )
    await browser.saveScreenshot(await nativeArtifact('presentation-audience.png'))
    await named('跳转到页面').click()
    const search = () => browser.$('input[aria-label="跳转到页面"]')
    await expect(search()).toBeFocused()
    await search().setValue('海边')
    await browser.keys(Key.Escape)
    await expect(search()).not.toExist()
    await expect(browser.$('[aria-label="观众画面"]')).toBeDisplayed()
    await named('跳转到页面').click()
    await search().setValue('海边')
    for await (const option of browser.$$('[cmdk-item]')) {
      if ((await option.getText()).includes('海边散步')) {
        await option.click()
        break
      }
    }
    await expect(browser.$('[aria-label="观众画面"] h2')).toHaveText('海边散步')
    await browser.keys(Key.Space)
    await browser.keys(Key.Escape)
    await expect(browser.$('[data-presentation-composer]')).toBeDisplayed()
    await named('返回画布').click()
    await rootHasText('旅行头脑风暴')
    await browser.saveScreenshot(await nativeArtifact('mind-first-editor.png'))

    const name = artifact('mind-first')
    const workbook = await save(name)
    const document = workbook.sheets[0]?.document
    expect(document?.topics[document.rootId]?.style?.shape).toBe('sticky')
    expect(document?.presentation?.[0]?.appearance?.title).toEqual({ scale: 1.25, align: 'center' })
    expect(document?.presentation?.[0]?.notes).toBe('按时间说明这次出行安排')
    expect(Object.values(document?.topics ?? {}).map((topic) => topic.title)).toContain('海边散步')
    await closeSaved()
    await openSaved(name)
    await expect(root()).toHaveAttribute('data-appearance', 'sticky')
    await browser.$('button[aria-label="演示编排"]').click()
    await expect(browser.$('[data-presentation-composer] main h2')).toHaveAttribute(
      'style',
      expect.stringContaining('text-align: center'),
    )
    await named('返回画布').click()
  })

  it('opens route-based settings and returns to the same canvas without discarding content', async () => {
    await home()
    await create('设置导航')
    const before = await browser.getUrl()
    await named('应用设置').click()
    await expect(browser.$('[role="dialog"]')).toBeDisplayed()
    expect(await browser.getUrl()).toContain('#/settings')
    await named('画布').click()
    await expect(named('画布缩略图')).toBeDisplayed()
    await browser.saveScreenshot(await nativeArtifact('mind-first-settings.png'))
    await named('快捷键').click()
    const record = browser.$('button[aria-label^="录制快捷键:"]')
    await record.click()
    await expect(record).toHaveAttribute('aria-pressed', 'true')
    await browser.keys(Key.Escape)
    await expect(browser.$('[role="dialog"]')).toBeDisplayed()
    await expect(record).toHaveAttribute('aria-pressed', 'false')
    await browser.keys(Key.Escape)
    await expect(browser.$('[role="dialog"]')).not.toExist()
    expect(await browser.getUrl()).toBe(before)
    await rootHasText('设置导航')
  })
})
