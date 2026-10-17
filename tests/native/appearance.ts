import { browser, expect } from '@wdio/globals'
import { Key } from 'webdriverio'
import { named, reloadNativePage } from '@tests/native/driver'

const chooseAppearance = async (label: string): Promise<void> => {
  await browser.$('button[aria-label="应用外观"]').click()
  // The embedded driver sends click without pointerdown; Radix opens via keyboard.
  await browser.keys(Key.ArrowDown)
  await expect(named(label)).toBeDisplayed()
  await named(label).click()
  await expect(browser.$('[role="menu"]')).not.toBeDisplayed()
}

const loadedLogo = async (): Promise<string> => {
  let source = ''
  await browser.waitUntil(
    async () => {
      source = await browser.execute(() => {
        const visible = [
          ...document.querySelectorAll<HTMLImageElement>('header.toolbar img'),
        ].filter((image) => {
          const bounds = image.getBoundingClientRect()
          return bounds.width > 0 && bounds.height > 0
        })
        const image = visible[0]
        return visible.length === 1 &&
          image?.complete &&
          image.naturalWidth > 0 &&
          image.naturalHeight > 0
          ? image.currentSrc
          : ''
      })
      return source.length > 0
    },
    { timeoutMsg: 'Exactly one visible brand logo must finish loading in the native titlebar' },
  )
  return source
}

export const checkBrandAppearance = async (): Promise<void> => {
  await chooseAppearance('浅色')
  await expect(browser.$('html')).toHaveAttribute('data-theme', 'light')
  const lightLogo = await loadedLogo()
  await browser.saveScreenshot('/private/tmp/brainstorming-native-brand-light.png')
  await chooseAppearance('深色')
  await expect(browser.$('html')).toHaveAttribute('data-theme', 'dark')
  const darkLogo = await loadedLogo()
  expect(darkLogo).not.toBe(lightLogo)
  await browser.saveScreenshot('/private/tmp/brainstorming-native-brand-dark.png')

  await reloadNativePage()
  await expect(browser.$('button[aria-label="应用外观"]')).toBeEnabled()
  await expect(browser.$('html')).toHaveAttribute('data-theme', 'dark')
  expect(await loadedLogo()).toBe(darkLogo)

  await chooseAppearance('跟随系统')
  const systemTheme = await browser.execute(() =>
    window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light',
  )
  await expect(browser.$('html')).toHaveAttribute('data-theme', systemTheme)
  expect(await loadedLogo()).toBe(systemTheme === 'dark' ? darkLogo : lightLogo)
  await browser.$('button[aria-label="应用外观"]').click()
  await browser.keys(Key.ArrowDown)
  await expect(named('跟随系统')).toHaveAttribute('aria-checked', 'true')
  await browser.keys(Key.Escape)
}
