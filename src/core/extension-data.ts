import type { DocumentExtensions } from './extensions'
import type { MindMapDocument, Topic } from './types'

/** Extension validators admit only bounded JSON data; snapshots never share mutable arrays. */
export function documentExtensionData(document: MindMapDocument): DocumentExtensions {
  return {
    ...(document.settings === undefined ? {} : { settings: structuredClone(document.settings) }),
    ...(document.relations === undefined ? {} : { relations: structuredClone(document.relations) }),
    ...(document.groups === undefined ? {} : { groups: structuredClone(document.groups) }),
    ...(document.callouts === undefined ? {} : { callouts: structuredClone(document.callouts) }),
    ...(document.floatingIds === undefined ? {} : { floatingIds: [...document.floatingIds] }),
    ...(document.floatingPositions === undefined
      ? {}
      : { floatingPositions: structuredClone(document.floatingPositions) }),
    ...(document.presentation === undefined
      ? {}
      : { presentation: structuredClone(document.presentation) }),
  }
}
export function topicExtensionData(topic: Topic): Pick<Topic, 'metadata' | 'structure'> {
  return {
    ...(topic.metadata === undefined ? {} : { metadata: structuredClone(topic.metadata) }),
    ...(topic.structure === undefined ? {} : { structure: topic.structure }),
  }
}

/** Plain editing invalidates portable title markup; rich editors restore it in their own batch. */
export function withPlainTitle(topic: Topic, title: string): Topic {
  const result = { ...topic, title }
  if (title !== topic.title && result.metadata?.richTitle !== undefined) {
    const metadata = { ...result.metadata }
    delete metadata.richTitle
    if (Object.keys(metadata).length === 0) delete result.metadata
    else result.metadata = metadata
  }
  return result
}
