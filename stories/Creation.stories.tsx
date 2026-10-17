import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, userEvent, within } from 'storybook/test'
import { CreationGallery } from '@renderer/components/creation/CreationGallery'

const meta = {
  title: 'Trelyx/创建引导',
  component: CreationGallery,
  parameters: { layout: 'fullscreen' },
  decorators: [
    (Story) => (
      <div className="h-screen">
        <Story />
      </div>
    ),
  ],
  args: { mode: 'document', onCreate: fn(() => true) },
} satisfies Meta<typeof CreationGallery>
export default meta
type Story = StoryObj<typeof meta>

export const NewDocument: Story = {
  args: { onOpen: fn(), onExample: fn() },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    const structure = canvas.getByRole('button', { name: '选择向右括号图' })
    structure.focus()
    await userEvent.keyboard('{Enter}')
    await expect(structure).toHaveAttribute('aria-pressed', 'true')
    await expect(args.onCreate).not.toHaveBeenCalled()
    await expect(canvas.queryByRole('button', { name: '创建文档' })).not.toBeInTheDocument()
    await expect(canvas.queryByRole('button', { name: '空白导图' })).not.toBeInTheDocument()
    await expect(canvas.getAllByRole('button', { name: /^选择/ })).toHaveLength(15)
    await userEvent.click(canvas.getByRole('button', { name: '下一步' }))
    await userEvent.click(canvas.getByRole('button', { name: '选择项目计划模板' }))
    await userEvent.type(canvas.getByRole('textbox', { name: '文档名称' }), '产品发布计划')
    await userEvent.click(canvas.getByRole('button', { name: '上一步' }))
    await expect(canvas.getByRole('button', { name: '选择向右括号图' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await userEvent.click(canvas.getByRole('button', { name: '下一步' }))
    await expect(canvas.getByRole('textbox', { name: '文档名称' })).toHaveValue('产品发布计划')
    await expect(canvas.getByRole('button', { name: '选择项目计划模板' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    canvas.getByRole('textbox', { name: '文档名称' }).focus()
    await userEvent.keyboard('{Enter}')
    await expect(args.onCreate).toHaveBeenCalledTimes(1)
    await expect(args.onCreate).toHaveBeenCalledWith({
      title: '产品发布计划',
      layout: 'brace-right',
      template: 'project',
    })
    await expect(canvas.getByRole('button', { name: '创建文档' })).toBeDisabled()
  },
}

export const NewSheet: Story = {
  args: { mode: 'sheet', onCancel: fn(), onCreate: fn(() => true) },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: '下一步' }))
    await expect(canvas.getByRole('textbox', { name: '画布名称' })).toHaveAttribute(
      'placeholder',
      '新画布',
    )
    await userEvent.click(canvas.getByRole('button', { name: '创建画布' }))
    await expect(args.onCreate).toHaveBeenCalledWith({
      title: '',
      layout: 'map',
      template: 'blank',
    })
  },
}

export const RetryAfterFailure: Story = {
  args: { mode: 'sheet', onCreate: fn(() => false), onCancel: fn(), error: '创建失败，请重试。' },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: '选择垂直时间线' }))
    await userEvent.click(canvas.getByRole('button', { name: '下一步' }))
    await userEvent.click(canvas.getByRole('button', { name: '选择学习笔记模板' }))
    await userEvent.type(canvas.getByRole('textbox', { name: '画布名称' }), '阅读记录')
    await userEvent.click(canvas.getByRole('button', { name: '创建画布' }))
    await expect(args.onCreate).toHaveBeenCalledTimes(1)
    await expect(args.onCreate).toHaveBeenCalledWith({
      title: '阅读记录',
      layout: 'timeline-vertical',
      template: 'study',
    })
    await expect(canvas.getByRole('alert')).toHaveTextContent('创建失败，请重试。')
    await userEvent.click(canvas.getByRole('button', { name: '上一步' }))
    await expect(canvas.getByRole('button', { name: '选择垂直时间线' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await userEvent.click(canvas.getByRole('button', { name: '下一步' }))
    await expect(canvas.getByRole('textbox', { name: '画布名称' })).toHaveValue('阅读记录')
    await expect(canvas.getByRole('button', { name: '创建画布' })).toBeEnabled()
  },
}

export const Creating: Story = { args: { busy: true } }
