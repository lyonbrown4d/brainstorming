import { translate } from '@renderer/i18n'
import { create } from 'zustand'
import type { MindMapDocument } from '@core'
import type { CanvasDrop } from '@renderer/lib/canvasDrop'

export interface CanvasDragInteraction {
  readonly token: symbol
  readonly document: MindMapDocument
  readonly sheetId: string
  readonly roots: readonly string[]
  readonly drawingCount: number
  readonly drop: CanvasDrop | null
}

/** Pointer previews belong to the active gesture, never to a document or undo entry. */
export const useCanvasInteraction = create<{ drag: CanvasDragInteraction | null }>(() => ({
  drag: null,
}))

export const beginCanvasDrag = (
  document: MindMapDocument,
  sheetId: string,
  roots: readonly string[],
  drawingCount = 0,
): symbol => {
  const token = Symbol('canvas-drag')
  useCanvasInteraction.setState({
    drag: { token, document, sheetId, roots, drawingCount, drop: null },
  })
  return token
}

export const updateCanvasDrag = (token: symbol, drop: CanvasDrop | undefined): void => {
  const drag = useCanvasInteraction.getState().drag
  if (drag?.token !== token) return
  const previous = drag.drop
  if (
    previous?.targetId === drop?.targetId &&
    previous?.parentId === drop?.parentId &&
    previous?.index === drop?.index &&
    previous?.side === drop?.side &&
    previous?.predicted === drop?.predicted &&
    previous?.indicator?.axis === drop?.indicator?.axis &&
    previous?.indicator?.edge === drop?.indicator?.edge
  )
    return
  useCanvasInteraction.setState({ drag: { ...drag, drop: drop ?? null } })
}

export const clearCanvasDrag = (token: symbol): void => {
  if (useCanvasInteraction.getState().drag?.token === token)
    useCanvasInteraction.setState({ drag: null })
}

export const canvasDragMessage = (
  drag: CanvasDragInteraction,
  t: typeof translate = translate,
): string => {
  const { document, roots, drop, drawingCount } = drag
  if (!drop && drawingCount) return t('inkMoveSelection', { count: roots.length + drawingCount })
  if (!drop)
    return roots.every((id) => document.floatingIds?.includes(id))
      ? t('moveValue0FloatingTopics', { value0: roots.length })
      : t('dragToATopicToMoveEsc')
  const title = document.topics[drop.targetId]?.title ?? ''
  if (drop.index === undefined) return t('moveIntoValue0', { value0: title })
  // CanvasDrop indexes the remaining children after all dragged roots are removed.
  const remaining = document.topics[drop.parentId]?.children.filter((id) => !roots.includes(id))
  const targetIndex = remaining?.indexOf(drop.targetId) ?? -1
  return t('insertValue1Value0', {
    value0: title,
    value1: drop.index > targetIndex ? t('after') : t('before'),
    parent: document.topics[drop.parentId]?.title ?? '',
  })
}
