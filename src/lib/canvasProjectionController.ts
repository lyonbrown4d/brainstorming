import { createStore } from 'zustand/vanilla'
import type { MindMapDocument } from '@core'
import type { projectCanvas } from '@renderer/components/documents/projectCanvas'
import type { CanvasProjectionFrame } from '@renderer/lib/canvasProjectionFrame'

export type CanvasProjection = ReturnType<typeof projectCanvas>
const emptyProjection: CanvasProjection = { nodes: [], edges: [], layoutNodes: [], decorations: [] }
interface ProjectionSnapshot {
  readonly document: MindMapDocument | null
  readonly projection: CanvasProjection
}

/** Retain the canonical 2D projection independently of React Flow's pointer previews. */
export const createCanvasProjectionController = (scopeId: string) => {
  const store = createStore<ProjectionSnapshot>(() => ({
    document: null,
    projection: emptyProjection,
  }))
  return {
    getState: store.getState,
    getInitialState: store.getInitialState,
    subscribe: store.subscribe,
    getProjection: () => store.getState().projection,
    updateFrame: (next: CanvasProjectionFrame | null): void => {
      const frame = next?.scopeId === scopeId && next.phase === '2d' ? next : null
      const projection = frame?.projection ?? emptyProjection
      const document = frame?.document ?? null
      const before = store.getState()
      if (before.projection !== projection || before.document !== document)
        store.setState({ document, projection })
    },
  }
}
export type CanvasProjectionController = ReturnType<typeof createCanvasProjectionController>
