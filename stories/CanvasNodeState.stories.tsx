import type { Meta, StoryObj } from '@storybook/react-vite'
import {
  createRef,
  StrictMode,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
} from 'react'
import { flushSync } from 'react-dom'
import { createRoot } from 'react-dom/client'
import { ReactFlow, ReactFlowProvider, useStoreApi } from '@xyflow/react'
import { expect, waitFor } from 'storybook/test'
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
  getFlowNodes: () => CanvasFlowNode[]
  commits: () => number
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
  const flow = useStoreApi<CanvasFlowNode>()
  const [frame, setFrame] = useState<Frame>(() => ({
    projected: [topic('root'), topic('other', 150)],
    scope: 'first-sheet',
    dragging: undefined,
  }))
  const [revision, setRevision] = useState(0)
  const commits = useRef(0)
  useLayoutEffect(() => {
    commits.current++
  })
  const state = useCanvasNodeState(frame.projected, frame.scope, frame.dragging)
  useImperativeHandle(control, () => ({
    ...state,
    getFlowNodes: () => flow.getState().nodes,
    commits: () => commits.current,
    frame: (patch) => {
      flushSync(() => {
        if (patch) setFrame((previous) => ({ ...previous, ...patch }))
        setRevision((previous) => previous + 1)
      })
    },
  }))
  return <output aria-label="画布节点状态">{`${revision}`}</output>
}
const meta = {
  title: 'Brainstorming/画布节点状态',
  component: Probe,
  args: { control },
  decorators: [
    (Story) => (
      <ReactFlowProvider>
        <Story />
      </ReactFlowProvider>
    ),
  ],
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
    read().frame({ projected })
    await expect(read().getFlowNodes()).toBe(read().getNodes())
    const callbacks = read()
    const beforeSelection = read().commits()
    changeSelection(['node-0'])
    const selected = read().getNodes()
    await expect(read().commits()).toBe(beforeSelection)
    await expect(selected[0]?.selected).toBe(true)
    flushSync(() => {
      useEditor.setState({ selectedId: 'node-0' })
    })
    await expect(read().getNodes()).toBe(selected)
    await expect(read().commits()).toBe(beforeSelection)
    // Refresh pointer inputs so the compiler cannot skip the hook at its caller.
    for (let index = 0; index < 20; index++) read().frame({ dragging: new Set() })
    await expect(read().getNodes()).toBe(selected)
    await expect(read().getFlowNodes()).toBe(selected)
    await expect(read().getNodes()[1]).toBe(selected[1])
    await expect(read().setNodes === callbacks.setNodes).toBe(true)
    await expect(read().onNodesChange === callbacks.onNodesChange).toBe(true)
    await expect(read().getNodes === callbacks.getNodes).toBe(true)
    changeSelection(['node-1'])
    await expect(read().getNodes()[0]?.selected).toBe(false)
    await expect(read().getNodes()[1]?.selected).toBe(true)
    await expect(read().getNodes()[2]).toBe(selected[2])
    const settled = read().getNodes()
    for (let index = 0; index < 20; index++) read().frame({ dragging: new Set() })
    await expect(read().getNodes()).toBe(settled)
    await expect(read().getFlowNodes()).toBe(settled)
    changeSelection([])
    const empty = read().getNodes()
    flushSync(() => {
      useEditor.setState({ selectedId: 'node-2' })
    })
    await expect(read().getNodes()).toBe(empty)
    await expect(empty.every((node) => !node.selected)).toBe(true)
  },
}

export const PointerAndCameraFrames: Story = {
  play: async () => {
    const original = read().getNodes()
    const setters = read()
    // RF's marquee preview is independent of the committed selection until selection end.
    flushSync(() => {
      setters.onNodesChange([{ id: 'other', type: 'select', selected: true }])
    })
    read().frame()
    await expect(read().getNodes()[1]?.selected).toBe(true)
    changeSelection(['root'])
    await expect(read().getNodes()[1]?.selected).toBe(false)
    read().frame({ dragging: new Set(['root']) })
    flushSync(() => {
      setters.onNodesChange([{ id: 'root', type: 'position', position: { x: 180, y: 50 } }])
    })
    await expect(read().getFlowNodes()).toBe(read().getNodes())
    const beforeCamera = read().getNodes()
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
    await expect(read().getNodes()[0]?.position).toEqual({ x: 180, y: 50 })
    await expect(read().getNodes()[0]?.measured).toBe(camera[0]?.measured)
    await expect(read().getNodes()[1]?.position.x).toBe(210)
    await expect(read().getNodes()[0]?.data.cameraScale).toBe(1.2)
    await expect(read().getFlowNodes()).toBe(read().getNodes())
    // Releasing and changing selection cannot rewind the final pointer position.
    read().frame({ dragging: undefined })
    changeSelection(['other'])
    await expect(read().getNodes()[0]?.position).toEqual({ x: 180, y: 50 })
    await expect(read().getNodes()[0]?.selected).toBe(false)
    await expect(read().getNodes()[0]?.measured).toBe(camera[0]?.measured)
    await expect(read().getNodes()[1]?.selected).toBe(true)
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
    await expect(read().getNodes()[0]?.position).toEqual({ x: 40, y: 0 })
    await expect(read().setNodes === setters.setNodes).toBe(true)
    await expect(read().getNodes()[0]).not.toBe(beforeCamera[0])
    await expect(read().getNodes()[0]?.data).toEqual(camera[0]?.data)
    const current = read().getNodes()[0]
    if (current?.type !== 'topic') throw new Error('Expected the projected topic')
    await expect(current.data.topic).toBe(camera[0]?.data.topic)
    await expect(read().getFlowNodes()).toBe(read().getNodes())
    // Reusing IDs in another scope must discard the old gesture and measurements.
    read().frame({ projected: original, scope: 'second-sheet', dragging: new Set(['root']) })
    await expect(read().getNodes()[0]?.position).toEqual({ x: 0, y: 0 })
    await expect(read().getNodes()[0]?.measured).toBe(original[0]?.measured)
    await expect(read().getNodes()[1]?.selected).toBe(true)
    await expect(read().getFlowNodes()).toBe(read().getNodes())
  },
}

export const RapidFunctionalUpdates: Story = {
  play: async () => {
    const setters = read()
    setters.setNodes((current) =>
      current.map((node) =>
        node.id === 'root' ? { ...node, className: 'will-change-transform' } : node,
      ),
    )
    setters.onNodesChange([{ id: 'root', type: 'position', position: { x: 20, y: 10 } }])
    setters.setNodes((current) =>
      current.map((node) =>
        node.id === 'root'
          ? { ...node, position: { ...node.position, x: node.position.x + 5 } }
          : node,
      ),
    )
    // No React flush or render is needed to read the complete ordered update sequence.
    const immediate = setters.getNodes()
    await expect(immediate[0]?.position).toEqual({ x: 25, y: 10 })
    await expect(immediate[0]?.className).toBe('will-change-transform')
    await expect(read().getNodes()[0]?.position).toEqual({ x: 25, y: 10 })
    await expect(read().getNodes()[0]?.className).toBe('will-change-transform')
    await expect(read().getFlowNodes()).toBe(read().getNodes())
    read().frame({ dragging: new Set(['root']) })
    await expect(read().getFlowNodes()).toBe(read().getNodes())
    await expect(read().getNodes()[0]?.position).toEqual({ x: 25, y: 10 })
  },
}

const strictNodeTypes = { topic: () => <span>预置主题</span> }
const StrictFlowProbe = ({ projected }: { projected: CanvasFlowNode[] }) => {
  const { onNodesChange } = useCanvasNodeState(projected, 'strict-cached-sheet', undefined)
  return <ReactFlow nodeTypes={strictNodeTypes} onNodesChange={onNodesChange} />
}

export const StrictCachedSheetRemount: Story = {
  render: () => <div data-testid="strict-flow-root" className="h-[400px] w-[600px]" />,
  play: async ({ canvasElement }) => {
    const host = canvasElement.querySelector<HTMLElement>('[data-testid="strict-flow-root"]')
    if (!host) throw new Error('Strict canvas host is not mounted')
    const root = createRoot(host)
    const projected = [topic('cached-root'), topic('cached-other', 150)]
    try {
      for (const sheet of ['first-sheet', 'cached-sheet']) {
        flushSync(() => {
          root.render(
            <StrictMode>
              <ReactFlowProvider key={sheet}>
                <StrictFlowProbe projected={projected} />
              </ReactFlowProvider>
            </StrictMode>,
          )
        })
        await waitFor(() => expect(host.querySelectorAll('.react-flow__node')).toHaveLength(2))
      }
    } finally {
      root.unmount()
    }
  },
}
