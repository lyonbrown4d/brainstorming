import { create } from 'zustand'

interface TopicScalePreview {
  topicId: string | null
  scale: number | null
  show: (topicId: string, scale: number) => void
  clear: (topicId: string) => void
}

/** A single active gesture changes only its topic's render scale. */
export const useTopicScalePreview = create<TopicScalePreview>((set) => ({
  topicId: null,
  scale: null,
  show: (topicId, scale) => {
    set({ topicId, scale })
  },
  clear: (topicId) => {
    set((state) => (state.topicId === topicId ? { topicId: null, scale: null } : state))
  },
}))
