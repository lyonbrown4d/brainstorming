import { useEffect, useRef, useState } from 'react'
import { App } from '@renderer/App'
import { independentSpatialRuntimeAt } from '@renderer/lib/independentSpatialRegistry'
import type { IndependentSpatialRuntime } from '@renderer/lib/independentSpatialRuntime'
import { useEditor } from '@renderer/state/editor'
import { selectedTopicIds, selectedDrawingIds } from '@renderer/state/selection'
import { getSpatialView } from '@renderer/state/spatialView'
import { useAnnotationInteraction } from '@renderer/state/annotationInteraction'
import { useCanvasInteraction } from '@renderer/state/canvasInteraction'

/** Read-only fixture evidence; all user actions still enter through browser input. */
const SpatialEvidence = () => {
  const [snapshot, setSnapshot] = useState('{}')
  const element = useRef<HTMLOutputElement>(null)
  useEffect(() => {
    let runtime: IndependentSpatialRuntime | undefined
    const read = () => {
      const canvas = document.querySelector('canvas[data-spatial-canvas="three"]')
      if (runtime?.canvas !== canvas) runtime = undefined
      if (!runtime && canvas) {
        const bounds = canvas.getBoundingClientRect()
        for (const x of [0.5, 0.25, 0.75])
          for (const y of [0.5, 0.35, 0.65])
            runtime ??= independentSpatialRuntimeAt(
              bounds.x + bounds.width * x,
              bounds.y + bounds.height * y,
            )
      }
      const editor = useEditor.getState()
      const map = editor.history.document
      return {
        modelCurrent: runtime?.model.document === map,
        count: Object.keys(map.topics).length,
        document: map,
        selectedDrawings: selectedDrawingIds(editor),
        history: { past: editor.history.past.length, future: editor.history.future.length },
        annotation: useAnnotationInteraction.getState(),
        drop: useCanvasInteraction.getState().drag?.drop ?? null,
        title: map.topics['branch-a']?.title,
        selected: selectedTopicIds(editor),
        topic: map.topics['branch-a'],
        view: getSpatialView(editor.workbook.id, editor.activeSheetId),
        camera: runtime?.camera?.matrixWorld.toArray() ?? [],
        rectangles: runtime?.rectangles() ?? [],
      }
    }
    const output = element.current
    if (!output) return
    // Tests read the live, read-only snapshot rather than a 50ms-old display frame.
    Object.defineProperty(output, 'spatialEvidence', { configurable: true, get: read })
    const update = () => {
      setSnapshot(JSON.stringify(read()))
    }
    update()
    const timer = window.setInterval(update, 50)
    return () => {
      window.clearInterval(timer)
      Reflect.deleteProperty(output, 'spatialEvidence')
    }
  }, [])
  return (
    <output ref={element} className="sr-only" data-testid="independent-spatial-evidence">
      {snapshot}
    </output>
  )
}

export const IndependentSpatialPreview = () => (
  <>
    <App />
    <SpatialEvidence />
  </>
)
