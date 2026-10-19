import { notifyNativeStartup } from '@renderer/lib/desktop'
import { languageFromLocale } from '@shared/language'
import { splashText } from '@renderer/splashI18n'
import { showStartupIssue } from '@renderer/startupStatus'

/** Loaded by the main renderer only; the independent splash needs no editor bridge. */
export const dismissStartupScreen = (document: Document): void => {
  const screen = document.getElementById('startup-screen')
  if (!screen) return
  void notifyNativeStartup('ready')
    .then(() => {
      screen.remove()
    })
    .catch((error: unknown) => {
      console.error('原生应用未能完成启动。', error)
      showStartupIssue(
        document,
        splashText('handoffFailed', languageFromLocale(document.documentElement.lang)),
        true,
      )
    })
}
