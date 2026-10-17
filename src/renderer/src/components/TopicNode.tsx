import { useMessages } from '@renderer/i18n/useMessages'

import { TopicMarkerLayout } from '@renderer/components/metadata/TopicMarkerLayout'
import { cn } from '@renderer/lib/utils'
import { memo } from 'react'
import { Handle, Position, type Node, type NodeProps } from '@xyflow/react'
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp } from 'lucide-react'
import type { Topic } from '@core'
import type { LayoutDirection } from '@layout'
import { usePresentation } from '@renderer/state/presentation'
import { useEditor } from '@renderer/state/editor'
import { useTopicSelected } from '@renderer/state/selection'
import { CanvasTopicTitle } from '@renderer/components/metadata/CanvasTopicTitle'
import { TopicTitleDisplay } from '@renderer/components/metadata/TopicTitleDisplay'
import { TopicMetadataBadges } from '@renderer/components/metadata/TopicMetadataBadges'
import { TopicImage } from '@renderer/components/TopicImage'
import { TopicContentIndicators } from '@renderer/components/TopicContentIndicators'
import { Button } from '@renderer/components/ui/button'
export type TopicFlowNode = Node<
  {
    topic: Topic
    root: boolean
    branch?: boolean
    fill?: string | undefined
    color: string
    textColor?: string
    fontFamily?: string
    direction?: LayoutDirection
  },
  'topic'
>
export const TopicNode = memo(({ data, id }: NodeProps<TopicFlowNode>) => {
  const { translate } = useMessages()

  const primary = useEditor((state) => state.selectedId === id)
  const selected = useTopicSelected(id)
  const dropTarget = useEditor((state) => state.dropTargetId === id)
  const editing = useEditor((state) => state.editingId === id)
  const editingSurface = useEditor((state) => state.editingSurface)
  const { topic, root, branch = false, color } = data
  const direction = data.direction ?? topic.side
  const side = direction === 'left' || direction === 'right' ? direction : topic.side
  const FoldIcon = { left: ChevronLeft, right: ChevronRight, up: ChevronUp, down: ChevronDown }[
    direction
  ]
  const foldPosition = {
    left: 'top-[calc(50%-9px)] -left-[11px]',
    right: 'top-[calc(50%-9px)] -right-[11px]',
    up: 'left-[calc(50%-9px)] -top-[11px]',
    down: 'left-[calc(50%-9px)] -bottom-[11px]',
  }[direction]
  const hasContent =
    Boolean(topic.image) ||
    Boolean(topic.notes) ||
    Boolean(topic.attachments?.length) ||
    Boolean(topic.metadata)
  const style = topic.style
  return (
    <div
      className={cn(
        'topic nopan relative flex h-full w-full flex-col items-center rounded-lg border-[1.5px] transition-[box-shadow,border-color] duration-150 select-none',
        root
          ? 'topic-root rounded-[14px] bg-[#8070c6] text-white'
          : branch
            ? 'topic-branch bg-[color-mix(in_srgb,var(--branch-color)_32%,#fff)] text-[#30313b]'
            : 'topic-leaf text-[#30313b]',
        selected
          ? root
            ? 'is-selected border-[#6653af] shadow-[0_0_0_3px_#9480d919]'
            : 'is-selected border-[#9480d9] shadow-[0_0_0_2px_#9480d918]'
          : 'border-transparent',
        editing && editingSurface === 'canvas' && 'is-editing',
        dropTarget &&
          'drop-target border-dashed border-[#72a98d] text-[#48775e] shadow-[0_0_0_5px_#90bba42e]',
        `side-${side}`,
        hasContent && 'has-content',
      )}
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
      <TopicMarkerLayout topicId={topic.id} metadata={topic.metadata}>
        {topic.image && (
          <TopicImage
            image={topic.image}
            className="topic-embedded-image mx-auto mt-3 block shrink-0 rounded-[5px] object-contain"
          />
        )}
        <div
          className={`topic-title flex items-center justify-center px-[17px] py-2.5 text-center leading-normal [&>span]:break-words [&>span]:whitespace-pre-wrap ${hasContent ? 'h-auto w-full min-h-0 flex-1' : 'h-full'}`}
          style={{
            fontSize: style?.fontSize ?? (root ? 24 : 16),
            fontWeight: (style?.bold ?? (root || branch)) ? 600 : 400,
            fontStyle: style?.italic ? 'italic' : 'normal',
          }}
          onDoubleClick={() => {
            if (usePresentation.getState().playing) return
            useEditor
              .getState()
              .startEdit(
                id,
                undefined,
                'canvas',
                topic.title === translate('newTopic') || topic.title === translate('floatingTopic')
                  ? 'all'
                  : 'end',
              )
          }}
        >
          {primary || editing ? (
            <CanvasTopicTitle topic={topic} />
          ) : (
            <TopicTitleDisplay topic={topic} />
          )}
        </div>
      </TopicMarkerLayout>
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
          className={`fold-button nodrag absolute z-[2] size-[18px] rounded-full border border-[#d9d3e9] bg-white p-0 text-[9px] ${root ? 'text-[#8070c6]' : 'text-[var(--branch-color)]'} ${foldPosition}`}
          aria-label={`${topic.collapsed ? translate('expand') : translate('collapse')} ${topic.title}`}
          onClick={(event) => {
            event.stopPropagation()
            useEditor.getState().commitDraft()
            useEditor.getState().command({ type: 'toggleCollapse', topicId: id })
          }}
        >
          {topic.collapsed ? topic.children.length : <FoldIcon size={10} className="size-2.5" />}
        </Button>
      )}
    </div>
  )
})

TopicNode.displayName = 'TopicNode'
