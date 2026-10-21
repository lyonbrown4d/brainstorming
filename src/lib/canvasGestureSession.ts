import type { MindMapDocument, Topic } from '@core'
import type { CanvasFlowNode } from '@renderer/lib/canvasNodes'
import type { SpatialView } from '@renderer/state/spatialView'

export interface DragSession {
  readonly token: symbol
  readonly workbookId: string
  readonly sheetId: string
  readonly document: MindMapDocument
  readonly roots: string[]
  readonly drawings: string[]
  readonly canDrop: boolean
  readonly excluded: Set<string>
  readonly origins: Map<string, { x: number; y: number }>
  readonly nativeOrigins: Map<string, { x: number; y: number }>
  readonly view: SpatialView
  readonly anchorId: string
}

export interface ScaleSession {
  document: MindMapDocument
  workbookId: string
  sheetId: string
  position: { x: number; y: number }
  width: number
  height: number
  style: NonNullable<CanvasFlowNode['style']>
  baseWidth: number
  baseHeight: number
  topic: Topic
  view: SpatialView
  corner: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'
}
