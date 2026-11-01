import type { Meta, StoryObj } from '@storybook/react-vite'
import { applyCommand, createDocument } from '@core'
import { App } from '@renderer/App'
import { useEditor } from '@renderer/state/editor'
import { setCanvasSelection } from '@renderer/state/selection'
import { setInkMode } from '@renderer/state/canvasInk'
import { useAnnotationInteraction } from '@renderer/state/annotationInteraction'
import { useSpatialView } from '@renderer/state/spatialView'
import { useSpatialLens } from '@renderer/state/spatialLens'

const Preview = () => {
  const document = useEditor((state) => state.history.document)
  const past = useEditor((state) => state.history.past.length)
  const selected = useEditor((state) => state.selectedId)
  return (
    <>
      <App />
      <output hidden data-testid="direct-topic-evidence">
        {JSON.stringify({ document, past, selected })}
      </output>
    </>
  )
}
const setup = (spatial = false, circle = false) => {
  useSpatialView.setState({ views: {} })
  useSpatialLens.setState({ distances: {} })
  useEditor.getState().replace(
    applyCommand(createDocument('直接编辑主题', 'direct-topic-controls'), {
      type: 'batch',
      commands: [
        {
          type: 'addTopic',
          parentId: 'root',
          id: 'branch',
          title: '拖动侧边调整标题换行，文字大小保持不变',
          side: 'right',
        },
        { type: 'addTopic', parentId: 'root', id: 'other', title: '其他想法', side: 'left' },
        {
          type: 'setTopicStyle',
          topicId: 'branch',
          style: { width: 260, scale: 1.25, ...(circle ? { shape: 'circle' as const } : {}) },
        },
        ...(spatial
          ? [
              {
                type: 'setDocumentSettings' as const,
                settings: { spatial: { mode: '3d' as const, yaw: 0, pitch: 0, spacing: 80 } },
              },
            ]
          : []),
      ],
    }),
  )
  useEditor.setState({ outlineOpen: false, inspectorOpen: false, recovery: null })
  setCanvasSelection(['branch'], [])
  useAnnotationInteraction.setState({
    selected: null,
    editing: false,
    relationMode: false,
    fromId: null,
    floating: false,
  })
  setInkMode('select')
}
const meta = {
  title: 'Brainstorming/主题直接操作',
  component: Preview,
  parameters: { layout: 'fullscreen' },
  beforeEach: () => {
    setup()
  },
} satisfies Meta<typeof Preview>
export default meta
type Story = StoryObj<typeof meta>
export const WidthAndAdd: Story = {}
export const Circle: Story = {
  beforeEach: () => {
    setup(false, true)
  },
}
export const Spatial: Story = {
  beforeEach: () => {
    setup(true)
  },
}
