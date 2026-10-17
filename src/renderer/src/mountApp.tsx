import { StrictMode } from 'react'
import { AppearanceProvider } from '@renderer/components/appearance/AppearanceProvider'
import { createRoot } from 'react-dom/client'
import { App } from '@renderer/App'
import { showStartupIssue } from '@renderer/startupStatus'
import { requireDesktopAPI } from '@renderer/lib/desktop'
requireDesktopAPI()
const container = document.getElementById('root')
if (!container) throw new Error('应用挂载点不存在')
createRoot(container, {
  onUncaughtError: (error) => {
    console.error('Brainstorming 界面渲染失败。', error)
    showStartupIssue(document, '界面加载失败，请重新加载后重试。', true)
    window.brainstormingStartup?.failed()
  },
}).render(
  <StrictMode>
    <AppearanceProvider>
      <App />
    </AppearanceProvider>
  </StrictMode>,
)
