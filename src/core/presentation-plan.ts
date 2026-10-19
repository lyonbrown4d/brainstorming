import type { MindMapDocument } from '@core/types'
import type { PresentationStep } from '@core/extensions'

/** Generation stays transient until a page or its notes are edited. */
export const presentationPlan = (document: MindMapDocument): readonly PresentationStep[] =>
  document.presentation?.length
    ? document.presentation
    : [
        document.rootId,
        ...(document.topics[document.rootId]?.children ?? []).filter(
          (id) => !document.floatingIds?.includes(id),
        ),
      ].map((topicId) => ({ topicId }))
