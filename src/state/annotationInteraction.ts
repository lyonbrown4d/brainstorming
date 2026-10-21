import { translate } from '@renderer/i18n'
import { create } from 'zustand'
import { usePresentation } from '@renderer/state/presentation'
import { useEditor } from '@renderer/state/editor'
import { selectedTopicIds } from '@renderer/state/selection'
import { runAnnotationCommand } from '@renderer/components/annotations/commands'
import { isCompositionKey } from '@renderer/state/keyboard'
import { spatialFloatingCommand } from '@renderer/lib/spatialFloating'
import { getSpatialView } from '@renderer/state/spatialView'
import { summarySelectionRanges, topicParents } from '@core/summary'
import type { Command } from '@core'

export type AnnotationKind = 'relation' | 'group' | 'callout'
export interface AnnotationSelection {
  readonly kind: AnnotationKind
  readonly id: string
  readonly sheetId: string
}
export const useAnnotationInteraction = create<{
  floating: boolean
  relationMode: boolean
  fromId: string | null
  sheetId: string | null
  selected: AnnotationSelection | null
  editing: boolean
}>(() => ({
  floating: false,
  relationMode: false,
  fromId: null,
  sheetId: null,
  selected: null,
  editing: false,
}))

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
    relationMode: false,
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
    (interaction.selected || interaction.relationMode || interaction.floating)
  ) {
    event.preventDefault()
    useAnnotationInteraction.setState({
      selected: null,
      editing: false,
      fromId: null,
      relationMode: false,
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
  if (current.relationMode) {
    useAnnotationInteraction.setState({ relationMode: false, fromId: null, sheetId: null })
    return
  }
  const state = useEditor.getState()
  state.commitDraft()
  if (useEditor.getState().editingId) return
  const topicIds = selectedTopicIds(useEditor.getState())
  const [first, second] = topicIds
  if (topicIds.length === 2 && first && second) {
    connectAnnotation(first, second)
    return
  }
  useAnnotationInteraction.setState({
    relationMode: true,
    fromId: topicIds.length === 1 ? (first ?? null) : null,
    sheetId: state.activeSheetId,
    selected: null,
    editing: false,
    floating: false,
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
  useAnnotationInteraction.setState({ relationMode: false, fromId: null, sheetId: null })
  selectAnnotation('relation', id, true)
  return true
}
/** Only topic pointer selection participates; keyboard navigation and search remain independent. */
export const interactAnnotationTopic = (id: string): boolean => {
  const interaction = useAnnotationInteraction.getState()
  if (!interaction.relationMode) return false
  if (interaction.sheetId !== useEditor.getState().activeSheetId) {
    useAnnotationInteraction.setState({ relationMode: false, fromId: null, sheetId: null })
    return false
  }
  if (!interaction.fromId) {
    useAnnotationInteraction.setState({ fromId: id })
    return true
  }
  if (interaction.fromId === id) return true
  return connectAnnotation(interaction.fromId, id)
}
export const createRelationFloatingAt = (x: number, y: number): boolean => {
  const interaction = useAnnotationInteraction.getState()
  if (!interaction.relationMode) return false
  const state = useEditor.getState()
  if (interaction.sheetId !== state.activeSheetId) {
    useAnnotationInteraction.setState({ relationMode: false, fromId: null, sheetId: null })
    return false
  }
  const id = crypto.randomUUID()
  const floating = spatialFloatingCommand(
    id,
    translate('floatingTopic'),
    { x, y },
    getSpatialView(state.workbook.id, state.activeSheetId),
  )
  if (!interaction.fromId) {
    const created = runAnnotationCommand(floating)
    if (created) useAnnotationInteraction.setState({ fromId: id })
    return created
  }
  const relationId = crypto.randomUUID()
  const created = runAnnotationCommand({
    type: 'batch',
    commands: [
      floating,
      {
        type: 'upsertRelation',
        relation: {
          id: relationId,
          from: interaction.fromId,
          to: id,
          title: translate('relationship'),
          arrow: 'end',
        },
      },
    ],
  })
  if (created) selectAnnotation('relation', relationId, true)
  return created
}
export const addSelectionGroup = (kind: 'boundary' | 'summary'): void => {
  const state = useEditor.getState(),
    topicIds = selectedTopicIds(state)
  if (!topicIds.length) return
  if (kind === 'summary') {
    const document = state.history.document
    const ranges = summarySelectionRanges(document, topicIds)
    if (ranges.length === 0) return
    const parents = topicParents(document)
    const commands: Command[] = []
    let firstSummaryTopicId: string | undefined
    for (const range of ranges) {
      const first = range[0]
      if (first === undefined) continue
      const parentId = parents.get(first)
      const sourceTopic = document.topics[first]
      if (parentId === undefined || sourceTopic === undefined) continue
      const summaryTopicId = crypto.randomUUID()
      firstSummaryTopicId ??= summaryTopicId
      commands.push(
        {
          type: 'addTopic',
          parentId,
          id: summaryTopicId,
          title: translate('summary'),
          side: sourceTopic.side,
        },
        {
          type: 'upsertGroup',
          group: {
            id: crypto.randomUUID(),
            topicIds: range,
            kind: 'summary',
            summaryTopicId,
          },
        },
      )
    }
    if (commands.length > 0 && runAnnotationCommand({ type: 'batch', commands })) {
      if (firstSummaryTopicId !== undefined) useEditor.getState().startEdit(firstSummaryTopicId)
    }
    return
  }
  const id = crypto.randomUUID()
  if (
    runAnnotationCommand({
      type: 'upsertGroup',
      group: {
        id,
        topicIds,
        kind,
        title: translate('boundary'),
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
    relationMode: false,
    selected: null,
    editing: false,
  })
}
export const createFloatingAt = (x: number, y: number): boolean => {
  if (!useAnnotationInteraction.getState().floating) return false
  const id = crypto.randomUUID()
  const state = useEditor.getState()
  const view = getSpatialView(state.workbook.id, state.activeSheetId)
  if (
    runAnnotationCommand(spatialFloatingCommand(id, translate('floatingTopic'), { x, y }, view))
  ) {
    useAnnotationInteraction.setState({ floating: false })
    useEditor.getState().startEdit(id)
  }
  return true
}
