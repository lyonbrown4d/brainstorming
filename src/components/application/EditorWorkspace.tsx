import { lazy, Suspense, useMemo } from 'react'
import { ReactFlowProvider } from '@xyflow/react'
import { AnimatePresence } from 'motion/react'
import { Canvas } from '@renderer/components/Canvas'
import { ZoomControls } from '@renderer/components/ZoomControls'
import { DocumentTabs } from '@renderer/components/DocumentTabs'
import { Inspector } from '@renderer/components/Inspector'
import { KeyboardHelp } from '@renderer/components/KeyboardHelp'
import { Outline } from '@renderer/components/Outline'
import { SheetTabs } from '@renderer/components/SheetTabs'
import { WorkbenchPanel } from '@renderer/components/WorkbenchPanel'
import { LoadingState } from '@renderer/components/feedback/LoadingState'
import { CanvasOverlay } from '@renderer/components/workbench/CanvasOverlay'
import { useActiveSpatialSetting } from '@renderer/hooks/useActiveSpatialView'
import { useMessages } from '@renderer/i18n/useMessages'
import { useDocumentTabs } from '@renderer/state/documentTabs'
import { useEditor } from '@renderer/state/editor'
import { usePresentation } from '@renderer/state/presentation'

const PresentationWorkspace = lazy(
  () => import('@renderer/components/presentation/PresentationWorkspace'),
)

const EditorSurface = ({ mode }: { mode: '2d' | '3d' }) => {
  const { translate } = useMessages()
  const playing = usePresentation((state) => state.playing)
  const presentationMode = usePresentation((state) => state.workspaceMode)
  const outline = useEditor((state) => state.outlineOpen)
  const inspector = useEditor((state) => state.inspectorOpen)
  const activeSheetId = useEditor((state) => state.activeSheetId)
  const activeTabId = useDocumentTabs((state) => state.activeId)
  const topics = useEditor((state) => state.history.document.topics)
  const count = useMemo(() => Object.keys(topics).length, [topics])
  return (
    <>
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
        <Canvas key={`${activeTabId}:${activeSheetId}`} mode={mode} />
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
          {!presentationMode && <ZoomControls mode={mode} />}
          <KeyboardHelp />
        </footer>
      )}
    </>
  )
}

/** Only the planar editor and its controls share a React Flow viewport. */
export const EditorWorkspace = () => {
  const { value: mode } = useActiveSpatialSetting((view) => view.mode)
  return mode === '3d' ? (
    <EditorSurface mode={mode} />
  ) : (
    <ReactFlowProvider>
      <EditorSurface mode={mode} />
    </ReactFlowProvider>
  )
}
