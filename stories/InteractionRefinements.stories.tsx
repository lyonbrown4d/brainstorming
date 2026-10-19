import type { Meta, StoryObj } from '@storybook/react-vite'
import { applyCommand, createDocument } from '@core'
import { App } from '@renderer/App'
import { useEditor } from '@renderer/state/editor'
import { setCanvasSelection } from '@renderer/state/selection'
import { setInkMode } from '@renderer/state/canvasInk'
import { useAnnotationInteraction } from '@renderer/state/annotationInteraction'

const setup = (vertical = false) => {
  const document = applyCommand(createDocument('交互调整', 'interaction-refinements'), {
    type: 'batch',
    commands: [
      { type: 'addTopic', parentId: 'root', id: 'a', title: '收集资料', side: 'right' },
      { type: 'addTopic', parentId: 'root', id: 'b', title: '整理想法', side: 'right' },
      { type: 'addTopic', parentId: 'root', id: 'c', title: '准备演示', side: 'right' },
      { type: 'addTopic', parentId: 'root', id: 'summary-topic', title: '工作流程', side: 'right' },
      { type: 'addTopic', parentId: 'summary-topic', id: 'detail', title: '行动清单' },
      {
        type: 'upsertGroup',
        group: {
          id: 'summary',
          kind: 'summary',
          topicIds: ['a', 'b'],
          summaryTopicId: 'summary-topic',
        },
      },
      ...(vertical
        ? [{ type: 'setDocumentSettings' as const, settings: { layout: 'org-down' as const } }]
        : []),
    ],
  })
  useEditor.getState().replace(document)
  useEditor.setState({ outlineOpen: false, inspectorOpen: false, recovery: null })
  setCanvasSelection(['a'], [])
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
  title: 'Brainstorming/交互调整',
  component: App,
  parameters: { layout: 'fullscreen' },
  beforeEach: () => {
    setup()
  },
} satisfies Meta<typeof App>
export default meta
type Story = StoryObj<typeof meta>
export const Standard: Story = {}
export const HorizontalSiblings: Story = {
  beforeEach: () => {
    setup(true)
  },
}
