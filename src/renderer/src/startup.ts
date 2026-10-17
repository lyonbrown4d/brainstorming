import { initializeAppearance } from '@renderer/appearanceBootstrap'
import { showStartupIssue } from '@renderer/startupStatus'

initializeAppearance()

// This entry stays independent of React, React Scan and the editor bundle.
const slowStart = window.setTimeout(() => {
  showStartupIssue(document, '启动时间较长，请稍候；也可以重新加载。', false)
}, 15_000)

void import('@renderer/main')
  .catch((error: unknown) => {
    console.error('Trelyx 界面初始化失败。', error)
    showStartupIssue(document, '界面加载失败，请重新加载后重试。', true)
    window.trelyxStartup?.failed()
  })
  .finally(() => {
    window.clearTimeout(slowStart)
  })
