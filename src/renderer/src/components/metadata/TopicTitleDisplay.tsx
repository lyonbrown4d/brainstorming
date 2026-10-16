import { lazy, Suspense } from 'react'
import type { Topic } from '@core'

const RichTitleDisplay = lazy(() => import('./RichTitleDisplay'))
export function TopicTitleDisplay({ topic }: { topic: Topic }) {
  return topic.metadata?.richTitle ? (
    <Suspense fallback={<span>{topic.title}</span>}>
      <RichTitleDisplay source={topic.metadata.richTitle} />
    </Suspense>
  ) : (
    <span>{topic.title}</span>
  )
}
