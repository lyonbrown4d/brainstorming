import { CanvasOverlay } from './workbench/CanvasOverlay'
import { motion, useReducedMotion } from 'motion/react'
import { Component, lazy, Suspense, useCallback, useEffect, useState, type ReactNode } from 'react'
import { ArrowLeft, Focus } from 'lucide-react'
import { getParentId, type MindMapDocument } from '@core'
import { interactAnnotationTopic, useAnnotationInteraction } from '../state/annotationInteraction'
import { useEditor } from '../state/editor'
import { defaultSpatialView, useSpatialView, visibleSpatialFocus } from '../state/spatial'
import { isCompositionKey } from '../state/keyboard'
import { usePresentation } from '../state/presentation'
import { FloatingToolbar } from './FloatingToolbar'
import { changeViewMode } from './ViewModeSwitch'
import { Button } from './ui/button'
import type { SpatialCameraState } from './spatial/SpatialCanvas'

const SpatialCanvas = lazy(() => import('./spatial/SpatialCanvas'))

function supportsSpatialCanvas(): boolean {
  try {
    const canvas = window.document.createElement('canvas')
    const context = canvas.getContext('webgl2')
    if (!context) return false
    context.getExtension('WEBGL_lose_context')?.loseContext()
    return true
  } catch {
    return false
  }
}

function SpatialUnavailable() {
  return (
    <div
      role="alert"
      className="absolute inset-0 flex flex-col items-center justify-center gap-4 px-8 text-center"
    >
      <h2 className="text-lg font-semibold">暂时无法显示三维视图</h2>
      <p className="max-w-sm text-sm leading-relaxed text-muted-foreground">
        三维视图需要 WebGL 2 图形支持。请返回二维视图继续编辑，或检查设备的图形加速设置。
      </p>
      <Button variant="outline" onClick={() => changeViewMode('2d')}>
        返回二维视图
      </Button>
    </div>
  )
}

class SpatialBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  override state = { failed: false }
  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true }
  }
  override render() {
    return this.state.failed ? <SpatialUnavailable /> : this.props.children
  }
}

function focusPath(document: MindMapDocument, focusId: string): readonly string[] {
  const path = [focusId]
  let parentId = getParentId(document, focusId)
  while (parentId) {
    path.unshift(parentId)
    parentId = getParentId(document, parentId)
  }
  return path
}

export function SpatialWorkspace() {
  const reduced = useReducedMotion()
  const presentation = usePresentation()
  const playing = presentation.playing
  const document = useEditor((state) => state.history.document)
  const selectedId = useEditor((state) => state.selectedId)
  const sheetId = useEditor((state) => state.activeSheetId)
  const view = useSpatialView((state) => state.sheets[sheetId] ?? defaultSpatialView)
  const step = playing ? presentation.steps[presentation.index] : undefined
  const focusId = step
    ? step.camera || step.topicId === document.rootId
      ? null
      : step.topicId
    : visibleSpatialFocus(document, view.focusId)
  const [supported] = useState(supportsSpatialCanvas)
  const saveCamera = useCallback(
    (camera: SpatialCameraState): void => {
      useSpatialView.getState().setCamera(sheetId, camera)
    },
    [sheetId],
  )
  const returnToMap = (): void => {
    useSpatialView.getState().setFocus(sheetId, null)
  }
  const selectTopic = useCallback((id: string): void => {
    if (usePresentation.getState().playing) return
    if (interactAnnotationTopic(id)) return
    useAnnotationInteraction.setState({ selected: null, editing: false })
    useEditor.getState().select(id)
  }, [])
  const collapseTopic = useCallback((id: string): void => {
    if (usePresentation.getState().playing) return
    const editor = useEditor.getState()
    editor.commitDraft()
    if (!useEditor.getState().editingId) editor.command({ type: 'toggleCollapse', topicId: id })
  }, [])
  const focusTopic = useCallback(
    (id: string): void => {
      if (usePresentation.getState().playing) return
      useEditor.getState().select(id)
      const editor = useEditor.getState()
      if (editor.editingId || !editor.history.document.topics[id]) return
      useSpatialView.getState().setFocus(sheetId, id === editor.history.document.rootId ? null : id)
      useEditor.setState({ inspectorOpen: true })
    },
    [sheetId],
  )
  useEffect(() => {
    const escape = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape' || event.defaultPrevented || isCompositionKey(event)) return
      const target = event.target
      if (
        target instanceof HTMLElement &&
        (target.isContentEditable ||
          target.closest(
            'input, textarea, select, [role="menu"], [role="dialog"], [role="menuitem"]',
          ))
      )
        return
      event.preventDefault()
      useSpatialView.getState().setFocus(sheetId, null)
    }
    window.addEventListener('keydown', escape)
    return () => {
      window.removeEventListener('keydown', escape)
    }
  }, [sheetId])
  return (
    <motion.section
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: reduced ? 0 : 0.12 }}
      id="sheet-panel"
      role="tabpanel"
      aria-label="当前三维画布"
      className="relative min-h-0 min-w-0 flex-1 overflow-hidden bg-background [container-type:inline-size]"
    >
      {supported ? (
        <SpatialBoundary>
          <Suspense
            fallback={
              <div
                role="status"
                className="absolute inset-0 grid place-items-center text-sm text-muted-foreground"
              >
                正在加载三维视图…
              </div>
            }
          >
            <SpatialCanvas
              key={sheetId}
              document={document}
              selectedId={selectedId}
              focusId={focusId}
              {...(view.camera && focusId === view.focusId ? { cameraState: view.camera } : {})}
              onSelect={selectTopic}
              onFocus={focusTopic}
              onCollapse={collapseTopic}
              onCameraChange={saveCamera}
            />
          </Suspense>
        </SpatialBoundary>
      ) : (
        <SpatialUnavailable />
      )}
      {supported && !playing && (
        <CanvasOverlay>
          <FloatingToolbar />
          <div className="pointer-events-none absolute top-5 left-4 z-10 flex max-w-[calc(100%-2rem)] items-center gap-3">
            {focusId && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  className="pointer-events-auto shrink-0 bg-background/95 shadow-sm"
                  onClick={returnToMap}
                >
                  <ArrowLeft size={15} />
                  返回全图
                </Button>
                <nav
                  aria-label="聚焦路径"
                  className="pointer-events-auto min-w-0 text-xs text-muted-foreground"
                >
                  <ol className="flex min-w-0 items-center gap-1.5 overflow-hidden">
                    {focusPath(document, focusId).map((id, index) => (
                      <li key={id} className="flex min-w-0 items-center gap-1.5">
                        {index > 0 && <span aria-hidden>/</span>}
                        <button
                          className="max-w-32 truncate rounded px-1 py-1"
                          aria-current={id === focusId ? 'location' : undefined}
                          onClick={() => {
                            focusTopic(id)
                          }}
                        >
                          {document.topics[id]?.title}
                        </button>
                      </li>
                    ))}
                  </ol>
                </nav>
              </>
            )}
            {!focusId && (
              <Button
                variant="outline"
                size="sm"
                className="pointer-events-auto bg-background/95 shadow-sm"
                onClick={() => {
                  focusTopic(selectedId)
                }}
              >
                <Focus size={15} />
                聚焦选中主题
              </Button>
            )}
          </div>
        </CanvasOverlay>
      )}
    </motion.section>
  )
}
