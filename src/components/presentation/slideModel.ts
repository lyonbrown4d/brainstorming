import type { MindMapDocument, PresentationStep, Topic } from '@core'

export interface PresentationSlide {
  step: PresentationStep
  topic: Topic
  items: readonly Topic[]
  layout: NonNullable<PresentationStep['layout']>
  notes: string
}

/** Build only the requested page and its immediate content, never a parallel copy of the tree. */
export const buildPresentationSlide = (
  document: MindMapDocument,
  step: PresentationStep,
): PresentationSlide | null => {
  const topic = document.topics[step.topicId]
  if (!topic) return null
  const items = topic.children.flatMap((id) =>
    document.topics[id] && (topic.id !== document.rootId || !document.floatingIds?.includes(id))
      ? [document.topics[id]]
      : [],
  )
  const layout =
    step.layout && step.layout !== 'auto'
      ? step.layout
      : topic.image || items.some((item) => item.image)
        ? 'image'
        : topic.id === document.rootId || items.length <= 4
          ? 'structure'
          : 'list'
  return {
    step,
    topic,
    items,
    layout,
    notes: step.notes?.trim() ? step.notes : (topic.notes ?? ''),
  }
}

/** Long pages use a window so every item remains readable and reachable during reveal. */
export const slideItemWindow = (slide: PresentationSlide, revealed?: number): readonly Topic[] => {
  if (revealed === undefined) return slide.items.slice(0, 6)
  const visible = slide.items.slice(0, revealed)
  return visible.slice(Math.max(0, visible.length - 6))
}
