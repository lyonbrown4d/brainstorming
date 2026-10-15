import type { Meta, StoryObj } from '@storybook/react-vite'
import { ReactFlow, ReactFlowProvider } from '@xyflow/react'
import { TopicNode, type TopicFlowNode } from '../src/renderer/components/TopicNode'
import { createDocument } from '../src/core'
import { useEditor } from '../src/renderer/state/editor'
import '@xyflow/react/dist/style.css'
import '../src/renderer/styles/base.css'
import '../src/renderer/styles/topics.css'
const topic = createDocument('一个新的想法').topics.root
const nodeTypes = { topic: TopicNode }
function TopicPreview({ root = false }: { root?: boolean }) {
  if (!topic) return null
  const nodes: TopicFlowNode[] = [
    {
      id: 'root',
      type: 'topic',
      position: { x: 0, y: 0 },
      style: { width: 210, height: 60 },
      data: { topic, root, color: '#8b79d9' },
    },
  ]
  return (
    <div style={{ height: 330, width: '100%', background: '#f8f9f8' }}>
      <ReactFlowProvider>
        <ReactFlow nodes={nodes} nodeTypes={nodeTypes} fitView />
      </ReactFlowProvider>
    </div>
  )
}
const meta = {
  title: 'Trelyx/主题',
  component: TopicPreview,
  beforeEach: () => {
    useEditor.getState().replace(createDocument('一个新的想法'))
  },
} satisfies Meta<typeof TopicPreview>
export default meta
type Story = StoryObj<typeof meta>
export const Branch: Story = {}
export const Center: Story = { args: { root: true } }
