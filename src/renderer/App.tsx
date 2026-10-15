import { ReactFlowProvider } from '@xyflow/react'
import { GitBranch, X } from 'lucide-react'
import { useMemo } from 'react'
import { Toolbar } from './components/Toolbar'
import { KeyboardHelp } from './components/KeyboardHelp'
import { Button } from './components/ui/button'
import { TooltipProvider } from './components/ui/tooltip'
import { WorkspaceRail } from './components/WorkspaceRail'
import { Canvas } from './components/Canvas'
import { Inspector } from './components/Inspector'
import { Outline } from './components/Outline'
import { useEditor } from './state/editor'
import { restoreRecovery } from './state/files'
import { useFileLifecycle } from './hooks/useFileLifecycle'
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts'
import { useWindowChrome } from './hooks/useWindowChrome'
import '@xyflow/react/dist/style.css'
import './styles/ui.css'
import './styles/base.css'
import './styles/chrome.css'
import './styles/window.css'
import './styles/workspace.css'
import './styles/topics.css'

export function App() {
  useFileLifecycle()
  useKeyboardShortcuts()
  const chrome = useWindowChrome()
  const outline = useEditor((state) => state.outlineOpen)
  const error = useEditor((state) => state.error)
  const recovery = useEditor((state) => state.recovery)
  const topics = useEditor((state) => state.history.document.topics)
  const count = useMemo(() => Object.keys(topics).length, [topics])
  return (
    <TooltipProvider>
      <div
        className="app-shell"
        data-platform={chrome.platform}
        data-focused={chrome.focused}
        data-fullscreen={chrome.fullScreen}
      >
        <Toolbar />
        <div className="app-body">
          <WorkspaceRail />
          <main className="workspace-main">
            {recovery && (
              <div className="recovery-banner" role="status">
                <span>发现上次的自动恢复记录，是否继续之前的思路？</span>
                <Button variant="ghost" size="sm" onClick={restoreRecovery}>
                  恢复导图
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    useEditor.setState({ recovery: null })
                  }}
                >
                  忽略记录
                </Button>
              </div>
            )}
            {error && (
              <div className="error-banner" role="alert">
                <span>{error}</span>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="关闭错误提示"
                  onClick={() => {
                    useEditor.getState().setError(null)
                  }}
                >
                  <X size={15} />
                </Button>
              </div>
            )}
            <div className="workspace-content">
              {outline && <Outline />}
              <ReactFlowProvider>
                <Canvas />
              </ReactFlowProvider>
              <Inspector />
            </div>
            <footer className="status-bar">
              <span>
                <GitBranch size={13} /> {count} 个主题 <i /> 自动布局 · 左右展开
              </span>
              <span className="footer-hint">
                Tab 子主题 <i /> Enter 同级主题 <i /> 双击编辑
              </span>
              <KeyboardHelp />
            </footer>
          </main>
        </div>
      </div>
    </TooltipProvider>
  )
}
