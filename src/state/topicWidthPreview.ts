import { create } from 'zustand'
import type { Topic } from '@core'

export interface TopicWidthPreview {
  readonly topic: Topic
  readonly width: number
  readonly height: number
  readonly fixedEdge: 'left' | 'right'
}
export const useTopicWidthPreview = create<{
  preview: TopicWidthPreview | null
}>(() => ({ preview: null }))
