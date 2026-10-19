import type { Meta, StoryObj } from '@storybook/react-vite'
import { applyCommand, createDocument } from '@core'
import { App } from '@renderer/App'
import { useEditor } from '@renderer/state/editor'
import { selectAnnotation } from '@renderer/state/annotationInteraction'
import { setInkMode } from '@renderer/state/canvasInk'

const setup = (routing: 'curve' | 'orthogonal' | 'straight') => {
  const document = applyCommand(createDocument('直接编辑关联线'), {
    type: 'batch',
    commands: [
      { type: 'addFloatingTopic', id: 'a', title: '起点', x: 220, y: 100 },
      { type: 'addFloatingTopic', id: 'b', title: '终点', x: 700, y: 100 },
      { type: 'addFloatingTopic', id: 'c', title: '改接到这里', x: 700, y: 350 },
      {
        type: 'upsertRelation',
        relation: { id: 'editable', from: 'a', to: 'b', title: '拖动标签', routing, arrow: 'end' },
      },
    ],
  })
  useEditor.getState().replace(document)
  useEditor.setState({ outlineOpen: false, inspectorOpen: false, recovery: null })
  setInkMode('select')
  selectAnnotation('relation', 'editable')
}
const meta = {
  title: 'Brainstorming/关联线路径',
  component: App,
  parameters: { layout: 'fullscreen' },
  beforeEach: () => {
    setup('curve')
  },
} satisfies Meta<typeof App>
export default meta
type Story = StoryObj<typeof meta>
export const Curve: Story = {}
export const Orthogonal: Story = {
  beforeEach: () => {
    setup('orthogonal')
  },
}
export const Straight: Story = {
  beforeEach: () => {
    setup('straight')
  },
}
