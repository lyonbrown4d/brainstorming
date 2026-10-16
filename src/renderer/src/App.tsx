import { QueryClientProvider } from '@tanstack/react-query'
import { queryClient } from './lib/queryClient'
import { usePresentation } from './state/presentation'
import { PresentationPlayback } from './components/documents/PresentationControls'
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
import { SearchPanel } from './components/SearchPanel'
import { PasswordPrompt } from './components/files/PasswordPrompt'
import { SpatialWorkspace } from './components/SpatialWorkspace'
import { useEditor } from './state/editor'
import { useSpatialView } from './state/spatial'
import { restoreRecovery } from './state/files'
import { useFileLifecycle } from './hooks/useFileLifecycle'
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts'
import { useWindowChrome } from './hooks/useWindowChrome'
import { useStartupScreen } from './hooks/useStartupScreen'
import { useWorkspace } from './state/workspace'
import { CreationWorkspace, WorkspaceHeader } from './components/creation/CreationWorkspace'
import '@xyflow/react/dist/style.css'
import './styles/ui.css'
import './styles/base.css'
import './styles/chrome.css'
import './styles/window.css'
import './styles/topics.css'
import './styles/motion.css'

export function App() {
  useStartupScreen()
  useFileLifecycle()
  useKeyboardShortcuts()
  const chrome = useWindowChrome()
  const playing = usePresentation((state) => state.playing)
  const screen = useWorkspace((state) => state.screen)
  const outline = useEditor((state) => state.outlineOpen)
  const inspector = useEditor((state) => state.inspectorOpen)
  const activeSheetId = useEditor((state) => state.activeSheetId)
  const spatial = useSpatialView((state) => state.sheets[activeSheetId]?.mode === '3d')
  const error = useEditor((state) => state.error)
  const recovery = useEditor((state) => state.recovery)
  const topics = useEditor((state) => state.history.document.topics)
  const count = useMemo(() => Object.keys(topics).length, [topics])
  return (
    <QueryClientProvider client={queryClient}>
      <MotionConfig reducedMotion="user">
        <TooltipProvider>
          <div
            className="app-shell flex h-full w-full min-w-0 flex-col"
            data-platform={chrome.platform}
            data-focused={chrome.focused}
            data-fullscreen={chrome.fullScreen}
          >
            {!playing && (screen === 'editor' ? <Toolbar /> : <WorkspaceHeader />)}
            <div className="app-body relative flex min-h-0 flex-1">
              <main className="workspace-main relative flex min-h-0 min-w-0 flex-1 flex-col">
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
                {error && screen === 'editor' && (
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
                {screen === 'editor' && !playing && <SearchPanel />}
                <PasswordPrompt />
                {screen !== 'editor' ? (
                  <CreationWorkspace />
                ) : (
                  <ReactFlowProvider>
                    <div className="workspace-content relative flex min-h-0 min-w-0 flex-1">
                      <AnimatePresence initial={false}>
                        {outline && !playing && (
                          <AnimatedPanel key="outline">
                            <Outline />
                          </AnimatedPanel>
                        )}
                      </AnimatePresence>
                      {spatial ? (
                        <SpatialWorkspace key={activeSheetId} />
                      ) : (
                        <Canvas key={activeSheetId} />
                      )}
                      <AnimatePresence initial={false}>
                        {inspector && !playing && (
                          <AnimatedPanel key="inspector" side="right">
                            <Inspector />
                          </AnimatedPanel>
                        )}
                      </AnimatePresence>
                    </div>
                    <PresentationPlayback />
                    {!playing && (
                      <footer className="status-bar z-[8] flex h-12 min-h-12 shrink-0 items-center gap-2 border-t border-border bg-background pr-2 text-muted-foreground lg:gap-3 lg:pr-4">
                        <SheetTabs />
                        <span className="topic-count hidden shrink-0 text-xs whitespace-nowrap lg:inline">
                          {count} 个主题
                        </span>
                        {!spatial && <ZoomControls />}
                        <KeyboardHelp />
                      </footer>
                    )}
                  </ReactFlowProvider>
                )}
              </main>
            </div>
          </div>
        </TooltipProvider>
      </MotionConfig>
    </QueryClientProvider>
  )
}
