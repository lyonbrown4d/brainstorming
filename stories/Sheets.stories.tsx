import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, userEvent, within } from 'storybook/test'
import { createDocument } from '@core'
import { SheetTabs } from '@renderer/components/SheetTabs'
import { useEditor } from '@renderer/state/editor'
import '@renderer/styles/ui.css'

const meta = {
  title: 'Brainstorming/画布标签',
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
export const ActionMenu: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const page = within(canvasElement.ownerDocument.body)
    await userEvent.click(canvas.getByRole('button', { name: '画布菜单 产品总览' }))
    const menu = within(await page.findByRole('menu'))
    await expect(menu.getByRole('menuitem', { name: '向左移动' })).toHaveAttribute(
      'aria-disabled',
      'true',
    )
    await expect(menu.getByRole('menuitem', { name: '向右移动' })).not.toHaveAttribute(
      'aria-disabled',
      'true',
    )
    await expect(menu.getByRole('menuitem', { name: '删除画布' })).not.toHaveAttribute(
      'aria-disabled',
      'true',
    )
  },
}
export const Busy: Story = {
  beforeEach: () => {
    useEditor.setState({ busy: true })
  },
  afterEach: () => {
    useEditor.setState({ busy: false })
  },
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByRole('button', { name: '画布菜单 产品总览' }),
    ).toBeDisabled()
  },
}
export const ManySheets: Story = {
  beforeEach: () => {
    for (let index = 0; index < 12; index++) {
      useEditor.getState().addSheet()
    }
  },
}
