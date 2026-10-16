import { useEffect, useRef, useState } from 'react'
import { useEditor } from '../../state/editor'
import {
  selectAnnotation,
  useAnnotationInteraction,
  type AnnotationKind,
} from '../../state/annotationInteraction'
import { isCompositionKey } from '../../state/keyboard'
import { Input } from '../ui/input'
import { Textarea } from '../ui/textarea'
import { runAnnotationCommand } from './commands'

export function InlineAnnotationLabel({
  kind,
  id,
  text,
  color,
}: {
  kind: AnnotationKind
  id: string
  text: string
  color?: string | undefined
}) {
  const sheetId = useEditor((state) => state.activeSheetId)
  const selected = useAnnotationInteraction(
    (state) => state.selected?.id === id && state.selected.sheetId === sheetId,
  )
  const editing = useAnnotationInteraction(
    (state) => state.selected?.id === id && state.selected.sheetId === sheetId && state.editing,
  )
  const [draft, setDraft] = useState(text)
  const input = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null)
  useEffect(() => {
    if (editing) {
      input.current?.focus()
      input.current?.select()
    }
  }, [editing])
  const start = (): void => {
    setDraft(text)
    selectAnnotation(kind, id, true)
  }
  const commit = (): void => {
    const state = useEditor.getState()
    if (!editing || state.activeSheetId !== sheetId) return
    const document = state.history.document
    let success = false
    if (kind === 'relation') {
      const relation = document.relations?.find((item) => item.id === id)
      if (relation)
        success = runAnnotationCommand({
          type: 'upsertRelation',
          relation: { ...relation, title: draft },
        })
    } else if (kind === 'group') {
      const group = document.groups?.find((item) => item.id === id)
      if (group)
        success = runAnnotationCommand({ type: 'upsertGroup', group: { ...group, title: draft } })
    } else {
      const callout = document.callouts?.find((item) => item.id === id)
      if (callout)
        success = runAnnotationCommand({
          type: 'upsertCallout',
          callout: { ...callout, text: draft.trim() || '标注' },
        })
    }
    if (success) useAnnotationInteraction.setState({ editing: false })
  }
  if (editing) {
    const Control = kind === 'callout' ? Textarea : Input
    return (
      <Control
        ref={(element: HTMLInputElement | HTMLTextAreaElement | null) => {
          input.current = element
        }}
        className="nodrag nopan nowheel pointer-events-auto min-h-8 w-48 bg-background text-xs"
        aria-label={
          kind === 'relation'
            ? '编辑关联线名称'
            : kind === 'group'
              ? '编辑分组名称'
              : '编辑标注文字'
        }
        value={draft}
        maxLength={10000}
        onChange={(event) => {
          setDraft(event.target.value)
        }}
        onPointerDown={(event) => {
          event.stopPropagation()
        }}
        onBlur={commit}
        onKeyDown={(event) => {
          if (isCompositionKey(event.nativeEvent)) return
          if (event.key === 'Escape') {
            event.preventDefault()
            event.stopPropagation()
            useAnnotationInteraction.setState({ editing: false })
            return
          }
          if (event.key === 'Enter' && (kind !== 'callout' || event.ctrlKey || event.metaKey)) {
            event.preventDefault()
            event.stopPropagation()
            commit()
          }
        }}
      />
    )
  }
  return (
    <button
      type="button"
      className={`nodrag nopan pointer-events-auto block max-w-60 rounded border bg-background/95 px-2 py-1 text-left text-xs whitespace-pre-wrap shadow-sm ${selected ? 'border-primary ring-1 ring-primary' : 'border-transparent'}`}
      style={{ color }}
      aria-label={`${kind === 'relation' ? '关联线' : kind === 'group' ? '分组' : '标注'}：${text || '未命名'}`}
      title="双击原位编辑"
      onPointerDown={(event) => {
        event.stopPropagation()
      }}
      onClick={(event) => {
        event.stopPropagation()
        selectAnnotation(kind, id)
      }}
      onDoubleClick={(event) => {
        event.stopPropagation()
        start()
      }}
    >
      {text || '未命名'}
    </button>
  )
}
