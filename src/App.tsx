import { CommandPalette } from '@renderer/components/commands/CommandPalette'
import { LoadingState } from '@renderer/components/feedback/LoadingState'
import { WorkspaceRouterBoundary, WorkspaceRoutes } from '@renderer/routing/WorkspaceRouter'
import { SettingsRoute } from '@renderer/routing/SettingsRoute'
import { useLinkPreviewQueue } from '@renderer/hooks/useLinkPreviewQueue'
import { useFileDrop } from '@renderer/hooks/useFileDrop'
import { FileDropOverlay } from '@renderer/components/FileDropOverlay'
import { useMessages } from '@renderer/i18n/useMessages'

import { QueryClientProvider } from '@tanstack/react-query'
import { queryClient } from '@renderer/lib/queryClient'
import { usePresentation } from '@renderer/state/presentation'
import { ReactFlowProvider } from '@xyflow/react'
import { X } from 'lucide-react'
import { lazy, Suspense, useEffect, useMemo } from 'react'
import { startContentIndexSync } from '@renderer/state/contentIndex'
import { AnimatePresence, MotionConfig } from 'motion/react'
import { WorkbenchPanel } from '@renderer/components/WorkbenchPanel'
import { useNativeViewport } from '@renderer/hooks/useNativeViewport'
import { Toolbar } from '@renderer/components/Toolbar'
import { KeyboardHelp } from '@renderer/components/KeyboardHelp'
import { ImportNotice } from '@renderer/components/ImportNotice'
import { Button } from '@renderer/components/ui/button'
import { TooltipProvider } from '@renderer/components/ui/tooltip'
import { Canvas, ZoomControls } from '@renderer/components/Canvas'
import { SheetTabs } from '@renderer/components/SheetTabs'
import { DocumentTabs } from '@renderer/components/DocumentTabs'
import { CanvasOverlay } from '@renderer/components/workbench/CanvasOverlay'
import { Inspector } from '@renderer/components/Inspector'
import { Outline } from '@renderer/components/Outline'
import { SearchPanel } from '@renderer/components/SearchPanel'
import { PasswordPrompt } from '@renderer/components/files/PasswordPrompt'
import { useEditor } from '@renderer/state/editor'
import { useDocumentTabs } from '@renderer/state/documentTabs'
import {
  restoreWorkspaceRecovery,
  dismissWorkspaceRecovery,
} from '@renderer/state/documentRecovery'
import { useFileLifecycle } from '@renderer/hooks/useFileLifecycle'
import { useKeyboardShortcuts } from '@renderer/hooks/useKeyboardShortcuts'
import { useWindowChrome } from '@renderer/hooks/useWindowChrome'
import { useStartupScreen } from '@renderer/hooks/useStartupScreen'
import { useMCPBridge } from '@renderer/hooks/useMCPBridge'
import { useWorkspace } from '@renderer/state/workspace'
import { CreationWorkspace, WorkspaceHeader } from '@renderer/components/creation/CreationWorkspace'
import '@xyflow/react/dist/style.css'
import '@renderer/styles/ui.css'
import '@renderer/styles/base.css'
import '@renderer/styles/chrome.css'
import '@renderer/styles/window.css'
import '@renderer/styles/topics.css'
import '@renderer/styles/motion.css'

const PresentationWorkspace = lazy(
  () => import('@renderer/components/presentation/PresentationWorkspace'),
)

const AppWorkspace = () => {
  const { translate } = useMessages()

  useEffect(startContentIndexSync, [])
  useNativeViewport()
  useStartupScreen()
  useMCPBridge()
  useFileLifecycle()
  useLinkPreviewQueue()
  useKeyboardShortcuts()
  const fileDrop = useFileDrop()
  const chrome = useWindowChrome()
  const playing = usePresentation((state) => state.playing)
  const presentationMode = usePresentation((state) => state.workspaceMode)
  const screen = useWorkspace((state) => state.screen)
  const outline = useEditor((state) => state.outlineOpen)
  const inspector = useEditor((state) => state.inspectorOpen)
  const activeSheetId = useEditor((state) => state.activeSheetId)
  const error = useEditor((state) => state.error)
  const recovery = useDocumentTabs((state) => state.recovery)
  const activeTabId = useDocumentTabs((state) => state.activeId)
  const topics = useEditor((state) => state.history.document.topics)
  const count = useMemo(() => Object.keys(topics).length, [topics])
  return (
    <QueryClientProvider client={queryClient}>
      <MotionConfig reducedMotion="user">
        <TooltipProvider>
          <div
            className="app-shell group/shell relative flex h-full bg-canvas text-foreground w-full min-w-0 flex-col pt-[env(safe-area-inset-top)] pr-[env(safe-area-inset-right)] pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)]"
            {...fileDrop.handlers}
            data-platform={chrome.platform}
            data-focused={chrome.focused}
            data-fullscreen={chrome.fullScreen}
          >
            <FileDropOverlay {...fileDrop} />
            <SettingsRoute />
            <CommandPalette />
            {!playing && (screen === 'editor' ? <Toolbar /> : <WorkspaceHeader />)}
            <div className="app-body relative flex min-h-0 flex-1">
              <main className="workspace-main relative flex min-h-0 min-w-0 flex-1 flex-col">
                {recovery.length > 0 && (
                  <div className="recovery-banner" role="status">
                    <span>{translate('workspaceRecoveryFound')}</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => void restoreWorkspaceRecovery()}
                    >
                      {translate('restoreMaps', { count: recovery.length })}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => void dismissWorkspaceRecovery()}
                    >
                      {translate('dismissRecovery')}
                    </Button>
                  </div>
                )}
                {error && screen === 'editor' && (
                  <div className="error-banner" role="alert">
                    <span>{error}</span>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={translate('dismissError')}
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
                  <div className="relative flex min-h-0 flex-1 flex-col">
                    <DocumentTabs />
                    <CreationWorkspace />
                  </div>
                ) : (
                  <ReactFlowProvider>
                    <div
                      className={`workspace-content relative flex min-h-0 min-w-0 flex-1 ${presentationMode ? 'invisible pointer-events-none' : ''}`}
                      inert={presentationMode !== null}
                      aria-hidden={presentationMode !== null || undefined}
                    >
                      {!playing && (
                        <CanvasOverlay className="z-40">
                          <DocumentTabs />
                        </CanvasOverlay>
                      )}
                      <AnimatePresence initial={false}>
                        {outline && !playing && (
                          <WorkbenchPanel key="outline">
                            <Outline key={activeTabId} />
                          </WorkbenchPanel>
                        )}
                      </AnimatePresence>
                      <Canvas key={`${activeTabId}:${activeSheetId}`} />
                      <AnimatePresence initial={false}>
                        {inspector && !playing && (
                          <WorkbenchPanel key="inspector" side="right">
                            <Inspector key={activeTabId} />
                          </WorkbenchPanel>
                        )}
                      </AnimatePresence>
                    </div>
                    {presentationMode && (
                      <div
                        className={`absolute inset-0 z-40 bg-background ${presentationMode === 'composer' ? 'bottom-12 sm:bottom-10' : ''}`}
                        data-presentation-workspace
                      >
                        <Suspense
                          fallback={
                            <LoadingState
                              variant="surface"
                              className="h-full justify-center"
                              label={translate('presentation')}
                            />
                          }
                        >
                          <PresentationWorkspace />
                          {presentationMode === 'composer' && (
                            <CanvasOverlay className="z-50">
                              <DocumentTabs />
                            </CanvasOverlay>
                          )}
                        </Suspense>
                      </div>
                    )}
                    {!playing && (
                      <footer className="status-bar z-[8] flex h-12 min-h-12 sm:h-10 sm:min-h-10 shrink-0 items-center gap-2 border-t border-border/80 bg-background pr-2 text-muted-foreground lg:gap-3 lg:pr-4">
                        <SheetTabs />
                        <span className="topic-count hidden shrink-0 text-xs whitespace-nowrap lg:inline">
                          {translate('topicCount', { count })}
                        </span>
                        {!presentationMode && <ZoomControls />}
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

export const App = () => (
  <WorkspaceRouterBoundary>
    <WorkspaceRoutes>
      <AppWorkspace />
    </WorkspaceRoutes>
  </WorkspaceRouterBoundary>
)
