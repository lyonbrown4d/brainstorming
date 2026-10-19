import { translate } from '@renderer/i18n'
import { create } from 'zustand'
import { usePresentation } from '@renderer/state/presentation'
import { useEditor } from '@renderer/state/editor'
import { selectedTopicIds } from '@renderer/state/selection'
import { runAnnotationCommand } from '@renderer/components/annotations/commands'
import { isCompositionKey } from '@renderer/state/keyboard'

export type AnnotationKind = 'relation' | 'group' | 'callout'
export interface AnnotationSelection {
  readonly kind: AnnotationKind
  readonly id: string
  readonly sheetId: string
}
export const useAnnotationInteraction = create<{
  floating: boolean
  fromId: string | null
  sheetId: string | null
  selected: AnnotationSelection | null
  editing: boolean
}>(() => ({ floating: false, fromId: null, sheetId: null, selected: null, editing: false }))

export const selectAnnotation = (kind: AnnotationKind, id: string, editing = false): void => {
  if (usePresentation.getState().playing) return
  useEditor.getState().commitDraft()
  if (useEditor.getState().editingId) return
  if (typeof window !== 'undefined') {
    const active = window.document.activeElement
    if (active instanceof HTMLElement && active.closest('.topic-input')) active.blur()
  }
  if (useEditor.getState().inspectorOpen) useEditor.setState({ inspectorMode: 'topic' })
  useAnnotationInteraction.setState({
    selected: { kind, id, sheetId: useEditor.getState().activeSheetId },
    editing,
    fromId: null,
    floating: false,
  })
}

export const handleAnnotationKey = (event: KeyboardEvent): boolean => {
  if (event.defaultPrevented || isCompositionKey(event)) return false
  const target = event.target
  if (
    target instanceof HTMLElement &&
    (target.isContentEditable || target.closest('input, textarea, select'))
  )
    return false
  const interaction = useAnnotationInteraction.getState()
  if (
    event.key === 'Escape' &&
    (interaction.selected || interaction.fromId || interaction.floating)
  ) {
    event.preventDefault()
    useAnnotationInteraction.setState({
      selected: null,
      editing: false,
      fromId: null,
      sheetId: null,
      floating: false,
    })
    return true
  }
  const selected = interaction.selected
  if (selected?.sheetId !== useEditor.getState().activeSheetId) return false
  if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return false
  if ([' ', 'F2', 'Enter'].includes(event.key)) {
    event.preventDefault()
    useAnnotationInteraction.setState({ editing: true })
    return true
  }
  if (event.key !== 'Delete' && event.key !== 'Backspace') return false
  event.preventDefault()
  const success = runAnnotationCommand(
    selected.kind === 'relation'
      ? { type: 'removeRelation', relationId: selected.id }
      : selected.kind === 'group'
        ? { type: 'removeGroup', groupId: selected.id }
        : { type: 'removeCallout', calloutId: selected.id },
  )
  if (success) useAnnotationInteraction.setState({ selected: null, editing: false })
  return true
}
export const toggleRelationMode = (): void => {
  const current = useAnnotationInteraction.getState()
  if (current.fromId) {
    useAnnotationInteraction.setState({ fromId: null, sheetId: null })
    return
  }
  const state = useEditor.getState()
  state.commitDraft()
  if (useEditor.getState().editingId) return
  useAnnotationInteraction.setState({
    fromId: state.selectedId,
    sheetId: state.activeSheetId,
    selected: null,
    editing: false,
  })
}
export const connectAnnotation = (from: string, to: string): boolean => {
  if (from === to) return false
  const id = crypto.randomUUID()
  if (
    !runAnnotationCommand({
      type: 'upsertRelation',
      relation: { id, from, to, title: translate('relationship'), arrow: 'end' },
    })
  )
    return false
  useAnnotationInteraction.setState({ fromId: null, sheetId: null })
  selectAnnotation('relation', id, true)
  return true
}
/** Only topic pointer selection participates; keyboard navigation and search remain independent. */
export const interactAnnotationTopic = (id: string): boolean => {
  const interaction = useAnnotationInteraction.getState()
  if (!interaction.fromId) return false
  if (interaction.sheetId !== useEditor.getState().activeSheetId) {
    useAnnotationInteraction.setState({ fromId: null, sheetId: null })
    return false
  }
  connectAnnotation(interaction.fromId, id)
  return true
}
export const addSelectionGroup = (kind: 'boundary' | 'summary'): void => {
  const state = useEditor.getState(),
    topicIds = selectedTopicIds(state)
  if (!topicIds.length) return
  const id = crypto.randomUUID()
  if (
    runAnnotationCommand({
      type: 'upsertGroup',
      group: {
        id,
        topicIds,
        kind,
        title: kind === 'boundary' ? translate('boundary') : translate('summary'),
      },
    })
  )
    selectAnnotation('group', id, true)
}
export const addSelectionCallout = (): void => {
  const id = crypto.randomUUID()
  if (
    runAnnotationCommand({
      type: 'upsertCallout',
      callout: { id, topicId: useEditor.getState().selectedId, text: translate('callout') },
    })
  )
    selectAnnotation('callout', id, true)
}

export const armFloatingTopic = (): void => {
  const state = useEditor.getState()
  state.commitDraft()
  if (useEditor.getState().editingId) return
  useAnnotationInteraction.setState({
    floating: !useAnnotationInteraction.getState().floating,
    sheetId: state.activeSheetId,
    fromId: null,
    selected: null,
    editing: false,
  })
}
export const createFloatingAt = (x: number, y: number): boolean => {
  if (!useAnnotationInteraction.getState().floating) return false
  const id = crypto.randomUUID()
  if (
    runAnnotationCommand({ type: 'addFloatingTopic', id, title: translate('floatingTopic'), x, y })
  ) {
    useAnnotationInteraction.setState({ floating: false })
    useEditor.getState().startEdit(id)
  }
  return true
}
