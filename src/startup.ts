import { notifyNativeStartup } from '@renderer/lib/desktop'
import { initializeAppearance } from '@renderer/appearanceBootstrap'
import { showStartupIssue } from '@renderer/startupStatus'
import { languageFromLocale } from '@shared/language'
import { splashText } from '@renderer/splashI18n'

initializeAppearance()
const language = languageFromLocale(navigator.language)
document.documentElement.lang = language
document
  .getElementById('startup-screen')
  ?.setAttribute('aria-label', splashText('screen', language))
const message = document.getElementById('startup-message')
if (message) message.textContent = splashText('loading', language)
const retry = document.getElementById('startup-retry')
if (retry) retry.textContent = splashText('retry', language)

// This entry stays independent of React, React Scan and the editor bundle.
const slowStart = window.setTimeout(() => {
  showStartupIssue(
    document,
    splashText('slow', languageFromLocale(document.documentElement.lang)),
    false,
  )
}, 15_000)

void import('@renderer/main')
  .catch((error: unknown) => {
    console.error('Brainstorming 界面初始化失败。', error)
    showStartupIssue(
      document,
      splashText('failed', languageFromLocale(document.documentElement.lang)),
      true,
    )
    void notifyNativeStartup('failed')
  })
  .finally(() => {
    window.clearTimeout(slowStart)
  })
