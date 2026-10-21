import type { SpatialView } from '@renderer/state/spatialView'
import { topicShapeInsets } from '@shared/topic-shapes'
import { TopicShapeVisual } from '@renderer/components/TopicShapeVisual'
import { TopicNodeBody } from '@renderer/components/TopicNodeBody'
import { TopicScaleHandle } from '@renderer/components/TopicScaleHandle'
import { useTopicScalePreview } from '@renderer/state/topicScalePreview'
import { useMessages } from '@renderer/i18n/useMessages'

import { cn } from '@renderer/lib/utils'
import { memo } from 'react'
import { sameTopicNodeContent } from '@renderer/lib/topicNodeRendering'
import {
  Handle,
  Position,
  useStore as useFlowStore,
  type Node,
  type NodeProps,
} from '@xyflow/react'
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp } from 'lucide-react'
import type { SheetVisualStyle, Topic } from '@core'
import type { LayoutDirection } from '@layout'
import { useEditor } from '@renderer/state/editor'
import { useTopicSelected } from '@renderer/state/selection'
import { Button } from '@renderer/components/ui/button'
export type TopicFlowNode = Node<
  {
    topic: Topic
    visualStyle?: SheetVisualStyle
    root: boolean
    branch?: boolean
    fill?: string | undefined
    color: string
    textColor?: string
    fontFamily?: string
    direction?: LayoutDirection
    cameraScale?: number
    cameraFrame?: SpatialView
    cameraDepth?: number
    worldWidth?: number
    worldHeight?: number
  },
  'topic'
>
const TopicNodeContent = ({ data, id, width, height }: NodeProps<TopicFlowNode>) => {
  const { translate } = useMessages()

  // Pan and zoom frames only notify this node when the detail threshold changes.
  const lowZoom = useFlowStore((state) => {
    const cameraScale = state.nodeLookup.get(id)?.data.cameraScale
    return state.transform[2] * (typeof cameraScale === 'number' ? cameraScale : 1) < 0.35
  })
  const primary = useEditor((state) => state.selectedId === id)
  const selected = useTopicSelected(id)
  const dropTarget = useEditor((state) => state.dropTargetId === id)
  const editing = useEditor((state) => state.editingId === id)
  const editingHere = useEditor(
    (state) => state.editingId === id && state.editingSurface === 'canvas',
  )
  const simplified = lowZoom && !selected && !primary && !editing
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
  const previewScale = useTopicScalePreview((state) => (state.topicId === id ? state.scale : null))
  const scale = previewScale ?? style?.scale ?? 1
  // Perspective and resize previews transform a stable content box, preserving cached SVG/text.
  const baseWidth =
    data.worldWidth === undefined ? (width ?? 100) / scale : data.worldWidth / (style?.scale ?? 1)
  const baseHeight =
    data.worldHeight === undefined
      ? (height ?? 100) / scale
      : data.worldHeight / (style?.scale ?? 1)
  const shape = style?.shape ?? 'rounded'
  const insets = topicShapeInsets(shape)
  const fill =
    data.fill ?? style?.fill ?? (root ? 'var(--color-primary)' : 'var(--color-background)')
  return (
    <>
      {selected && <TopicScaleHandle id={id} topic={topic} selected />}
      <div
        className={cn(
          'topic group/topic nopan relative flex flex-col items-center rounded-lg border-[1.5px] transition-[box-shadow,border-color] duration-150 select-none',
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
            '--topic-fill': fill,
            background: 'transparent',
            borderColor: 'transparent',
            color: data.textColor ?? style?.color,
            fontFamily: data.fontFamily,
            width: baseWidth,
            height: baseHeight,
            transform: `scale(calc(var(--canvas-camera-scale, 1) * ${scale}))`,
            transformOrigin: 'top left',
            borderRadius:
              shape === 'capsule'
                ? '9999px'
                : shape === 'ellipse' || shape === 'circle'
                  ? '50%'
                  : shape === 'rectangle' || shape === 'sticky'
                    ? 0
                    : undefined,
          } as React.CSSProperties
        }
        data-appearance={shape}
        data-testid={`topic-${id}`}
      >
        <TopicShapeVisual
          shape={shape}
          visualStyle={data.visualStyle}
          sketchFill={root || branch || Boolean(style?.fill) || shape === 'sticky'}
          seedKey={id}
          width={baseWidth}
          height={baseHeight}
          stroke={root ? (data.visualStyle === 'sketch' ? (data.textColor ?? color) : fill) : color}
          className="pointer-events-none absolute inset-0 h-full w-full"
        />
        <span
          aria-hidden
          className={cn(
            'pointer-events-none absolute inset-0 rounded-[inherit] bg-current/5 outline-1 -outline-offset-1 outline-current/55 transition-opacity duration-150 ease-out motion-reduce:transition-none',
            editingHere ? 'opacity-100' : 'opacity-0',
          )}
        />
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
            className="!size-3 !border-2 !border-primary !bg-background hover:!opacity-100 group-hover/topic:!pointer-events-auto group-hover/topic:!opacity-100 group-focus-within/topic:!pointer-events-auto group-focus-within/topic:!opacity-100"
            position={position}
          />
        ))}
        <div
          className="absolute flex min-h-0 flex-col items-center"
          style={{
            top: `${insets.y * 100}%`,
            bottom: `${insets.y * 100}%`,
            left: `${insets.x * 100}%`,
            right: `${insets.x * 100}%`,
          }}
        >
          {simplified ? (
            <div
              className="flex h-full w-full items-center justify-center px-4 py-2.5 text-center leading-normal"
              style={{
                fontSize: style?.fontSize ?? (root ? 24 : 16),
                fontWeight: (style?.bold ?? (root || branch)) ? 600 : 400,
                fontStyle: style?.italic ? 'italic' : 'normal',
              }}
            >
              <span className="line-clamp-3 break-words whitespace-pre-wrap">{topic.title}</span>
            </div>
          ) : (
            <TopicNodeBody
              topic={topic}
              root={root}
              branch={branch}
              primary={primary}
              editing={editing}
            />
          )}
        </div>
        {!simplified && topic.children.length > 0 && (
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
    </>
  )
}

// React Flow updates its wrapper's projection and inherited CSS scale; content stays stable.
export const TopicNode = memo(TopicNodeContent, sameTopicNodeContent)

TopicNode.displayName = 'TopicNode'
