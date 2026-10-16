import type { Meta, StoryObj } from '@storybook/react-vite'
import { createDocument } from '../src/core'
import { SheetTabs } from '../src/renderer/src/components/SheetTabs'
import { useEditor } from '../src/renderer/src/state/editor'
import '../src/renderer/src/styles/ui.css'

const meta = {
  title: 'Trelyx/画布标签',
  component: SheetTabs,
  parameters: { layout: 'fullscreen' },
  decorators: [
    (Story) => (
      <div style={{ maxWidth: 680, borderBottom: '1px solid #e9e7f0' }}>
        <Story />
      </div>
    ),
  ],
  beforeEach: () => {
    const state = useEditor.getState()
    state.replace(createDocument('产品内容'))
    state.renameSheet(useEditor.getState().activeSheetId, '产品总览')
    state.addSheet()
    state.renameSheet(useEditor.getState().activeSheetId, '用户研究')
    state.addSheet()
    state.renameSheet(useEditor.getState().activeSheetId, '迭代计划')
    const first = useEditor.getState().workbook.sheets[0]
    if (first) state.switchSheet(first.id)
  },
} satisfies Meta<typeof SheetTabs>
export default meta
type Story = StoryObj<typeof meta>
export const Default: Story = {}
export const ManySheets: Story = {
  beforeEach: () => {
    for (let index = 0; index < 12; index++) {
      useEditor.getState().addSheet()
    }
  },
}
