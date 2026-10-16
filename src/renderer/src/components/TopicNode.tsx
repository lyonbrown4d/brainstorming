import { memo, useEffect, useRef } from 'react'
import { Handle, Position, NodeToolbar, type Node, type NodeProps } from '@xyflow/react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import type { Topic } from '@core'
import { useEditor } from '../state/editor'
import { isCompositionKey } from '../state/keyboard'
import { TopicFormatting } from './TopicFormatting'
export type TopicFlowNode = Node<
  { topic: Topic; root: boolean; branch?: boolean; fill?: string | undefined; color: string },
  'topic'
>

function TopicInput({ id }: { id: string }) {
  const draft = useEditor((state) => state.draft)
  const input = useRef<HTMLTextAreaElement>(null)
  const composing = useRef(false)
  useEffect(() => {
    input.current?.focus()
    input.current?.select()
  }, [])
  return (
    <textarea
      ref={input}
      className="topic-input nodrag nowheel"
      aria-label="编辑主题标题"
      value={draft}
      rows={Math.max(1, Math.ceil(draft.length / 15))}
      onClick={(event) => {
        event.stopPropagation()
      }}
      onDoubleClick={(event) => {
        event.stopPropagation()
      }}
      onChange={(event) => {
        useEditor.getState().setDraft(event.target.value)
      }}
      onCompositionStart={() => {
        composing.current = true
      }}
      onCompositionEnd={() => {
        composing.current = false
      }}
      onBlur={() => {
        if (!composing.current) useEditor.getState().commitDraft()
      }}
      onKeyDown={(event) => {
        if ((event.metaKey || event.ctrlKey) && ['s', 'o', 'n'].includes(event.key.toLowerCase()))
          return
        event.stopPropagation()
        if (composing.current || isCompositionKey(event.nativeEvent)) return
        if (event.key === 'Escape') {
          event.preventDefault()
          useEditor.getState().cancelEdit()
        }
        if ((event.key === 'Enter' && !event.shiftKey) || event.key === 'Tab') {
          event.preventDefault()
          useEditor.getState().commitDraft()
          useEditor.getState().add(event.key === 'Tab' ? 'child' : 'sibling')
        }
      }}
      data-topic-id={id}
    />
  )
}
export const TopicNode = memo(function TopicNode({ data, id }: NodeProps<TopicFlowNode>) {
  const selected = useEditor((state) => state.selectedId === id)
  const dropTarget = useEditor((state) => state.dropTargetId === id)
  const editing = useEditor((state) => state.editingId === id)
  const inspector = useEditor((state) => state.inspectorOpen)
  const { topic, root, branch = false, color } = data
  const style = topic.style
  return (
    <div
      className={`topic ${root ? 'topic-root' : branch ? 'topic-branch' : 'topic-leaf'} ${selected ? 'is-selected' : ''} ${dropTarget ? 'drop-target' : ''} side-${topic.side}`}
      style={
        {
          '--branch-color': color,
          background: style?.fill ?? (root ? '#7666c4' : branch ? data.fill : undefined),
          color: style?.color,
          borderRadius:
            style?.shape === 'ellipse' ? '50%' : style?.shape === 'rectangle' ? 0 : undefined,
        } as React.CSSProperties
      }
      data-testid={`topic-${id}`}
    >
      <NodeToolbar
        isVisible={selected && !inspector && !editing}
        position={Position.Top}
        offset={14}
      >
        <TopicFormatting compact topicId={id} />
      </NodeToolbar>
      <Handle type="target" position={topic.side === 'left' ? Position.Right : Position.Left} />
      <div
        className="topic-title"
        style={{
          fontSize: style?.fontSize ?? (root ? 24 : 16),
          fontWeight: (style?.bold ?? (root || branch)) ? 600 : 400,
          fontStyle: style?.italic ? 'italic' : 'normal',
        }}
        onDoubleClick={() => {
          useEditor.getState().startEdit(id)
        }}
      >
        {editing ? <TopicInput id={id} /> : <span>{topic.title}</span>}
      </div>
      <Handle
        type="source"
        position={topic.side === 'left' && !root ? Position.Left : Position.Right}
      />
      {root && <Handle id="left" type="source" position={Position.Left} />}
      {topic.children.length > 0 && (
        <button
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
            <ChevronLeft size={10} />
          ) : (
            <ChevronRight size={10} />
          )}
        </button>
      )}
    </div>
  )
})
