import { useEffect, useState } from 'react'
import { useReactFlow } from '@xyflow/react'
import { getSpatialViewport } from '@renderer/state/spatialViewports'
import { canvasFitPadding } from '@renderer/hooks/useWorkbenchInsets'

/** Reveal a 2D sheet after its own saved viewport or initial fit has rendered. */
export const useCanvas2DViewportRestore = (
  ready: boolean,
  workbookId: string,
  sheetId: string,
  documentId: string,
): boolean => {
  const flow = useReactFlow()
  const scope = JSON.stringify([workbookId, sheetId, documentId])
  const [applied, setApplied] = useState('')
  useEffect(() => {
    if (!ready || applied === scope) return
    let cancelled = false
    let reveal = 0
    const frame = requestAnimationFrame(() => {
      const viewport = getSpatialViewport(workbookId, sheetId, '2d')
      const restore = viewport
        ? flow.setViewport(viewport)
        : flow.fitView({ padding: canvasFitPadding(), maxZoom: 1.2 })
      void restore.then(() => {
        if (cancelled) return
        reveal = requestAnimationFrame(() => {
          if (!cancelled) setApplied(scope)
        })
      })
    })
    return () => {
      cancelled = true
      cancelAnimationFrame(frame)
      cancelAnimationFrame(reveal)
    }
  }, [flow, ready, workbookId, sheetId, scope, applied])
  return applied === scope
}
