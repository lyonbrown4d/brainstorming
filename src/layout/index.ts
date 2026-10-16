import { validateDocument, type MindMapDocument } from '@core'
import { layoutMapDocument } from './map'
import { layoutStructuredDocument } from './structured'
import type { MindMapLayout } from './types'

export { measureTopic, measureTopicImage } from './measure'
export type {
  LayoutNode,
  LayoutEdge,
  LayoutDirection,
  LayoutDecoration,
  LayoutPoint,
  MindMapLayout,
} from './types'

/** Top-left positions, with the center topic anchored at (0, 0). */
export function layoutDocument(document: MindMapDocument): MindMapLayout {
  validateDocument(document)
  const defaultMap =
    (document.settings?.layout ?? 'map') === 'map' &&
    !document.floatingIds?.length &&
    !Object.values(document.topics).some(
      (topic) => topic.structure !== undefined && topic.structure !== 'map',
    )
  return defaultMap ? layoutMapDocument(document) : layoutStructuredDocument(document)
}
