import { create } from 'zustand'
import type { MindMapDocument } from '@core'
import type { CanvasDrop } from '@renderer/lib/canvasDrop'

export interface CanvasDragInteraction {
  readonly token: symbol
  readonly document: MindMapDocument
  readonly sheetId: string
  readonly roots: readonly string[]
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
): symbol => {
  const token = Symbol('canvas-drag')
  useCanvasInteraction.setState({ drag: { token, document, sheetId, roots, drop: null } })
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
    previous?.side === drop?.side
  )
    return
  useCanvasInteraction.setState({ drag: { ...drag, drop: drop ?? null } })
}

export const clearCanvasDrag = (token: symbol): void => {
  if (useCanvasInteraction.getState().drag?.token === token)
    useCanvasInteraction.setState({ drag: null })
}

export const canvasDragMessage = (drag: CanvasDragInteraction): string => {
  const { document, roots, drop } = drag
  if (!drop)
    return roots.every((id) => document.floatingIds?.includes(id))
      ? `移动 ${roots.length} 个游离主题`
      : '拖到主题以移动 · Esc 取消'
  const title = document.topics[drop.targetId]?.title ?? ''
  if (drop.index === undefined) return `移入「${title}」`
  // CanvasDrop indexes the remaining children after all dragged roots are removed.
  const remaining = document.topics[drop.parentId]?.children.filter((id) => !roots.includes(id))
  const targetIndex = remaining?.indexOf(drop.targetId) ?? -1
  return `插入到「${title}」${drop.index > targetIndex ? '之后' : '之前'}`
}
