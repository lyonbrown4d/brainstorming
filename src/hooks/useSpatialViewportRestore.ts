import { useEffect, useState } from 'react'
import { useReactFlow } from '@xyflow/react'
import { useActiveSpatialView } from '@renderer/hooks/useActiveSpatialView'
import { getSpatialViewport } from '@renderer/state/spatialViewports'
import { useEditor } from '@renderer/state/editor'
import { canvasFitPadding } from '@renderer/hooks/useWorkbenchInsets'

/** Keep mode changes covered until their matching geometry and viewport are both applied. */
export const useSpatialViewportRestore = (ready: boolean): boolean => {
  const { view, workbookId, sheetId } = useActiveSpatialView()
  const flow = useReactFlow()
  const scope = JSON.stringify([workbookId, sheetId, view.mode])
  const [applied, setApplied] = useState(scope)
  useEffect(() => {
    if (!ready || applied === scope) return
    let cancelled = false
    const frame = requestAnimationFrame(() => {
      const viewport = getSpatialViewport(workbookId, sheetId, view.mode)
      const restore =
        view.mode === '3d'
          ? Promise.resolve()
          : viewport
            ? flow.setViewport(viewport)
            : flow.fitView({ padding: canvasFitPadding(), maxZoom: 1.2 })
      void restore.then(() => {
        if (cancelled) return
        setApplied(scope)
        const id = useEditor.getState().selectedId
        document
          .querySelector<HTMLElement>(`.topic-input[data-topic-id="${CSS.escape(id)}"]`)
          ?.focus({ preventScroll: true })
      })
    })
    return () => {
      cancelled = true
      cancelAnimationFrame(frame)
    }
  }, [flow, ready, view.mode, workbookId, sheetId, scope, applied])
  return applied === scope
}
