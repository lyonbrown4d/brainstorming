import { nativeArtifact } from '@tests/native/artifacts'
import { browser, expect } from '@wdio/globals'
import { Key } from 'webdriverio'
import { focusNativeWindow, named, reloadNativePage } from '@tests/native/driver'

const openAppearanceOptions = async (): Promise<void> => {
  await focusNativeWindow()
  await expect(named('应用设置')).toBeEnabled()
  await named('应用设置').click()
  await expect(browser.$('[role="dialog"]')).toBeDisplayed()
  await focusNativeWindow()
  const trigger = browser.$('[role="combobox"][aria-label="应用外观"]')
  await expect(trigger).toBeEnabled()
  await trigger.click()
  // The embedded driver sends click without pointerdown; Radix opens via keyboard.
  await browser.keys(Key.ArrowDown)
  await expect(trigger).toHaveAttribute('aria-expanded', 'true')
  await expect(browser.$('[role="listbox"]')).toBeDisplayed()
}

export const chooseAppearance = async (label: string): Promise<void> => {
  await openAppearanceOptions()
  const choice = browser.$('[role="listbox"]').$(`aria/${label}`)
  await expect(choice).toBeDisplayed()
  await choice.click()
  await expect(browser.$('[role="listbox"]')).not.toBeDisplayed()
  await focusNativeWindow()
  await browser.keys(Key.Escape)
  await expect(browser.$('[role="dialog"]')).not.toBeDisplayed()
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
  await browser.saveScreenshot(await nativeArtifact('brainstorming-native-brand-light.png'))
  await chooseAppearance('深色')
  await expect(browser.$('html')).toHaveAttribute('data-theme', 'dark')
  const darkLogo = await loadedLogo()
  expect(darkLogo).not.toBe(lightLogo)
  await browser.saveScreenshot(await nativeArtifact('brainstorming-native-brand-dark.png'))

  await reloadNativePage()
  await expect(browser.$('button[aria-label="应用设置"]')).toBeEnabled()
  await expect(browser.$('html')).toHaveAttribute('data-theme', 'dark')
  expect(await loadedLogo()).toBe(darkLogo)

  await chooseAppearance('跟随系统')
  const systemTheme = await browser.execute(() =>
    window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light',
  )
  await expect(browser.$('html')).toHaveAttribute('data-theme', systemTheme)
  expect(await loadedLogo()).toBe(systemTheme === 'dark' ? darkLogo : lightLogo)
  await openAppearanceOptions()
  await browser.waitUntil(
    async () =>
      browser.execute(
        () =>
          document
            .querySelector('[role="listbox"] [role="option"][data-state="checked"]')
            ?.textContent.trim() === '跟随系统',
      ),
    { timeoutMsg: 'The persisted appearance selection must follow the system' },
  )
  await browser.keys(Key.Escape)
  await browser.keys(Key.Escape)
}
