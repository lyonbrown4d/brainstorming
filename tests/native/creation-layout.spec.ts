import { browser, expect } from '@wdio/globals'
import { chooseAppearance } from '@tests/native/appearance'
import { nativeArtifact } from '@tests/native/artifacts'
import { home, named } from '@tests/native/driver'
import { creationReady } from '@tests/native/readiness'

const expectUsableLayout = async (): Promise<void> => {
  await browser.waitUntil(async () =>
    browser.execute(() => {
      const preview = document.querySelector('[data-creation-preview]')
      const gallery = document.querySelector('section[aria-label="新建文档"]')
      const create = document.querySelector('button[type="submit"]')
      if (!preview || !gallery || !create) return false
      // Capture the finished native transition rather than its faded first frame.
      let ancestor: Element | null = preview
      while (ancestor && ancestor !== gallery) {
        if (Number.parseFloat(getComputedStyle(ancestor).opacity) < 0.99) return false
        ancestor = ancestor.parentElement
      }
      const bounds = preview.getBoundingClientRect()
      const action = create.getBoundingClientRect()
      const scrollAreas = [...gallery.querySelectorAll('*')].filter((element) => {
        const overflow = getComputedStyle(element).overflowY
        return ['auto', 'scroll'].includes(overflow) && element.scrollHeight > element.clientHeight
      })
      return (
        bounds.height > 0 &&
        bounds.height < window.innerHeight * 0.45 &&
        action.top >= 0 &&
        action.bottom <= window.innerHeight &&
        document.documentElement.scrollWidth <= window.innerWidth &&
        scrollAreas.length === 1
      )
    }),
  )
}

describe('native creation layout', () => {
  it('keeps the preview compact and the create action visible with one page scroll', async () => {
    await home()
    await chooseAppearance('浅色')
    await named('下一步').click()
    await creationReady('configuration')
    await browser.setWindowSize(1280, 800)
    await expectUsableLayout()
    await browser.saveScreenshot(await nativeArtifact('brainstorming-native-creation-wide.png'))
    await browser.setWindowSize(900, 600)
    await expectUsableLayout()
    await named('选择个人目标规划模板').scrollIntoView()
    await named('选择个人目标规划模板').click()
    await expect(named('创建文档')).toBeDisplayed()
    await chooseAppearance('深色')
    await browser.$('h1').scrollIntoView()
    await expectUsableLayout()
    await browser.saveScreenshot(
      await nativeArtifact('brainstorming-native-creation-compact-dark.png'),
    )
    await named('上一步').click()
    await creationReady('structure')
    await named('不使用预设').click()
    await named('下一步').click()
    await creationReady('configuration')
    await expect(named('搜索内容模板')).not.toExist()
    await expect(named('创建文档')).toBeDisplayed()
    await chooseAppearance('跟随系统')
    await browser.setWindowSize(1280, 800)
  })
})
