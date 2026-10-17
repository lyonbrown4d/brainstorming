import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { initializeAppearance } from '@renderer/appearanceBootstrap'
import { showStartupIssue } from '@renderer/startupStatus'
import type { StartupPhase } from '@shared/startup'
import { languageFromLocale, type AppLanguage } from '@shared/language'
import { splashText } from '@renderer/splashI18n'

initializeAppearance()

const request = (method: string): Promise<unknown> => invoke('native_request', { method, args: {} })
const bridge = {
  retry: () => {
    void request('splashRetry').catch(console.error)
  },
  quit: () => {
    void request('splashQuit').catch(console.error)
  },
}
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
    if (retry)
      retry.onclick = () => {
        bridge.retry()
      }
  }
}
void listen<StartupPhase>('native:startup-phase', ({ payload }) => {
  phase = payload
  render()
})
  .then(() => request('splashMounted'))
  .then((value) => {
    const state = value as { language: AppLanguage; phase: StartupPhase }
    language = state.language
    phase = state.phase
    render()
  })
  .catch((error: unknown) => {
    console.error(error)
    phase = 'failed'
    render()
  })
void listen<AppLanguage>('native:language', ({ payload }) => {
  language = payload
  render()
})
if (quit instanceof HTMLButtonElement) {
  quit.addEventListener('click', () => {
    bridge.quit()
  })
  quit.disabled = !bridge
}
render()

window.setTimeout(() => {
  if (phase === 'loading') {
    phase = 'slow'
    render()
  }
}, 15_000)
