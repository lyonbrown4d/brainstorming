import { useMessages } from '@renderer/i18n/useMessages'

import { TopicMarkerLayout } from '@renderer/components/metadata/TopicMarkerLayout'
import { cn } from '@renderer/lib/utils'
import { memo } from 'react'
import { shallow } from 'zustand/shallow'
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
const TopicNodeContent = ({ data, id }: NodeProps<TopicFlowNode>) => {
  const { translate } = useMessages()

  const primary = useEditor((state) => state.selectedId === id)
  const selected = useTopicSelected(id)
  const dropTarget = useEditor((state) => state.dropTargetId === id)
  const editing = useEditor((state) => state.editingId === id)
  const editingHere = useEditor(
    (state) => state.editingId === id && state.editingSurface === 'canvas',
  )
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
          ? 'topic-root rounded-xl bg-primary text-primary-foreground'
          : branch
            ? 'topic-branch'
            : 'topic-leaf',
        selected
          ? 'is-selected border-primary ring-2 ring-primary/15'
          : root || branch
            ? 'border-transparent'
            : 'border-[color-mix(in_srgb,var(--branch-color)_28%,transparent)]',
        editingHere && 'is-editing',
        dropTarget && 'drop-target border-dashed border-drop-target ring-4 ring-drop-target/15',
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
          className={`fold-button nodrag absolute z-[2] size-[18px] rounded-full border border-border bg-background p-0 text-[9px] ${root ? 'text-primary' : 'text-[var(--branch-color)]'} ${foldPosition}`}
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
}

// React Flow owns positioning; this content only consumes identity and node data.
export const TopicNode = memo(
  TopicNodeContent,
  (previous, next) => previous.id === next.id && shallow(previous.data, next.data),
)

TopicNode.displayName = 'TopicNode'
