import { independentSpatialInkKey } from '@renderer/lib/independentSpatialInkIdentity'
import { type PerspectiveCamera, Vector3 } from 'three'
import { noop } from 'lodash-es'
import type { MindMapDocument, Relation } from '@core'
import type { MindMapLayout } from '@layout'
import { inkGeometry, type InkBounds } from '@shared/ink-geometry'

export interface SpatialSceneModel {
  readonly document: MindMapDocument
  readonly layout: MindMapLayout
  readonly depths: Readonly<Record<string, number>>
  readonly surface: string
}
export interface SpatialSceneOffset {
  readonly x: number
  readonly y: number
  readonly z: number
}
interface SpatialSceneBounds {
  readonly id: string
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
  readonly depth: number
}
export type SpatialSceneRect = SpatialSceneBounds &
  ({ readonly kind: 'topic' } | { readonly kind: 'ink'; readonly drawingId: string })

/** This runtime belongs exclusively to the Three canvas. No React Flow store or node records. */
export const createIndependentSpatialRuntime = (model: SpatialSceneModel) => {
  const listeners = new Set<(kind: 'camera' | 'model' | 'preview') => void>()
  let source: SpatialSceneModel | null = null
  let entries = new Map<
    string,
    Omit<SpatialSceneRect, 'kind' | 'depth'> &
      ({ kind: 'topic' } | { kind: 'ink'; drawingId: string }) & { z: number }
  >()
  const readEntries = () => {
    if (source !== runtime.model) {
      source = runtime.model
      entries = new Map(
        [
          ...source.layout.nodes.map((node) => ({
            ...node,
            kind: 'topic' as const,
            z: source?.depths[node.id] ?? 0,
          })),
          ...(source.document.drawings ?? []).map((stroke) => ({
            id: independentSpatialInkKey(runtime.model.document, stroke.id),
            drawingId: stroke.id,
            kind: 'ink' as const,
            ...inkGeometry(stroke).bounds,
            z: stroke.spatialDepth ?? 0,
          })),
        ].map((node) => [node.id, node]),
      )
    }
    return entries
  }
  const runtime = {
    model,
    updateModel: (next: SpatialSceneModel) => {
      runtime.model = next
      // Preview ownership ends at the model boundary, even if loading unmounted input handlers.
      runtime.offsets.clear()
      runtime.inkPreviews.clear()
      runtime.scales.clear()
      runtime.relationPreviews.clear()
      runtime.changed('model')
    },
    attachRenderer: (canvas: HTMLCanvasElement, invalidate: () => void) => {
      runtime.canvas = canvas
      runtime.invalidate = invalidate
    },
    camera: null as PerspectiveCamera | null,
    canvas: null as HTMLCanvasElement | null,
    invalidate: (): void => undefined,
    freezeCamera: (): void => undefined,
    /** Screen CSS-pixel content translation; the Three controller owns its session. */
    panCameraBy: noop as (x: number, y: number) => void,
    zoomCameraBy: noop as (deltaY: number) => void,
    navigating: false,
    interacting: false,
    offsets: new Map<string, SpatialSceneOffset>(),
    inkPreviews: new Map<string, InkBounds>(),
    relationPreviews: new Map<string, Relation>(),
    scales: new Map<string, number>(),
    hiddenTopics: new Set<string>(),
    dropTarget: null as string | null,
    changed: (kind: 'camera' | 'model' | 'preview' = 'preview') => {
      for (const listener of listeners) listener(kind)
      runtime.invalidate()
    },
    subscribe: (listener: (kind: 'camera' | 'model' | 'preview') => void) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    rectangles: (ids?: ReadonlySet<string>): SpatialSceneRect[] => {
      const { camera, canvas } = runtime
      if (!camera || !canvas) return []
      const bounds = canvas.getBoundingClientRect()
      const right = new Vector3().setFromMatrixColumn(camera.matrixWorld, 0)
      const up = new Vector3().setFromMatrixColumn(camera.matrixWorld, 1)
      const entries = ids
        ? [...ids].flatMap((id) => {
            const entry = readEntries().get(id)
            return entry ? [entry] : []
          })
        : [...readEntries().values()]
      return entries.flatMap((entry) => {
        const preview = entry.kind === 'ink' ? runtime.inkPreviews.get(entry.id) : undefined
        const node = preview ? { ...entry, ...preview } : entry
        const offset = runtime.offsets.get(node.id)
        const center = new Vector3(
          node.x + node.width / 2 + (offset?.x ?? 0),
          -node.y - node.height / 2 - (offset?.y ?? 0),
          node.z + (offset?.z ?? 0),
        )
        const cameraPoint = center.clone().applyMatrix4(camera.matrixWorldInverse)
        if (cameraPoint.z >= -camera.near || cameraPoint.z < -camera.far) return []
        const point = center.clone().project(camera)
        const horizontal = center
          .clone()
          .addScaledVector(right, node.width / 2)
          .project(camera)
        const vertical = center
          .clone()
          .addScaledVector(up, node.height / 2)
          .project(camera)
        const width =
          Math.abs(horizontal.x - point.x) * bounds.width * (runtime.scales.get(node.id) ?? 1)
        const height =
          Math.abs(vertical.y - point.y) * bounds.height * (runtime.scales.get(node.id) ?? 1)
        return [
          {
            id: node.id,
            ...(node.kind === 'ink'
              ? { kind: 'ink' as const, drawingId: node.drawingId }
              : { kind: 'topic' as const }),
            x: bounds.left + ((point.x + 1) * bounds.width) / 2 - width / 2,
            y: bounds.top + ((1 - point.y) * bounds.height) / 2 - height / 2,
            width,
            height,
            depth: -cameraPoint.z,
          },
        ]
      })
    },
    rectangle: (id: string): SpatialSceneRect | null =>
      runtime.rectangles(new Set([id]))[0] ?? null,
    pick: (x: number, y: number): SpatialSceneRect | null =>
      runtime
        .rectangles()
        .filter(
          (rect) =>
            x >= rect.x && x <= rect.x + rect.width && y >= rect.y && y <= rect.y + rect.height,
        )
        .sort((a, b) => a.depth - b.depth)[0] ?? null,
  }
  return runtime
}
export type IndependentSpatialRuntime = ReturnType<typeof createIndependentSpatialRuntime>
