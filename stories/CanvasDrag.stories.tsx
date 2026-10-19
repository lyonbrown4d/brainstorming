import type { Meta, StoryObj } from '@storybook/react-vite'
import { applyCommand, createDocument } from '@core'
import { App } from '@renderer/App'
import { useEditor } from '@renderer/state/editor'
import { setInkMode } from '@renderer/state/canvasInk'

const meta = {
  title: 'Brainstorming/Canvas Drag',
  component: App,
  parameters: { layout: 'fullscreen' },
  beforeEach: () => {
    setInkMode('select')
    useEditor.getState().replace(
      applyCommand(createDocument('拖动'), {
        type: 'batch',
        commands: [
          {
            type: 'addTopic',
            parentId: 'root',
            id: 'source',
            title: '从长标题的右侧拖动这个分支和它的子主题',
            side: 'right',
          },
          { type: 'addTopic', parentId: 'source', id: 'child', title: '子主题' },
          { type: 'addTopic', parentId: 'root', id: 'target', title: '目标', side: 'left' },
        ],
      }),
    )
    useEditor.setState({ outlineOpen: false, inspectorOpen: false, recovery: null })
  },
} satisfies Meta<typeof App>
export default meta
type Story = StoryObj<typeof meta>
export const OffCenterGrab: Story = {}
