import type { Meta, StoryObj } from '@storybook/react-vite'
import { ReactFlow, ReactFlowProvider } from '@xyflow/react'
import { expect, userEvent, within, waitFor } from 'storybook/test'
import { applyCommand, createDocument } from '@core'
import { measureTopic } from '@layout'
import { TopicNode, type TopicFlowNode } from '@renderer/components/TopicNode'
import { useEditor } from '@renderer/state/editor'
import '@xyflow/react/dist/style.css'
import '@renderer/styles/ui.css'
import '@renderer/styles/base.scss'
import '@renderer/styles/topics.scss'

const nodeTypes = { topic: TopicNode }
const detailDocument = () =>
  applyCommand(createDocument('中心主题', 'semantic-zoom'), {
    type: 'batch',
    commands: [
      { type: 'addTopic', parentId: 'root', id: 'detail', title: '远处的主题' },
      { type: 'setTopicNotes', topicId: 'detail', notes: '便签备注正文' },
      { type: 'setTopicStyle', topicId: 'detail', style: { shape: 'card' } },
      {
        type: 'setTopicMetadata',
        topicId: 'detail',
        metadata: { labels: ['详细标签'], markers: ['star'] },
      },
      {
        type: 'setTopicImage',
        topicId: 'detail',
        width: 64,
        height: 32,
        asset: {
          id: 'zoom-image',
          name: 'semantic-zoom.png',
          mimeType: 'image/png',
          data: 'iVBORw0KGgoAAAANSUhEUgAAAEAAAAAgCAIAAAAt/+nTAAAATklEQVR4nO3PUQkAIBTAwNfZCmYzlyH8OITBAtxmr/N1wwUNaEEDWtCAFjSgBQ1oQQNa0IAWNKAFDWhBA1rQgBY0oAUNaEEDWtCAFjx2AVy66MQNatJXAAAAAElFTkSuQmCC',
        },
      },
    ],
  })

const DetailPreview = () => {
  const topic = useEditor((state) => state.history.document.topics.detail)
  if (!topic) return null
  const size = measureTopic(topic.title, false, undefined, topic)
  const nodes: TopicFlowNode[] = [
    {
      id: topic.id,
      type: 'topic',
      position: { x: 0, y: 0 },
      initialWidth: size.width,
      initialHeight: size.height,
      style: size,
      data: { topic, root: false, color: '#397a6c', fill: '#e5f3ed', textColor: '#112233' },
    },
  ]
  return (
    <div className="h-[400px] w-full bg-background">
      <ReactFlowProvider>
        <ReactFlow
          nodes={nodes}
          nodeTypes={nodeTypes}
          defaultViewport={{ x: 100, y: 80, zoom: 0.3 }}
          minZoom={0.1}
          nodesDraggable={false}
          onNodeClick={(_event, node) => {
            useEditor.getState().select(node.id)
          }}
        />
      </ReactFlowProvider>
    </div>
  )
}

const meta = {
  title: 'Brainstorming/主题细节缩放',
  component: DetailPreview,
  beforeEach: () => {
    useEditor.getState().replace(detailDocument())
  },
} satisfies Meta<typeof DetailPreview>
export default meta
type Story = StoryObj<typeof meta>

export const SelectedDetailRemainsAvailable: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const node = canvas.getByTestId('topic-detail')
    await expect(node).toHaveTextContent('远处的主题')
    await expect(canvas.queryByRole('img', { name: 'semantic-zoom.png' })).not.toBeInTheDocument()
    await expect(canvas.queryByText('详细标签')).not.toBeInTheDocument()
    const before = node.getBoundingClientRect()
    await userEvent.click(node)
    await waitFor(() =>
      expect(canvas.getByRole('img', { name: 'semantic-zoom.png' })).toBeVisible(),
    )
    await expect(canvas.getByText('详细标签')).toBeVisible()
    await expect(node).toHaveTextContent('便签备注正文')
    await expect(node.getBoundingClientRect().width).toBe(before.width)
    await expect(node.getBoundingClientRect().height).toBe(before.height)
  },
}
