import type { TopicMetadata } from '@core'
import { useEditor } from '../../state/editor'
import { runAnnotationCommand } from '../annotations/commands'

export function setMetadataField<K extends keyof TopicMetadata>(
  topicId: string,
  key: K,
  value: TopicMetadata[K] | undefined,
): boolean {
  const state = useEditor.getState()
  if (state.busy) return false
  state.commitDraft()
  if (useEditor.getState().editingId) return false
  const topic = useEditor.getState().history.document.topics[topicId]
  if (!topic) return false
  const metadata = { ...topic.metadata }
  if (value === undefined) Reflect.deleteProperty(metadata, key)
  else metadata[key] = value
  return runAnnotationCommand({ type: 'setTopicMetadata', topicId, metadata })
}

export function toggleTopicMarker(topicId: string, marker: string): boolean {
  const current = useEditor.getState().history.document.topics[topicId]?.metadata?.markers ?? []
  if (!current.includes(marker) && (current.length >= 32 || marker.length > 64)) return false
  return setMetadataField(
    topicId,
    'markers',
    current.includes(marker) ? current.filter((value) => value !== marker) : [...current, marker],
  )
}
