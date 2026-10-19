import type { Meta, StoryObj } from '@storybook/react-vite'
import { applyCommand, createDocument, type LayoutKind, type SheetVisualStyle } from '@core'
import { App } from '@renderer/App'
import { useEditor } from '@renderer/state/editor'

const arrange = (layout: LayoutKind, visualStyle: SheetVisualStyle = 'normal') => {
  useEditor.getState().replace(
    applyCommand(createDocument('拖动中的连线'), {
      type: 'batch',
      commands: [
        { type: 'addTopic', parentId: 'root', id: 'branch', title: '保留归属' },
        { type: 'addTopic', parentId: 'branch', id: 'descendant', title: '自由移动' },
        { type: 'addTopic', parentId: 'root', id: 'peer', title: '另一分支' },
        { type: 'setDocumentSettings', settings: { layout, visualStyle } },
      ],
    }),
  )
  useEditor.setState({ recovery: null, inspectorOpen: false, outlineOpen: false })
}
const meta = {
  title: 'Brainstorming/实时结构连线',
  component: App,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof App>
export default meta
type Story = StoryObj<typeof meta>
export const Orthogonal: Story = {
  beforeEach: () => {
    arrange('org-down')
  },
}
export const Waypoints: Story = {
  beforeEach: () => {
    arrange('fishbone')
  },
}
export const Sketch: Story = {
  beforeEach: () => {
    arrange('org-down', 'sketch')
  },
}
