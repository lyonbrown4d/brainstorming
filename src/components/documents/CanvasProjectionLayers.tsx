import { useStore } from 'zustand'
import type { CanvasProjectionController } from '@renderer/lib/canvasProjectionController'
import { StructuralEdgeLayer } from '@renderer/components/documents/StructuralEdgeLayer'
import { StructureGeometry } from '@renderer/components/documents/StructureGeometry'
import { CanvasAnnotations } from '@renderer/components/annotations/CanvasAnnotations'

/** Canonical 2D geometry updates its SVG layers without repainting the canvas shell. */
export const CanvasProjectionLayers = ({
  controller,
}: {
  controller: CanvasProjectionController
}) => {
  const { projection, document } = useStore(controller)
  return (
    <>
      <StructuralEdgeLayer edges={projection.edges} />
      {document && (
        <>
          <StructureGeometry document={document} decorations={projection.decorations} />
          <CanvasAnnotations document={document} nodes={projection.layoutNodes} />
        </>
      )}
    </>
  )
}
