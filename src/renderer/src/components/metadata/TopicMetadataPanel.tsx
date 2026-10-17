import { useEditor } from '@renderer/state/editor'
import { LabelsPanel } from '@renderer/components/metadata/LabelsPanel'
import { LinkPanel } from '@renderer/components/metadata/LinkPanel'
import { TaskPanel } from '@renderer/components/metadata/TaskPanel'
import { FormulaAudioPanel } from '@renderer/components/metadata/FormulaAudioPanel'

export const TopicMetadataPanel = ({ topicId }: { topicId: string }) => {
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
