import type { Meta, StoryObj } from '@storybook/react-vite'
import { createRef, useImperativeHandle, useState } from 'react'
import { flushSync } from 'react-dom'
import { expect, fn, waitFor } from 'storybook/test'
import {
  ReactFlow,
  ReactFlowProvider,
  useStoreApi,
  type MiniMapProps,
  type Node,
} from '@xyflow/react'
import { CanvasMinimapSnapshot } from '@renderer/components/CanvasMinimapSnapshot'
import type { CanvasMinimapStore } from '@renderer/hooks/useCanvasMinimapSnapshot'
import { beginCanvasDrag, clearCanvasDrag } from '@renderer/state/canvasInteraction'
import { useEditor } from '@renderer/state/editor'
import '@xyflow/react/dist/style.css'
import '@renderer/styles/ui.css'

const initialNodes: Node[] = [
  {
    id: 'first',
    position: { x: 100, y: 100 },
    width: 100,
    height: 40,
    measured: { width: 100, height: 40 },
    data: { label: 'First', color: '#c05621' },
  },
  {
    id: 'last',
    position: { x: 800, y: 500 },
    width: 160,
    height: 60,
    measured: { width: 160, height: 60 },
    data: { label: 'Last', color: '#2b6cb0' },
  },
]
const color = (node: Node): string => String(node.data.color)
const controls = createRef<{ source: CanvasMinimapStore; toggle: () => void }>()
const read = () => {
  if (!controls.current) throw new Error('Missing minimap controls')
  return controls.current
}
const Overview = ({ minimapProps }: { minimapProps: MiniMapProps }) => {
  const source = useStoreApi()
  const [visible, setVisible] = useState(true)
  useImperativeHandle(controls, () => ({
    source,
    toggle: () => {
      setVisible((value) => !value)
    },
  }))
  return visible ? (
    <CanvasMinimapSnapshot source={source} pannable zoomable nodeColor={color} {...minimapProps} />
  ) : null
}
const Example = ({
  nodes = initialNodes,
  minimapProps = {},
}: {
  nodes?: Node[]
  minimapProps?: MiniMapProps
}) => (
  <div style={{ width: '100vw', height: '100vh' }}>
    <ReactFlowProvider>
      <ReactFlow defaultNodes={nodes} defaultViewport={{ x: 0, y: 0, zoom: 0.7 }}>
        <Overview minimapProps={minimapProps} />
      </ReactFlow>
    </ReactFlowProvider>
  </div>
)
const meta = {
  title: 'Brainstorming/Canvas Minimap',
  component: Example,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof Example>
export default meta
type Story = StoryObj<typeof meta>
export const Navigation: Story = {}

export const DeferredSnapshot: Story = {
  play: async ({ canvasElement }) => {
    const rectangle = () => canvasElement.querySelector('.react-flow__minimap-node')
    await waitFor(() => expect(rectangle()).toHaveAttribute('x', '100'))
    const source = read().source
    const nodes = source.getState().nodes
    const first = nodes[0]
    if (!first) throw new Error('Missing first node')
    flushSync(() => {
      source.getState().setNodes([
        {
          ...first,
          position: { x: 325.375, y: 125.625 },
          selected: true,
          width: 135,
          measured: { width: 135, height: 40 },
          data: { ...first.data, color: '#276749' },
        },
        ...nodes.slice(1),
      ])
    })
    const immediateX = rectangle()?.getAttribute('x')
    // The actual canvas has already updated while the official MiniMap retains its prior view.
    await expect(
      canvasElement.querySelector<HTMLElement>('.react-flow__node[data-id="first"]')?.style
        .transform,
    ).toBe('translate(325.375px, 125.625px)')
    await expect(immediateX).toBe('100')
    await waitFor(() => expect(rectangle()).toHaveAttribute('x', '325.375'))
    await expect(rectangle()).toHaveAttribute('y', '125.625')
    await expect(rectangle()).toHaveAttribute('width', '135')
    await expect(rectangle()).toHaveClass('selected')
    await expect(rectangle()).toHaveStyle({ fill: '#276749' })
    const document = useEditor.getState().history.document
    const token = beginCanvasDrag(document, 'minimap-story', ['first'])
    flushSync(() => {
      source.getState().setNodes(nodes)
    })
    await new Promise((resolve) => setTimeout(resolve, 150))
    await expect(rectangle()).toHaveAttribute('x', '325.375')
    await expect(
      canvasElement.querySelector<HTMLElement>('.react-flow__node[data-id="first"]')?.style
        .transform,
    ).toBe('translate(100px, 100px)')
    clearCanvasDrag(token)
    await waitFor(() => expect(rectangle()).toHaveAttribute('x', '100'))
    // Closing discards pending work; reopening seeds the newest source and a new provider.
    flushSync(() => {
      read().toggle()
    })
    await expect(rectangle()).toBeNull()
    flushSync(() => {
      source
        .getState()
        .setNodes([{ ...first, position: { x: 480.125, y: 100 } }, ...nodes.slice(1)])
      read().toggle()
    })
    await waitFor(() => expect(rectangle()).toHaveAttribute('x', '480.125'))
  },
}

const denseColors = ['#c05621', '#2b6cb0', '#276749']
const denseNodes: Node[] = Array.from({ length: 1001 }, (_, index) => ({
  id: `dense-${index}`,
  position: { x: (index % 40) * 120 - 180.375, y: Math.floor(index / 40) * 60 - 90.625 },
  width: 100,
  height: 40,
  measured: { width: 100, height: 40 },
  hidden: index === 0,
  selected: index >= 951,
  data: {
    label: `Node ${index}`,
    color: denseColors[Math.min(2, Math.floor(Math.max(0, index - 1) / 334))],
  },
}))
const denseColor = fn(color)

export const DenseSnapshot: Story = {
  args: { nodes: denseNodes, minimapProps: { nodeStrokeWidth: 0, nodeColor: denseColor } },
  beforeEach: () => {
    denseColor.mockClear()
  },
  play: async ({ canvasElement }) => {
    const paths = () => [...canvasElement.querySelectorAll('.react-flow__minimap-node')]
    // Three contiguous palette runs plus the selected tail retain four SVG paths.
    await waitFor(() => expect(paths()).toHaveLength(4))
    const rendered = paths()
    await expect(rendered.every((path) => path.tagName.toLowerCase() === 'path')).toBe(true)
    await expect(rendered.every((path) => path.getAttribute('pointer-events') === 'none')).toBe(
      true,
    )
    await expect(
      rendered.reduce(
        (count, path) => count + Number(path.getAttribute('data-minimap-node-count')),
        0,
      ),
    ).toBe(1000)
    await expect(
      rendered.reduce(
        (count, path) => count + (path.getAttribute('d')?.match(/M/g)?.length ?? 0),
        0,
      ),
    ).toBe(1000)
    const mask = canvasElement.querySelector('.react-flow__minimap-mask')
    const before = mask?.getAttribute('d')
    denseColor.mockClear()
    const source = read().source
    const [x, y, zoom] = source.getState().transform
    flushSync(() => {
      source.setState({ transform: [x + 15, y - 20, zoom] })
    })
    await waitFor(() => expect(mask?.getAttribute('d')).not.toBe(before))
    await expect(denseColor).not.toHaveBeenCalled()
    await expect(paths().every((path, index) => path === rendered[index])).toBe(true)
  },
}

export const DenseNavigation: Story = {
  args: { nodes: denseNodes, minimapProps: { nodeStrokeWidth: 0 } },
}

const imageNodes = denseNodes.map((node, index) => ({
  ...node,
  data: { ...node.data, color: denseColors[index % denseColors.length] },
}))

export const DenseImage: Story = {
  args: { nodes: imageNodes, minimapProps: { nodeStrokeWidth: 0 } },
  play: async ({ canvasElement }) => {
    const artwork = () => canvasElement.querySelector('.react-flow__minimap-image')
    await waitFor(() => expect(artwork()).toHaveAttribute('data-minimap-node-count', '1000'))
    const firstUrl = artwork()?.getAttribute('href')
    await expect(firstUrl).toMatch(/^blob:/)
    await expect(artwork()).toHaveAttribute('x', '-180.375')
    await expect(artwork()).toHaveAttribute('y', '-90.625')
    await expect(artwork()).toHaveAttribute('width', '4780')
    await expect(artwork()).toHaveAttribute('height', '1540')
    await expect(artwork()).toHaveAttribute('preserveAspectRatio', 'none')
    await expect(artwork()).toHaveAttribute('pointer-events', 'none')
    await expect(canvasElement.querySelectorAll('.react-flow__minimap-node')).toHaveLength(0)
    const source = read().source
    const mask = canvasElement.querySelector('.react-flow__minimap-mask')
    const before = mask?.getAttribute('d')
    const [x, y, zoom] = source.getState().transform
    flushSync(() => {
      source.setState({ transform: [x + 15, y - 20, zoom] })
    })
    await waitFor(() => expect(mask?.getAttribute('d')).not.toBe(before))
    await expect(artwork()?.getAttribute('href')).toBe(firstUrl)
    const nodes = source.getState().nodes
    flushSync(() => {
      source
        .getState()
        .setNodes(
          nodes.map((node) =>
            node.id === 'dense-1'
              ? { ...node, position: { x: -400.125, y: node.position.y } }
              : node,
          ),
        )
    })
    await waitFor(() => expect(artwork()).toHaveAttribute('x', '-400.125'))
    await expect(artwork()?.getAttribute('href')).not.toBe(firstUrl)
    await expect(artwork()).toHaveAttribute('data-minimap-node-count', '1000')
  },
}

export const ImageNavigation: Story = {
  args: { nodes: imageNodes, minimapProps: { nodeStrokeWidth: 0 } },
}

/** Match the responsive production panel, including its border-box CSS dimensions. */
export const CompactNavigation: Story = {
  args: {
    minimapProps: {
      className: '!h-20 !w-28 overflow-hidden border',
    },
  },
}
