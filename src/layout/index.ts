import { validateDocument, type MindMapDocument } from '@core'
import { applyManualOffsets } from '@layout/manual-offsets'
import { layoutMapDocument } from '@layout/map'
import { layoutStructuredDocument } from '@layout/structured'
import type { MindMapLayout } from '@layout/types'
export { measureTopic, measureTopicImage } from '@layout/measure'
export { measureTopicMarkers } from '@layout/markers'
export type {
  LayoutNode,
  LayoutEdge,
  LayoutDirection,
  LayoutDecoration,
  LayoutPoint,
  MindMapLayout,
} from '@layout/types'
/** Top-left positions, with the center topic anchored at (0, 0). */
export const layoutDocument = (document: MindMapDocument): MindMapLayout => {
  validateDocument(document)
  const defaultMap =
    (document.settings?.layout ?? 'map') === 'map' &&
    !document.floatingIds?.length &&
    !Object.values(document.topics).some(
      (topic) => topic.structure !== undefined && topic.structure !== 'map',
    )
  return applyManualOffsets(
    document,
    defaultMap ? layoutMapDocument(document) : layoutStructuredDocument(document),
  )
}
