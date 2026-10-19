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
  screen.setAttribute('data-state', failed ? 'failed' : 'slow')
  if (failed) document.getElementById('startup-indicator')?.setAttribute('hidden', '')
  if (retry) {
    retry.hidden = false
    retry.onclick = () => document.defaultView?.location.reload()
  }
}
