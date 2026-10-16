import { ReactFlowProvider } from '@xyflow/react'
import { X } from 'lucide-react'
import { useMemo } from 'react'
import { AnimatePresence, MotionConfig } from 'motion/react'
import { AnimatedPanel } from './components/AnimatedPanel'
import { Toolbar } from './components/Toolbar'
import { KeyboardHelp } from './components/KeyboardHelp'
import { ImportNotice } from './components/ImportNotice'
import { Button } from './components/ui/button'
import { TooltipProvider } from './components/ui/tooltip'
import { Canvas, ZoomControls } from './components/Canvas'
import { SheetTabs } from './components/SheetTabs'
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
import './styles/controls.css'
import './styles/motion.css'

export function App() {
  useFileLifecycle()
  useKeyboardShortcuts()
  const chrome = useWindowChrome()
  const outline = useEditor((state) => state.outlineOpen)
  const inspector = useEditor((state) => state.inspectorOpen)
  const activeSheetId = useEditor((state) => state.activeSheetId)
  const error = useEditor((state) => state.error)
  const recovery = useEditor((state) => state.recovery)
  const topics = useEditor((state) => state.history.document.topics)
  const count = useMemo(() => Object.keys(topics).length, [topics])
  return (
    <MotionConfig reducedMotion="user">
      <TooltipProvider>
        <div
          className="app-shell"
          data-platform={chrome.platform}
          data-focused={chrome.focused}
          data-fullscreen={chrome.fullScreen}
        >
          <Toolbar />
          <div className="app-body">
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
              <ImportNotice />
              <ReactFlowProvider>
                <div className="workspace-content">
                  <AnimatePresence initial={false}>
                    {outline && (
                      <AnimatedPanel key="outline">
                        <Outline />
                      </AnimatedPanel>
                    )}
                  </AnimatePresence>
                  <Canvas key={activeSheetId} />
                  <AnimatePresence initial={false}>
                    {inspector && (
                      <AnimatedPanel key="inspector" side="right">
                        <Inspector />
                      </AnimatedPanel>
                    )}
                  </AnimatePresence>
                </div>
                <footer className="status-bar">
                  <SheetTabs />
                  <span className="topic-count">{count} 个主题</span>
                  <ZoomControls />
                  <KeyboardHelp />
                </footer>
              </ReactFlowProvider>
            </main>
          </div>
        </div>
      </TooltipProvider>
    </MotionConfig>
  )
}
