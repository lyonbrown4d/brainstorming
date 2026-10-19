import { useMessages } from '@renderer/i18n/useMessages'

import { useEffect, useRef } from 'react'
import { useEditor } from '@renderer/state/editor'
import {
  selectAnnotation,
  useAnnotationInteraction,
  type AnnotationKind,
} from '@renderer/state/annotationInteraction'
import { AnnotationLabelInput } from '@renderer/components/annotations/AnnotationLabelInput'
import { runAnnotationCommand } from '@renderer/components/annotations/commands'

export const InlineAnnotationLabel = ({
  kind,
  id,
  text,
  color,
}: {
  kind: AnnotationKind
  id: string
  text: string
  color?: string | undefined
}) => {
  const { translate } = useMessages()

  const sheetId = useEditor((state) => state.activeSheetId)
  const selected = useAnnotationInteraction(
    (state) =>
      state.selected?.kind === kind &&
      state.selected.id === id &&
      state.selected.sheetId === sheetId,
  )
  const editing = useAnnotationInteraction(
    (state) =>
      state.selected?.kind === kind &&
      state.selected.id === id &&
      state.selected.sheetId === sheetId &&
      state.editing,
  )
  const finished = useRef(false)
  useEffect(() => {
    if (editing) finished.current = false
  }, [editing])
  const start = (): void => {
    selectAnnotation(kind, id, true)
  }
  const commit = (draft: string): void => {
    const state = useEditor.getState()
    const selection = useAnnotationInteraction.getState()
    if (
      finished.current ||
      !selection.editing ||
      selection.selected?.id !== id ||
      selection.selected.kind !== kind ||
      state.activeSheetId !== sheetId
    )
      return
    finished.current = true
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
          callout: { ...callout, text: draft.trim() || translate('callout') },
        })
    }
    if (success) useAnnotationInteraction.setState({ editing: false })
    else finished.current = false
  }
  if (editing) {
    return (
      <AnnotationLabelInput
        kind={kind}
        text={text}
        onCommit={commit}
        onCancel={() => {
          finished.current = true
          useAnnotationInteraction.setState({ editing: false })
        }}
      />
    )
  }
  return (
    <button
      type="button"
      className={`nodrag nopan pointer-events-auto block max-w-60 rounded border bg-background/95 px-2 py-1 text-left text-xs whitespace-pre-wrap shadow-sm ${selected ? 'border-primary ring-1 ring-primary' : 'border-transparent'}`}
      style={{ color }}
      aria-label={`${kind === 'relation' ? translate('relationship') : kind === 'group' ? translate('group') : translate('callout')}：${text || translate('untitled')}`}
      title={translate('doubleclickToEdit')}
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
      {text || translate('untitled')}
    </button>
  )
}
