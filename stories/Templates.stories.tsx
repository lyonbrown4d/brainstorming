import '@renderer/styles/ui.css'
import '@renderer/styles/base.css'
import { useState, type ComponentProps } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, userEvent, within } from 'storybook/test'
import type { DesktopAPI } from '@shared/contracts'
import { fixtureCatalog } from '@tests/fixtures/templates'
import { queryClient } from '@renderer/lib/queryClient'
import { installPlatformAPI } from '@renderer/lib/desktop'
import { createStoryDesktop } from '@stories/desktopBridge'
import { initializeI18n } from '@renderer/i18n'
import { TemplateChoices } from '@renderer/components/creation/TemplateChoices'

type Props = ComponentProps<typeof TemplateChoices>
const Preview = (props: Props) => {
  const [value, setValue] = useState(props.value)
  return (
    <div className="mx-auto max-w-xl p-4">
      <TemplateChoices
        {...props}
        value={value}
        onChange={(next) => {
          setValue(next)
          props.onChange(next)
        }}
      />
    </div>
  )
}
const meta = {
  title: 'Brainstorming/内容模板',
  component: TemplateChoices,
  render: (args) => <Preview {...args} />,
  args: { value: 'brainstorm', onChange: fn(), disabled: false },
  beforeEach: async () => {
    queryClient.removeQueries({ queryKey: ['templates'] })
    await initializeI18n('zh-CN')
  },
} satisfies Meta<typeof TemplateChoices>
export default meta
type Story = StoryObj<typeof meta>

export const SearchAndSelect: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    const search = canvas.getByRole('searchbox', { name: '搜索内容模板' })
    await expect(
      await canvas.findByRole('button', { name: '选择头脑风暴工作流模板' }),
    ).toHaveAttribute('aria-pressed', 'true')
    await userEvent.type(search, 'research')
    await expect(canvas.getByRole('button', { name: '选择用户研究计划模板' })).toBeVisible()
    await expect(canvas.queryByRole('button', { name: '选择项目计划模板' })).not.toBeInTheDocument()
    await userEvent.click(canvas.getByRole('button', { name: '选择用户研究计划模板' }))
    await expect(args.onChange).toHaveBeenLastCalledWith('user-research')
    await userEvent.clear(search)
    await userEvent.type(search, 'no-such-preset')
    await expect(canvas.getByRole('status')).toHaveTextContent('没有匹配的内容模板')
    await userEvent.click(canvas.getByRole('button', { name: '不使用模板' }))
    await expect(args.onChange).toHaveBeenLastCalledWith('blank')
    await expect(canvas.getByRole('button', { name: '不使用模板' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await userEvent.click(canvas.getByRole('button', { name: '清除模板搜索' }))
    await expect(canvas.getByRole('button', { name: '选择六顶思考帽模板' })).toBeVisible()
    canvas.getByRole('button', { name: '选择六顶思考帽模板' }).focus()
    await userEvent.keyboard('{Enter}')
    await expect(args.onChange).toHaveBeenLastCalledWith('six-hats')
  },
}

export const ReactiveLanguage: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(
      await canvas.findByRole('button', { name: '选择头脑风暴工作流模板' }),
    ).toBeVisible()
    await initializeI18n('en')
    await expect(canvas.getByRole('searchbox', { name: 'Search content templates' })).toBeVisible()
    await expect(
      canvas.getByRole('button', { name: 'Choose Guided brainstorming template' }),
    ).toHaveAttribute('aria-pressed', 'true')
    await initializeI18n('zh-CN')
  },
}

export const Disabled: Story = {
  args: { disabled: true },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('searchbox', { name: '搜索内容模板' })).toBeDisabled()
    for (const button of canvas.getAllByRole('button')) await expect(button).toBeDisabled()
    await expect(args.onChange).not.toHaveBeenCalled()
  },
}

export const FailedCatalog: Story = {
  beforeEach: () =>
    installPlatformAPI({
      ...createStoryDesktop(),
      listTemplates: fn<DesktopAPI['listTemplates']>()
        .mockRejectedValueOnce(new Error('Unavailable'))
        .mockResolvedValueOnce(fixtureCatalog),
    }),
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await expect(await canvas.findByRole('alert')).toHaveTextContent('内容模板加载失败')
    await userEvent.click(canvas.getByRole('button', { name: '不使用模板' }))
    await expect(args.onChange).toHaveBeenLastCalledWith('blank')
    await userEvent.click(canvas.getByRole('button', { name: '重新加载模板' }))
    await expect(
      await canvas.findByRole('button', { name: '选择头脑风暴工作流模板' }),
    ).toBeVisible()
  },
}

export const EmptyCatalog: Story = {
  beforeEach: () =>
    installPlatformAPI({
      ...createStoryDesktop(),
      listTemplates: () => Promise.resolve({ version: 1, templates: [] }),
    }),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(await canvas.findByText('暂无内容模板')).toBeVisible()
    await expect(canvas.getByRole('button', { name: '不使用模板' })).toBeEnabled()
  },
}

export const LoadingCatalog: Story = {
  beforeEach: () =>
    installPlatformAPI({
      ...createStoryDesktop(),
      listTemplates: () => new Promise(() => undefined),
    }),
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await expect(await canvas.findByRole('status')).toHaveTextContent('正在加载内容模板…')
    await userEvent.click(canvas.getByRole('button', { name: '不使用模板' }))
    await expect(args.onChange).toHaveBeenLastCalledWith('blank')
  },
}
