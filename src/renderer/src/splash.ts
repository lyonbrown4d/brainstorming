import { showStartupIssue } from './startupStatus'
import type { StartupPhase } from '../../shared/startup'

const bridge = window.trelyxSplash
const retry = document.getElementById('startup-retry')
function updatePhase(phase: StartupPhase): void {
  if (phase === 'loading') {
    document.getElementById('startup-screen')?.setAttribute('aria-busy', 'true')
    document.getElementById('startup-indicator')?.removeAttribute('hidden')
    const message = document.getElementById('startup-message')
    if (message) {
      message.textContent = '正在准备工作空间…'
      message.setAttribute('role', 'status')
    }
    if (retry) retry.hidden = true
  } else {
    showStartupIssue(
      document,
      phase === 'failed'
        ? '界面加载失败，请重试或退出应用。'
        : '启动时间较长，请稍候；也可以重试。',
      phase === 'failed',
    )
    if (retry) retry.onclick = () => bridge?.retry()
  }
}
bridge?.onPhase(updatePhase)
const quit = document.getElementById('startup-quit')
if (quit instanceof HTMLButtonElement) {
  quit.addEventListener('click', () => bridge?.quit())
  quit.disabled = !bridge
}
// Subscribe first so the main process can safely resend a phase set before this page loaded.
bridge?.mounted()
