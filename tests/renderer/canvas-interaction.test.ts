import { afterEach, describe, expect, it } from 'vitest'
import { applyCommand, createExampleDocument } from '@core'
import {
  beginCanvasDrag,
  canvasDragMessage,
  clearCanvasDrag,
  updateCanvasDrag,
  useCanvasInteraction,
} from '../../src/renderer/src/state/canvasInteraction'

afterEach(() => {
  useCanvasInteraction.setState({ drag: null })
})

function message() {
  const drag = useCanvasInteraction.getState().drag
  if (!drag) throw new Error('Missing drag feedback')
  return canvasDragMessage(drag)
}

describe('transient canvas drag feedback', () => {
  it('describes attaching a group without modifying its document', () => {
    const document = createExampleDocument()
    const snapshot = JSON.stringify(document)
    const token = beginCanvasDrag(document, 'sheet', ['vision-0', 'vision-1'])
    expect(message()).toBe('拖到主题以移动 · Esc 取消')
    updateCanvasDrag(token, { targetId: 'users', parentId: 'users', side: 'left' })
    expect(message()).toBe(`移入「${document.topics.users?.title}」`)
    expect(useCanvasInteraction.getState().drag?.roots).toHaveLength(2)
    expect(JSON.stringify(document)).toBe(snapshot)
    clearCanvasDrag(token)
    expect(useCanvasInteraction.getState().drag).toBeNull()
  })

  it('uses the remaining sibling order for both insertion directions', () => {
    const document = createExampleDocument()
    const token = beginCanvasDrag(document, 'sheet', ['vision-0'])
    const drop = { targetId: 'vision-1', parentId: 'vision', side: 'left' as const }
    updateCanvasDrag(token, { ...drop, index: 0 })
    expect(message()).toBe(`插入到「${document.topics['vision-1']?.title}」之前`)
    updateCanvasDrag(token, { ...drop, index: 1 })
    expect(message()).toBe(`插入到「${document.topics['vision-1']?.title}」之后`)
    updateCanvasDrag(token, undefined)
    expect(message()).toBe('拖到主题以移动 · Esc 取消')
  })

  it('only describes free movement when every selected root is floating', () => {
    const document = applyCommand(createExampleDocument(), {
      type: 'batch',
      commands: ['floating-a', 'floating-b'].map((id) => ({
        type: 'addFloatingTopic',
        id,
        title: id,
        x: 800,
        y: 500,
      })),
    })
    beginCanvasDrag(document, 'sheet', ['floating-a', 'floating-b'])
    expect(message()).toBe('移动 2 个游离主题')
    beginCanvasDrag(document, 'sheet', ['floating-a', 'vision-0'])
    expect(message()).toBe('拖到主题以移动 · Esc 取消')
  })

  it('ignores stale updates and cleanup from a previous canvas gesture', () => {
    const document = createExampleDocument()
    const old = beginCanvasDrag(document, 'old-sheet', ['vision-0'])
    const current = beginCanvasDrag(document, 'new-sheet', ['vision-1'])
    updateCanvasDrag(old, { targetId: 'users', parentId: 'users', side: 'left' })
    clearCanvasDrag(old)
    expect(useCanvasInteraction.getState().drag).toMatchObject({
      token: current,
      sheetId: 'new-sheet',
      roots: ['vision-1'],
      drop: null,
    })
    clearCanvasDrag(current)
    expect(useCanvasInteraction.getState().drag).toBeNull()
  })
})
