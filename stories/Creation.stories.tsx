import '@renderer/styles/ui.css'
import '@renderer/styles/base.css'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, userEvent, within } from 'storybook/test'
import { initializeI18n } from '@renderer/i18n'
import { RecentDocuments } from '@renderer/components/creation/RecentDocuments'
import { installPlatformAPI } from '@renderer/lib/desktop'
import { createStoryDesktop } from '@stories/desktopBridge'
import { CreationGallery } from '@renderer/components/creation/CreationGallery'

const meta = {
  title: 'Brainstorming/创建引导',
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

/** Static entries keep both steps available for visual and responsive inspection. */
export const Gallery: Story = {}
export const Home: Story = {
  args: { onOpen: fn(), sidebar: <RecentDocuments busy={false} onExample={fn()} /> },
  beforeEach: () =>
    installPlatformAPI({
      ...createStoryDesktop(),
      getRecentFiles: () =>
        Promise.resolve([
          { path: '/preview/product.brainstorming', name: '产品路线图' },
          { path: '/preview/research.brainstorming', name: '用户研究' },
          { path: '/preview/ideas.brainstorming', name: '头脑风暴' },
        ]),
    }),
}
export const EnglishGallery: Story = {
  beforeEach: async () => {
    await initializeI18n('en')
    return () => initializeI18n('zh-CN')
  },
}
export const Setup: Story = { args: { step: 2 } }
export const DarkGallery: Story = {
  beforeEach: () => {
    const previous = document.documentElement.getAttribute('data-theme')
    document.documentElement.setAttribute('data-theme', 'dark')
    return () => {
      if (previous) document.documentElement.setAttribute('data-theme', previous)
      else document.documentElement.removeAttribute('data-theme')
    }
  },
}

export const NewDocument: Story = {
  args: { onOpen: fn(), onExample: fn() },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('tab', { name: '思维与逻辑' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    await expect(canvas.getAllByRole('button', { name: /^选择/ })).toHaveLength(3)
    await userEvent.type(canvas.getByRole('searchbox', { name: '搜索图类型' }), 'brace')
    const structure = canvas.getByRole('button', { name: '选择向右括号图' })
    structure.focus()
    await userEvent.keyboard('{Enter}')
    await expect(structure).toHaveAttribute('aria-pressed', 'true')
    await expect(args.onCreate).not.toHaveBeenCalled()
    await expect(canvas.queryByRole('button', { name: '创建文档' })).not.toBeInTheDocument()
    await expect(canvas.queryByRole('button', { name: '空白导图' })).not.toBeInTheDocument()
    await expect(canvas.getAllByRole('button', { name: /^选择/ })).toHaveLength(2)
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
    await userEvent.click(canvas.getByRole('tab', { name: '时间线' }))
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

export const WithoutPreset: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: '不使用预设' }))
    await expect(canvas.getByRole('button', { name: '不使用预设' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await userEvent.type(canvas.getByRole('searchbox', { name: '搜索图类型' }), '不存在的类型')
    await expect(canvas.getByRole('status')).toHaveTextContent('没有匹配的图类型')
    await expect(canvas.getByRole('button', { name: '不使用预设' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await userEvent.click(canvas.getByRole('button', { name: '清除图类型搜索' }))
    await expect(canvas.queryByRole('status')).not.toBeInTheDocument()
    await userEvent.click(canvas.getByRole('button', { name: '下一步' }))
    await expect(canvas.queryByRole('group', { name: '选择初始内容' })).not.toBeInTheDocument()
    await userEvent.type(canvas.getByRole('textbox', { name: '文档名称' }), '我的想法')
    await userEvent.click(canvas.getByRole('button', { name: '创建文档' }))
    await expect(args.onCreate).toHaveBeenCalledWith({
      title: '我的想法',
      layout: 'none',
      template: 'blank',
    })
    await expect(args.onCreate).toHaveBeenCalledTimes(1)
  },
}

export const Creating: Story = { args: { busy: true } }
