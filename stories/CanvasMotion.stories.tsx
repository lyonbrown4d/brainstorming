import type { Meta, StoryObj } from '@storybook/react-vite'
import { applyCommand, createDocument } from '@core'
import { App } from '@renderer/App'
import { useEditor } from '@renderer/state/editor'

const meta = {
  title: 'Brainstorming/画布动效',
  component: App,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          '选择主题后用 Tab 新增子主题、Enter 确认，拖动主题后撤销；右键复制、粘贴样式，观察短过渡。系统减少动态效果设置下立即完成。',
      },
    },
  },
  beforeEach: () => {
    useEditor.getState().replace(
      applyCommand(createDocument('画布动效', 'motion-story'), {
        type: 'batch',
        commands: [
          { type: 'addTopic', parentId: 'root', id: 'a', title: '创建与展开' },
          { type: 'addTopic', parentId: 'a', id: 'detail', title: '连续编辑与撤销' },
          { type: 'addTopic', parentId: 'root', id: 'other', title: '样式与移动' },
        ],
      }),
    )
    useEditor.setState({ recovery: null, outlineOpen: false, inspectorOpen: false })
  },
} satisfies Meta<typeof App>
export default meta
type Story = StoryObj<typeof meta>
export const Default: Story = {}
export const ThreeDimensional: Story = {
  name: '三维同款样式',
  beforeEach: () => {
    useEditor.getState().command({
      type: 'setDocumentSettings',
      settings: { spatial: { mode: '3d', yaw: 0, pitch: 0, spacing: 80 } },
    })
  },
}
