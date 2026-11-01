import { useMemo } from 'react'
import type { MindMapDocument } from '@core'
import { useTopicFilters } from '@renderer/components/documents/filterTopics'
import { canvasTopicFilter } from '@renderer/lib/canvasTopicFilter'

export const useCanvasTopicFilter = (document: MindMapDocument) => {
  const filters = useTopicFilters()
  return useMemo(() => canvasTopicFilter(document, filters), [document, filters])
}
