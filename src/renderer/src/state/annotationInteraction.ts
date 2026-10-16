import { create } from 'zustand'
import { useEditor } from './editor'
import { selectedTopicIds } from './selection'
import { runAnnotationCommand } from '../components/annotations/commands'

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

export function selectAnnotation(kind: AnnotationKind, id: string, editing = false): void {
  useAnnotationInteraction.setState({
    selected: { kind, id, sheetId: useEditor.getState().activeSheetId },
    editing,
  })
}
export function toggleRelationMode(): void {
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
export function connectAnnotation(from: string, to: string): boolean {
  if (from === to) return false
  const id = crypto.randomUUID()
  if (
    !runAnnotationCommand({
      type: 'upsertRelation',
      relation: { id, from, to, title: '关联线', arrow: 'end' },
    })
  )
    return false
  useAnnotationInteraction.setState({ fromId: null, sheetId: null })
  selectAnnotation('relation', id, true)
  return true
}
/** Only topic pointer selection participates; keyboard navigation and search remain independent. */
export function interactAnnotationTopic(id: string): boolean {
  const interaction = useAnnotationInteraction.getState()
  if (!interaction.fromId) return false
  if (interaction.sheetId !== useEditor.getState().activeSheetId) {
    useAnnotationInteraction.setState({ fromId: null, sheetId: null })
    return false
  }
  connectAnnotation(interaction.fromId, id)
  return true
}
export function addSelectionGroup(kind: 'boundary' | 'summary'): void {
  const state = useEditor.getState(),
    topicIds = selectedTopicIds(state)
  if (!topicIds.length) return
  const id = crypto.randomUUID()
  if (
    runAnnotationCommand({
      type: 'upsertGroup',
      group: { id, topicIds, kind, title: kind === 'boundary' ? '边界' : '概要' },
    })
  )
    selectAnnotation('group', id, true)
}
export function addSelectionCallout(): void {
  const id = crypto.randomUUID()
  if (
    runAnnotationCommand({
      type: 'upsertCallout',
      callout: { id, topicId: useEditor.getState().selectedId, text: '标注' },
    })
  )
    selectAnnotation('callout', id, true)
}

export function armFloatingTopic(): void {
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
export function createFloatingAt(x: number, y: number): boolean {
  if (!useAnnotationInteraction.getState().floating) return false
  const id = crypto.randomUUID()
  if (runAnnotationCommand({ type: 'addFloatingTopic', id, title: '游离主题', x, y })) {
    useAnnotationInteraction.setState({ floating: false })
    useEditor.getState().startEdit(id)
  }
  return true
}
