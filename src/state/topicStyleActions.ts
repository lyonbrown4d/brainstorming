import { create } from 'zustand'
import type { MindMapDocument, TopicStyle } from '@core'
import { getSubtreeIds } from '@core/tree'
import { useEditor } from '@renderer/state/editor'
import { selectedTopicIds, useSelection } from '@renderer/state/selection'
import { flushNativeEditor, hasPendingNativeEditor } from '@renderer/state/nativeEditorQueue'
import { defaultTopicStyle } from '@renderer/lib/topicAppearance'
import { runAnnotationCommand } from '@renderer/components/annotations/commands'

export const useCopiedTopicStyle = create<{ style: TopicStyle | null }>(() => ({ style: null }))
export type TopicStyleScope = 'selection' | 'level' | 'descendants'

/** Position and spatial depth belong to each target, never to the style clipboard. */
const visualStyle = (document: MindMapDocument, id: string): TopicStyle => {
  const style = { ...document.topics[id]?.style }
  delete style.offsetX
  delete style.offsetY
  delete style.spatialDepth
  return {
    italic: false,
    shape: 'rounded',
    lineStyle: 'curve',
    ...defaultTopicStyle(document, id),
    ...style,
  }
}

export const topicStyleTargets = (
  document: MindMapDocument,
  sourceId: string,
  scope: Exclude<TopicStyleScope, 'selection'>,
): readonly string[] => {
  if (!document.topics[sourceId]) return []
  if (scope === 'descendants') return getSubtreeIds(document, sourceId).slice(1)
  const pending = [document.rootId, ...(document.floatingIds ?? [])].map((id) => ({ id, depth: 0 }))
  const depths = new Map<string, number>()
  for (const entry of pending) {
    if (depths.has(entry.id)) continue
    depths.set(entry.id, entry.depth)
    for (const id of document.topics[entry.id]?.children ?? [])
      pending.push({ id, depth: entry.depth + 1 })
  }
  return [...depths].flatMap(([id, depth]) =>
    id !== sourceId && depth === depths.get(sourceId) ? [id] : [],
  )
}

interface StyleActionTarget {
  readonly workbookId: string
  readonly sheetId: string
  readonly sourceId: string
  readonly ids: readonly string[]
  readonly valid: () => boolean
  readonly dispose: () => void
}

const captureTarget = (scope?: TopicStyleScope): StyleActionTarget => {
  const editor = useEditor.getState()
  const workbookId = editor.workbook.id
  const sheetId = editor.activeSheetId
  const sourceId = editor.selectedId
  const selection = [...selectedTopicIds(editor)]
  const ids =
    !scope || scope === 'selection'
      ? selection
      : topicStyleTargets(editor.history.document, sourceId, scope)
  let stale = false
  const check = (): void => {
    const current = useEditor.getState()
    if (
      current.workbook.id !== workbookId ||
      current.activeSheetId !== sheetId ||
      (scope &&
        (current.selectedId !== sourceId ||
          JSON.stringify(selectedTopicIds(current)) !== JSON.stringify(selection)))
    )
      stale = true
  }
  const stopEditor = useEditor.subscribe(check)
  const stopSelection = useSelection.subscribe(check)
  return {
    workbookId,
    sheetId,
    sourceId,
    ids,
    valid: () => !stale,
    dispose: () => {
      stopEditor()
      stopSelection()
    },
  }
}

const reportFailure = (target: StyleActionTarget, error: unknown): void => {
  if (target.valid())
    useEditor.getState().setError(error instanceof Error ? error.message : String(error))
}

let copySequence = 0
let pendingCopy: Promise<TopicStyle | null> | null = null

export const copyTopicStyle = (): void => {
  const editor = useEditor.getState()
  if (editor.busy) return
  editor.commitDraft()
  if (useEditor.getState().editingId) return
  const target = captureTarget()
  const sequence = ++copySequence
  const copy = (): TopicStyle | null => {
    const current = useEditor.getState()
    if (
      !target.valid() ||
      sequence !== copySequence ||
      current.busy ||
      !current.history.document.topics[target.sourceId]
    )
      return null
    const style = visualStyle(current.history.document, target.sourceId)
    useCopiedTopicStyle.setState({ style })
    return style
  }
  if (!hasPendingNativeEditor(target.workbookId)) {
    pendingCopy = null
    copy()
    target.dispose()
    return
  }
  const pending = flushNativeEditor(target.workbookId)
    .then(copy)
    .catch((error: unknown) => {
      reportFailure(target, error)
      return null
    })
    .finally(() => {
      target.dispose()
      if (pendingCopy === pending) pendingCopy = null
    })
  pendingCopy = pending
}

const applyStyle = (target: StyleActionTarget, style: TopicStyle | null): boolean => {
  const current = useEditor.getState()
  if (
    !style ||
    !target.valid() ||
    current.busy ||
    current.editingId ||
    !current.history.document.topics[target.sourceId]
  )
    return false
  const document = current.history.document
  const commands = target.ids.flatMap((topicId) => {
    const topic = document.topics[topicId]
    if (!topic) return []
    const { offsetX, offsetY, spatialDepth } = topic.style ?? {}
    return [
      {
        type: 'setTopicStyle' as const,
        topicId,
        style: {
          ...style,
          ...(offsetX === undefined ? {} : { offsetX }),
          ...(offsetY === undefined ? {} : { offsetY }),
          ...(spatialDepth === undefined ? {} : { spatialDepth }),
        },
      },
    ]
  })
  return commands.length > 0 && runAnnotationCommand({ type: 'batch', commands })
}

/** A queued native action returns acceptance immediately, matching editor.command. */
export const applyTopicStyle = (scope: TopicStyleScope): boolean => {
  const editor = useEditor.getState()
  if (editor.busy) return false
  editor.commitDraft()
  if (useEditor.getState().editingId) return false
  const target = captureTarget(scope)
  const copying = scope === 'selection' ? pendingCopy : null
  const clipboard = useCopiedTopicStyle.getState().style
  const readStyle = (): TopicStyle | null =>
    scope === 'selection'
      ? clipboard
      : visualStyle(useEditor.getState().history.document, target.sourceId)
  if (!target.ids.length || (scope === 'selection' && !copying && !clipboard)) {
    target.dispose()
    return false
  }
  if (!copying && !hasPendingNativeEditor(target.workbookId)) {
    try {
      return applyStyle(target, readStyle())
    } finally {
      target.dispose()
    }
  }
  void (async () => {
    try {
      const copied = copying ? await copying : null
      await flushNativeEditor(target.workbookId)
      if (target.valid()) applyStyle(target, copying ? copied : readStyle())
    } catch (error) {
      reportFailure(target, error)
    } finally {
      target.dispose()
    }
  })()
  return true
}
