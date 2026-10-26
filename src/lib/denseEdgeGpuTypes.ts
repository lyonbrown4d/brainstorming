import type { DenseStructuralEdge } from '@renderer/lib/denseStructuralEdgePaths'
import type { ReactFlowState } from '@xyflow/react'

export interface DenseEdgeGpuInput {
  readonly entries: readonly DenseStructuralEdge[]
  readonly width: number
  readonly height: number
  readonly transform: ReactFlowState['transform']
}
export interface DenseEdgeGpuDiagnostics {
  readonly frame: number
  readonly edges: number
  readonly source: (id?: string) => { x: number; y: number } | null
}
export type DenseEdgeGpuCanvas = HTMLCanvasElement & {
  edgeDiagnostics?: DenseEdgeGpuDiagnostics
}
