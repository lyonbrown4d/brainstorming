import { memo } from 'react'
import { Handle, Position, type Node, type NodeProps } from '@xyflow/react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import type { Topic } from '@core'
import { useEditor } from '../state/editor'
import { useTopicSelected } from '../state/selection'
import { CanvasTopicTitle } from './metadata/CanvasTopicTitle'
import { TopicTitleDisplay } from './metadata/TopicTitleDisplay'
import { TopicMetadataBadges } from './metadata/TopicMetadataBadges'
import { TopicImage } from './TopicImage'
import { TopicContentIndicators } from './TopicContentIndicators'
import { Button } from './ui/button'
export type TopicFlowNode = Node<
  {
    topic: Topic
    root: boolean
    branch?: boolean
    fill?: string | undefined
    color: string
    textColor?: string
    fontFamily?: string
  },
  'topic'
>

export const TopicNode = memo(function TopicNode({ data, id }: NodeProps<TopicFlowNode>) {
  const primary = useEditor((state) => state.selectedId === id)
  const selected = useTopicSelected(id)
  const dropTarget = useEditor((state) => state.dropTargetId === id)
  const editing = useEditor((state) => state.editingId === id)
  const editingSurface = useEditor((state) => state.editingSurface)
  const { topic, root, branch = false, color } = data
  const style = topic.style
  return (
    <div
      className={`topic nopan ${root ? 'topic-root' : branch ? 'topic-branch' : 'topic-leaf'} ${selected ? 'is-selected' : ''} ${editing && editingSurface === 'canvas' ? 'is-editing' : ''} ${dropTarget ? 'drop-target' : ''} side-${topic.side} ${topic.image || topic.notes || topic.attachments?.length || topic.metadata ? 'has-content flex flex-col items-center' : ''}`}
      style={
        {
          '--branch-color': color,
          '--topic-fill': data.fill,
          background: data.fill,
          color: data.textColor ?? style?.color,
          fontFamily: data.fontFamily,
          borderRadius:
            style?.shape === 'ellipse' ? '50%' : style?.shape === 'rectangle' ? 0 : undefined,
        } as React.CSSProperties
      }
      data-testid={`topic-${id}`}
    >
      {[Position.Top, Position.Right, Position.Bottom, Position.Left].map((position) => (
        <Handle
          key={`target-${position}`}
          id={`target-${position}`}
          type="target"
          position={position}
        />
      ))}
      {[Position.Top, Position.Right, Position.Bottom, Position.Left].map((position) => (
        <Handle
          key={`source-${position}`}
          id={`source-${position}`}
          type="source"
          position={position}
        />
      ))}
      {topic.image && (
        <TopicImage
          image={topic.image}
          className="topic-embedded-image mx-auto mt-3 block shrink-0 rounded-[5px] object-contain"
        />
      )}
      <div
        className={`topic-title ${topic.image || topic.notes || topic.attachments?.length || topic.metadata ? 'h-auto w-full min-h-0 flex-1' : 'h-full'}`}
        style={{
          fontSize: style?.fontSize ?? (root ? 24 : 16),
          fontWeight: (style?.bold ?? (root || branch)) ? 600 : 400,
          fontStyle: style?.italic ? 'italic' : 'normal',
        }}
        onDoubleClick={() => {
          useEditor.getState().startEdit(id)
        }}
      >
        {primary || editing ? (
          <CanvasTopicTitle topic={topic} />
        ) : (
          <TopicTitleDisplay topic={topic} />
        )}
      </div>
      <TopicMetadataBadges metadata={topic.metadata} />
      <TopicContentIndicators
        topicId={id}
        hasNotes={Boolean(topic.notes)}
        attachmentCount={topic.attachments?.length ?? 0}
      />
      {topic.children.length > 0 && (
        <Button
          variant="ghost"
          size="icon"
          type="button"
          className="fold-button nodrag"
          aria-label={`${topic.collapsed ? '展开' : '折叠'} ${topic.title}`}
          onClick={(event) => {
            event.stopPropagation()
            useEditor.getState().commitDraft()
            useEditor.getState().command({ type: 'toggleCollapse', topicId: id })
          }}
        >
          {topic.collapsed ? (
            topic.children.length
          ) : topic.side === 'left' ? (
            <ChevronLeft size={10} className="size-2.5" />
          ) : (
            <ChevronRight size={10} className="size-2.5" />
          )}
        </Button>
      )}
    </div>
  )
})
