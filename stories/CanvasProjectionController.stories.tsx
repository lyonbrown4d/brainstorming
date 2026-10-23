import type { Meta, StoryObj } from '@storybook/react-vite'
import {
  createRef,
  StrictMode,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'
import { flushSync } from 'react-dom'
import { createRoot } from 'react-dom/client'
import { ReactFlow, ReactFlowProvider, useStoreApi } from '@xyflow/react'
import { expect, waitFor } from 'storybook/test'
import { createFixtureDocument } from '@core'
import { layoutDocument } from '@layout'
import type { CanvasFlowNode } from '@renderer/lib/canvasNodes'
import { createCanvasProjectionController } from '@renderer/lib/canvasProjectionController'
import { projectCanvas } from '@renderer/components/documents/projectCanvas'
import { useCanvasCameraProjection } from '@renderer/hooks/useCanvasCameraProjection'
import { useCanvasNodeState } from '@renderer/hooks/useCanvasNodeState'
import { useCanvasProjectionEdges } from '@renderer/hooks/useCanvasProjectionEdges'
import { CanvasProjectionLayers } from '@renderer/components/documents/CanvasProjectionLayers'
import { useEditor } from '@renderer/state/editor'
import { useSelection } from '@renderer/state/selection'
import { usePresentation } from '@renderer/state/presentation'
import { useSpatialView, type SpatialView } from '@renderer/state/spatialView'
import { setSpatialLens, useSpatialLens } from '@renderer/state/spatialLens'

const spatial: SpatialView = {
  mode: '2d',
  yaw: 0.4,
  pitch: 0.3,
  spacing: 100,
  cameraDistance: 4000,
}
const fixture = createFixtureDocument(3)
const document = {
  ...fixture,
  settings: {
    ...fixture.settings,
    spatial: {
      mode: spatial.mode,
      yaw: spatial.yaw,
      pitch: spatial.pitch,
      spacing: spatial.spacing,
    },
  },
}
const layout = layoutDocument(document)
const nodeTypes = { topic: () => <span>主题内容</span> }
const control = createRef<{
  nodes: () => CanvasFlowNode[]
  canonical: () => CanvasFlowNode[]
  commits: () => number
  preview: () => void
}>()
const read = () => {
  if (!control.current) throw new Error('Projection controller probe is not mounted')
  return control.current
}
const Probe = () => {
  const editor = useEditor.getState()
  const workbookId = editor.workbook.id
  const sheetId = editor.activeSheetId
  const scope = JSON.stringify([workbookId, sheetId, document.id])
  const [controller] = useState(() => createCanvasProjectionController(scope))
  const [frame] = useState(() => ({
    phase: '2d' as const,
    scopeId: scope,
    pending: false,
    refreshGeometry: false,
    document,
    layout,
    projection: projectCanvas(document, undefined, layout),
  }))
  useCanvasCameraProjection(controller, frame)
  const { getNodes, onNodesChange } = useCanvasNodeState(controller, scope, undefined)
  useCanvasProjectionEdges(controller)
  const store = useStoreApi<CanvasFlowNode>()
  const commits = useRef(0)
  useLayoutEffect(() => {
    commits.current++
  })
  useImperativeHandle(control, () => ({
    nodes: getNodes,
    canonical: () => controller.getProjection().nodes,
    commits: () => commits.current,
    preview: () => {
      onNodesChange([{ id: 'root', type: 'position', position: { x: 999, y: 999 } }])
      if (getNodes() !== store.getState().nodes) throw new Error('RF must own the live nodes')
    },
  }))
  return (
    <div className="h-[400px] w-[600px]">
      <ReactFlow nodeTypes={nodeTypes} onNodesChange={onNodesChange}>
        <CanvasProjectionLayers controller={controller} />
      </ReactFlow>
    </div>
  )
}
const meta = {
  title: 'Brainstorming/画布投影控制器',
  component: Probe,
  decorators: [
    (Story) => (
      <ReactFlowProvider>
        <Story />
      </ReactFlowProvider>
    ),
  ],
  beforeEach: () => {
    const editor = useEditor.getState()
    useEditor.setState({
      history: { ...editor.history, document },
      selectedId: 'root',
      dropTargetId: null,
      editingId: null,
    })
    useSelection.setState({ sheets: {}, drawings: {} })
    usePresentation.setState({ playing: false })
    useSpatialView.setState({ views: {} })
    useSpatialLens.setState({ distances: {}, order: [] })
    setSpatialLens(editor.workbook.id, editor.activeSheetId, spatial.cameraDistance)
  },
} satisfies Meta<typeof Probe>
export default meta
type Story = StoryObj<typeof meta>

export const PointerOwnedFrames: Story = {
  play: async ({ canvasElement }) => {
    await waitFor(() => expect(read().nodes()).toHaveLength(3))
    const original = read().canonical()
    const commits = read().commits()
    flushSync(() => {
      read().preview()
    })
    await expect(
      read()
        .nodes()
        .find((node) => node.id === 'root')?.position,
    ).toEqual({
      x: 999,
      y: 999,
    })
    await expect(read().canonical()).toBe(original)
    const editor = useEditor.getState()
    useSpatialView.getState().setView(editor.workbook.id, editor.activeSheetId, {
      target: { x: 80, y: 10, z: 0 },
      yaw: 0.6,
    })
    setSpatialLens(editor.workbook.id, editor.activeSheetId, 6000)
    await expect(read().canonical()).toBe(original)
    await expect(
      read()
        .nodes()
        .find((node) => node.id === 'root')?.position,
    ).toEqual({ x: 999, y: 999 })
    await expect(read().commits()).toBe(commits)
    await expect(canvasElement.querySelectorAll('.react-flow__node')).toHaveLength(3)
    await expect(
      canvasElement.querySelector('[data-testid="structural-edge-layer"]'),
    ).not.toBeNull()
  },
}

export const StrictCachedControllerRemount: Story = {
  render: () => <div data-testid="strict-controller-host" />,
  play: async ({ canvasElement }) => {
    const host = canvasElement.querySelector<HTMLElement>('[data-testid="strict-controller-host"]')
    if (!host) throw new Error('Missing controller test host')
    const root = createRoot(host)
    try {
      for (const sheet of ['first', 'cached']) {
        flushSync(() => {
          root.render(
            <StrictMode>
              <ReactFlowProvider key={sheet}>
                <Probe />
              </ReactFlowProvider>
            </StrictMode>,
          )
        })
        await waitFor(() => expect(host.querySelectorAll('.react-flow__node')).toHaveLength(3))
        await expect(read().nodes()).toHaveLength(3)
      }
    } finally {
      root.unmount()
    }
  },
}
