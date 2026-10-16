export function showStartupIssue(document: Document, message: string, failed: boolean): void {
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

export function dismissStartupScreen(document: Document): void {
  const screen = document.getElementById('startup-screen')
  if (document.defaultView?.trelyxStartup) {
    screen?.remove()
    document.defaultView.trelyxStartup.ready()
    return
  }
  if (!screen) return
  screen.setAttribute('aria-busy', 'false')
  if (document.defaultView?.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    screen.remove()
    return
  }
  const fade = screen.animate([{ opacity: 1 }, { opacity: 0 }], {
    duration: 180,
    easing: 'ease-out',
    fill: 'forwards',
  })
  void fade.finished.then(
    () => {
      screen.remove()
    },
    () => {
      screen.remove()
    },
  )
}
