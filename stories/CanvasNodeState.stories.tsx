import type { Meta, StoryObj } from '@storybook/react-vite'
import { createRef, useImperativeHandle, useState, type RefObject } from 'react'
import { flushSync } from 'react-dom'
import { expect, spyOn } from 'storybook/test'
import { useCanvasNodeState } from '@renderer/hooks/useCanvasNodeState'
import type { CanvasFlowNode } from '@renderer/lib/canvasNodes'
import { useEditor } from '@renderer/state/editor'
import { useSelection } from '@renderer/state/selection'
import { usePresentation } from '@renderer/state/presentation'

const topic = (id: string, x = 0): Extract<CanvasFlowNode, { type: 'topic' }> => ({
  id,
  type: 'topic',
  position: { x, y: 0 },
  style: { width: 100, height: 40 },
  measured: { width: 100, height: 40 },
  selected: false,
  draggable: true,
  data: {
    topic: { id, title: id, children: [], collapsed: false, side: 'right' },
    root: false,
    branch: true,
    visualStyle: 'normal',
    fill: '#ffffff',
    color: '#000000',
    textColor: '#000000',
    fontFamily: 'sans-serif',
  },
})
interface Frame {
  projected: CanvasFlowNode[]
  scope: string
  dragging: ReadonlySet<string> | undefined
}
type Controls = ReturnType<typeof useCanvasNodeState> & {
  frame: (patch?: Partial<Frame>) => void
}
const control = createRef<Controls>()
const read = () => {
  if (!control.current) throw new Error('Canvas node probe is not mounted')
  return control.current
}
const changeSelection = (topics: readonly string[]) => {
  const sheet = useEditor.getState().activeSheetId
  flushSync(() => {
    useSelection.setState({ sheets: { [sheet]: topics } })
  })
}
const Probe = ({ control }: { control: RefObject<Controls | null> }) => {
  const [frame, setFrame] = useState<Frame>(() => ({
    projected: [topic('root'), topic('other', 150)],
    scope: 'first-sheet',
    dragging: undefined,
  }))
  const [revision, setRevision] = useState(0)
  const state = useCanvasNodeState(frame.projected, frame.scope, frame.dragging)
  useImperativeHandle(control, () => ({
    ...state,
    frame: (patch) => {
      flushSync(() => {
        if (patch) setFrame((previous) => ({ ...previous, ...patch }))
        setRevision((previous) => previous + 1)
      })
    },
  }))
  return <output aria-label="画布节点状态">{`${revision}: ${state.nodes.length}`}</output>
}
const meta = {
  title: 'Brainstorming/画布节点状态',
  component: Probe,
  args: { control },
  beforeEach: () => {
    useEditor.setState({ selectedId: 'root' })
    useSelection.setState({ sheets: {}, drawings: {} })
    usePresentation.setState({ playing: false })
  },
} satisfies Meta<typeof Probe>
export default meta
type Story = StoryObj<typeof meta>

export const RepeatedExternalFrames: Story = {
  play: async () => {
    const projected = Array.from({ length: 512 }, (_, index) => topic(`node-${index}`, index))
    const scans = spyOn(projected, 'map')
    try {
      read().frame({ projected })
      const callbacks = read()
      changeSelection(['node-0'])
      const selected = read().nodes
      await expect(selected[0]?.selected).toBe(true)
      scans.mockClear()
      // Refresh pointer inputs so the compiler cannot skip the hook at its caller.
      for (let index = 0; index < 20; index++) read().frame({ dragging: new Set() })
      await expect(scans).not.toHaveBeenCalled()
      await expect(read().nodes).toBe(selected)
      await expect(read().nodes[1]).toBe(selected[1])
      await expect(read().setNodes === callbacks.setNodes).toBe(true)
      await expect(read().onNodesChange === callbacks.onNodesChange).toBe(true)
      changeSelection(['node-1'])
      await expect(scans).toHaveBeenCalledTimes(1)
      await expect(read().nodes[0]?.selected).toBe(false)
      await expect(read().nodes[1]?.selected).toBe(true)
      await expect(read().nodes[2]).toBe(selected[2])
      const settled = read().nodes
      scans.mockClear()
      for (let index = 0; index < 20; index++) read().frame({ dragging: new Set() })
      await expect(scans).not.toHaveBeenCalled()
      await expect(read().nodes).toBe(settled)
    } finally {
      scans.mockRestore()
    }
  },
}

export const PointerAndCameraFrames: Story = {
  play: async () => {
    const original = read().nodes
    const setters = read()
    // RF's marquee preview is independent of the committed selection until selection end.
    flushSync(() => {
      setters.onNodesChange([{ id: 'other', type: 'select', selected: true }])
    })
    read().frame()
    await expect(read().nodes[1]?.selected).toBe(true)
    changeSelection(['root'])
    await expect(read().nodes[1]?.selected).toBe(false)
    read().frame({ dragging: new Set(['root']) })
    flushSync(() => {
      setters.onNodesChange([{ id: 'root', type: 'position', position: { x: 180, y: 50 } }])
    })
    const beforeCamera = read().nodes
    const root = topic('root', 40)
    const camera = [
      {
        ...root,
        style: { width: 120, height: 48 },
        measured: { width: 120, height: 48 },
        data: { ...root.data, cameraScale: 1.2, worldWidth: 100, worldHeight: 40 },
      },
      topic('other', 210),
    ]
    read().frame({ projected: camera })
    await expect(read().nodes[0]?.position).toEqual({ x: 180, y: 50 })
    await expect(read().nodes[0]?.measured).toBe(camera[0]?.measured)
    await expect(read().nodes[1]?.position.x).toBe(210)
    await expect(read().nodes[0]?.data.cameraScale).toBe(1.2)
    // Releasing and changing selection cannot rewind the final pointer position.
    read().frame({ dragging: undefined })
    changeSelection(['other'])
    await expect(read().nodes[0]?.position).toEqual({ x: 180, y: 50 })
    await expect(read().nodes[0]?.selected).toBe(false)
    await expect(read().nodes[0]?.measured).toBe(camera[0]?.measured)
    await expect(read().nodes[1]?.selected).toBe(true)
    // A cancellation callback retained before camera updates sees the latest frame and queue.
    let cancellationInput: CanvasFlowNode[] | undefined
    flushSync(() => {
      setters.setNodes((current) => current.map((node) => ({ ...node, dragging: false })))
      setters.setNodes((current) => {
        cancellationInput = current
        return current.map((node, index) => ({
          ...node,
          position: camera[index]?.position ?? node.position,
        }))
      })
    })
    await expect(cancellationInput?.[0]?.dragging).toBe(false)
    await expect(cancellationInput?.[0]?.measured).toBe(camera[0]?.measured)
    await expect(cancellationInput?.[0]?.selected).toBe(false)
    await expect(read().nodes[0]?.position).toEqual({ x: 40, y: 0 })
    await expect(read().setNodes === setters.setNodes).toBe(true)
    await expect(read().nodes[0]).not.toBe(beforeCamera[0])
    await expect(read().nodes[0]?.data).toBe(camera[0]?.data)
    // Reusing IDs in another scope must discard the old gesture and measurements.
    read().frame({ projected: original, scope: 'second-sheet', dragging: new Set(['root']) })
    await expect(read().nodes[0]?.position).toEqual({ x: 0, y: 0 })
    await expect(read().nodes[0]?.measured).toBe(original[0]?.measured)
    await expect(read().nodes[1]?.selected).toBe(true)
  },
}
