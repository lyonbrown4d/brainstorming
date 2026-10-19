import '@renderer/styles/ui.css'
import '@renderer/styles/base.css'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, userEvent, within, waitFor } from 'storybook/test'
import { createDocument } from '@core'
import { TopicContentPanel } from '@renderer/components/TopicContentPanel'
import { useEditor } from '@renderer/state/editor'

const meta = {
  title: 'Brainstorming/贴图与插画',
  component: TopicContentPanel,
  args: { topicId: 'root' },
  decorators: [
    (Story) => (
      <div className="ml-auto w-[288px] p-4">
        <Story />
      </div>
    ),
  ],
  beforeEach: () => {
    useEditor.getState().replace(createDocument('素材', 'art-document'))
    useEditor.setState({ busy: false })
  },
} satisfies Meta<typeof TopicContentPanel>
export default meta
type Story = StoryObj<typeof meta>
export const SearchInsertReplaceUndo: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const page = within(canvasElement.ownerDocument.body)
    await userEvent.click(canvas.getByRole('button', { name: '贴图与插画' }))
    const search = await page.findByRole('searchbox', { name: '搜索素材或关键词' })
    await userEvent.type(search, '露营')
    await userEvent.click(await page.findByRole('button', { name: '添加图片 · 露营' }))
    await waitFor(() =>
      expect(useEditor.getState().history.document.topics.root?.image?.assetId).toBe(
        'builtin-art-v1-camping',
      ),
    )
    await userEvent.click(canvas.getByRole('button', { name: '贴图与插画' }))
    await expect(page.getByText('选择素材将替换当前主题图片')).toBeVisible()
    const secondSearch = page.getByRole('searchbox', { name: '搜索素材或关键词' })
    await userEvent.clear(secondSearch)
    await userEvent.type(secondSearch, 'city')
    await userEvent.click(await page.findByRole('button', { name: '替换图片 · 城市' }))
    await waitFor(() =>
      expect(useEditor.getState().history.document.topics.root?.image?.assetId).toBe(
        'builtin-art-v1-cityscape',
      ),
    )
    useEditor.getState().undo()
    await waitFor(() =>
      expect(useEditor.getState().history.document.topics.root?.image?.assetId).toBe(
        'builtin-art-v1-camping',
      ),
    )
  },
}
export const BrowseScenes: Story = {
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body)
    await userEvent.click(within(canvasElement).getByRole('button', { name: '贴图与插画' }))
    await userEvent.click(await page.findByRole('button', { name: /^场景$/ }))
    await expect(page.getByRole('button', { name: '添加图片 · 花园小屋' })).toBeVisible()
  },
}
