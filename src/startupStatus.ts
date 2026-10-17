import { notifyNativeStartup } from '@renderer/lib/desktop'
export const showStartupIssue = (document: Document, message: string, failed: boolean): void => {
  const screen = document.getElementById('startup-screen')
  if (!screen) return
  const status = document.getElementById('startup-message')
  const retry = document.getElementById('startup-retry')
  if (status) {
    status.textContent = message
    status.setAttribute('role', failed ? 'alert' : 'status')
  }
  screen.setAttribute('aria-busy', String(!failed))
  if (failed) document.getElementById('startup-indicator')?.setAttribute('hidden', '')
  if (retry) {
    retry.hidden = false
    retry.onclick = () => document.defaultView?.location.reload()
  }
}

export const dismissStartupScreen = (document: Document): void => {
  const screen = document.getElementById('startup-screen')
  if (!screen) return
  void notifyNativeStartup('ready')
    .then(() => {
      screen.remove()
    })
    .catch((error: unknown) => {
      console.error('原生应用未能完成启动。', error)
      showStartupIssue(document, '原生应用启动失败，请重新加载。', true)
    })
}
