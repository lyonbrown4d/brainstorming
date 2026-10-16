import { useEditor } from '../../state/editor'
import { LabelsPanel } from './LabelsPanel'
import { LinkPanel } from './LinkPanel'
import { TaskPanel } from './TaskPanel'
import { FormulaAudioPanel } from './FormulaAudioPanel'

export function TopicMetadataPanel({ topicId }: { topicId: string }) {
  const metadata = useEditor((state) => state.history.document.topics[topicId]?.metadata)
  const value = metadata ?? {}
  return (
    <div aria-label="主题扩展信息">
      <LabelsPanel topicId={topicId} metadata={value} />
      <LinkPanel key={`link:${JSON.stringify(value.link)}`} topicId={topicId} metadata={value} />
      <TaskPanel key={`task:${JSON.stringify(value.task)}`} topicId={topicId} metadata={value} />
      <FormulaAudioPanel
        key={`formula:${value.equation ?? ''}`}
        topicId={topicId}
        metadata={value}
      />
    </div>
  )
}
