import { initializeAppearance } from '@renderer/appearanceBootstrap'
import { showStartupIssue } from '@renderer/startupStatus'
import type { StartupPhase } from '@shared/startup'
import { languageFromLocale, type AppLanguage } from '@shared/language'
import { splashText } from '@renderer/splashI18n'

initializeAppearance()

const bridge = window.trelyxSplash
const retry = document.getElementById('startup-retry')
const quit = document.getElementById('startup-quit')
let language: AppLanguage = languageFromLocale(navigator.language)
let phase: StartupPhase = 'loading'
const render = (): void => {
  document.documentElement.lang = language
  document.title = splashText('title', language)
  document
    .getElementById('startup-screen')
    ?.setAttribute('aria-label', splashText('screen', language))
  quit?.setAttribute('aria-label', splashText('quit', language))
  if (retry) retry.textContent = splashText('retry', language)
  if (phase === 'loading') {
    document.getElementById('startup-screen')?.setAttribute('aria-busy', 'true')
    document.getElementById('startup-indicator')?.removeAttribute('hidden')
    const message = document.getElementById('startup-message')
    if (message) {
      message.textContent = splashText('loading', language)
      message.setAttribute('role', 'status')
    }
    if (retry) retry.hidden = true
  } else {
    showStartupIssue(document, splashText(phase, language), phase === 'failed')
    if (retry) retry.onclick = () => bridge?.retry()
  }
}
bridge?.onPhase((next) => {
  phase = next
  render()
})
bridge?.onLanguage((next) => {
  language = next
  render()
})
if (quit instanceof HTMLButtonElement) {
  quit.addEventListener('click', () => bridge?.quit())
  quit.disabled = !bridge
}
render()
// Subscribe first so the main process can safely resend a phase set before this page loaded.
bridge?.mounted()
