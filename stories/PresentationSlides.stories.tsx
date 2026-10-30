import '@renderer/styles/ui.css'
import '@renderer/styles/base.scss'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, within } from 'storybook/test'
import { applyCommand, createDocument, type MindMapDocument, type PresentationStep } from '@core'
import { PresentationSlide } from '@renderer/components/presentation/PresentationSlide'
import { buildPresentationSlide } from '@renderer/components/presentation/slideModel'
import beach from '@project/crates/brainstorming-engine/builtin-art/originals/beach-rest.png?inline'

const fixture = applyCommand(createDocument('产品探索与交付计划'), {
  type: 'batch',
  commands: [
    { type: 'addTopic', id: 'discover', parentId: 'root', title: '理解问题' },
    { type: 'addTopic', id: 'validate', parentId: 'root', title: '验证方案' },
    { type: 'addTopic', id: 'deliver', parentId: 'root', title: '安排交付' },
    { type: 'addTopic', id: 'review', parentId: 'root', title: '回顾改进' },
    { type: 'addTopic', id: 'people', parentId: 'discover', title: '了解使用者' },
    { type: 'addTopic', id: 'scene', parentId: 'discover', title: '还原真实场景' },
    { type: 'addTopic', id: 'scope', parentId: 'discover', title: '确定问题边界' },
    { type: 'addTopic', id: 'interview', parentId: 'people', title: '访谈与观察' },
    { type: 'addTopic', id: 'needs', parentId: 'people', title: '整理需求与优先级' },
    { type: 'addTopic', id: 'path', parentId: 'scene', title: '记录现有工作流程' },
    { type: 'addTopic', id: 'friction', parentId: 'scene', title: '找出反复出现的阻碍' },
    { type: 'addTopic', id: 'goals', parentId: 'scope', title: '明确本次目标' },
    { type: 'addTopic', id: 'constraints', parentId: 'scope', title: '核对资源与时间约束' },
    { type: 'setTopicStyle', topicId: 'discover', style: { shape: 'hexagon' } },
    { type: 'setTopicStyle', topicId: 'validate', style: { shape: 'diamond' } },
    { type: 'setTopicStyle', topicId: 'deliver', style: { shape: 'card' } },
    { type: 'setTopicStyle', topicId: 'review', style: { shape: 'capsule' } },
    { type: 'setTopicNotes', topicId: 'review', notes: '记录本次决策，整理需要继续验证的问题。' },
    { type: 'setTopicMetadata', topicId: 'discover', metadata: { markers: ['idea'] } },
  ],
})

const page = (document: MindMapDocument, step: PresentationStep) => {
  const slide = buildPresentationSlide(document, step)
  if (!slide) throw new Error('Missing slide fixture')
  return { document, slide, index: step.topicId === 'root' ? 0 : 1, total: 5 }
}
const photo = applyCommand(fixture, {
  type: 'setTopicImage',
  topicId: 'discover',
  width: 512,
  height: 512,
  asset: { id: 'beach', name: 'beach.png', mimeType: 'image/png', data: beach.split(',')[1] ?? '' },
})
const meta = {
  title: 'Brainstorming/演示版式',
  component: PresentationSlide,
  parameters: { layout: 'fullscreen' },
  decorators: [
    (Story) => (
      <div className="flex min-h-screen items-center justify-center bg-canvas p-8">
        <div className="w-full max-w-6xl">
          <Story />
        </div>
      </div>
    ),
  ],
  args: page(fixture, { topicId: 'root' }),
} satisfies Meta<typeof PresentationSlide>
export default meta
type Story = StoryObj<typeof meta>

export const Cover: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('heading', { name: fixture.title })).toBeVisible()
    await expect(canvas.getAllByRole('article')).toHaveLength(4)
  },
}
export const Structure: Story = { args: page(fixture, { topicId: 'discover' }) }
export const List: Story = { args: page(fixture, { topicId: 'discover', layout: 'list' }) }
export const ImageAndText: Story = {
  args: page(photo, { topicId: 'discover' }),
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole('img', { name: '理解问题' })).toHaveStyle({
      objectFit: 'contain',
    })
    await expect(within(canvasElement).getAllByRole('article')).toHaveLength(3)
  },
}
export const CoverWithImage: Story = {
  args: page(
    applyCommand(photo, {
      type: 'setTopicImage',
      topicId: 'root',
      width: 512,
      height: 512,
      asset: {
        id: 'cover-beach',
        name: 'beach.png',
        mimeType: 'image/png',
        data: beach.split(',')[1] ?? '',
      },
    }),
    { topicId: 'root' },
  ),
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getAllByRole('article')).toHaveLength(4)
    await expect(within(canvasElement).getByRole('img', { name: fixture.title })).toBeVisible()
  },
}
export const Focus: Story = {
  args: page(fixture, { topicId: 'review' }),
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole('heading', { name: '回顾改进' })).toBeVisible()
    await expect(
      within(canvasElement).getByText('记录本次决策，整理需要继续验证的问题。'),
    ).toBeVisible()
    await expect(within(canvasElement).queryAllByRole('article')).toHaveLength(0)
  },
}
export const Night: Story = {
  args: page(applyCommand(fixture, { type: 'setDocumentSettings', settings: { theme: 'night' } }), {
    topicId: 'discover',
  }),
}
export const LongTitle: Story = {
  play: async ({ canvasElement }) => {
    const title = within(canvasElement).getByRole('heading', { level: 2 })
    await expect(title.scrollHeight).toBeLessThanOrEqual(title.clientHeight + 1)
  },
  args: page(
    applyCommand(fixture, {
      type: 'renameTopic',
      topicId: 'root',
      title: '围绕真实使用场景，梳理从问题发现、方案验证到交付回顾的完整项目计划',
    }),
    { topicId: 'root' },
  ),
}
export const ManyItems: Story = {
  args: page(
    applyCommand(fixture, {
      type: 'batch',
      commands: Array.from({ length: 9 }, (_, index) => ({
        type: 'addTopic' as const,
        id: `check-${index}`,
        parentId: 'deliver',
        title: `交付检查 ${index + 1} · 确认负责人和验收条件`,
      })),
    }),
    { topicId: 'deliver', layout: 'list' },
  ),
  play: async ({ canvasElement }) => {
    const articles = within(canvasElement).getAllByRole('article')
    await expect(articles).toHaveLength(6)
    for (const article of articles) {
      await expect(article.getBoundingClientRect().height).toBeGreaterThan(35)
      await expect(article.scrollHeight).toBeLessThanOrEqual(article.clientHeight + 1)
    }
  },
}
export const ExplicitStructure: Story = {
  args: page(fixture, { topicId: 'root', layout: 'structure' }),
}

export const CustomStyle: Story = {
  args: page(photo, {
    topicId: 'discover',
    appearance: {
      background: '#e8eee9',
      title: { color: '#204f39', scale: 1.25, align: 'center' },
      body: { scale: 0.9, bold: false },
      image: { fit: 'cover', position: 'right' },
    },
  }),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('heading', { name: '理解问题' })).toHaveStyle({
      color: 'rgb(32, 79, 57)',
      textAlign: 'center',
    })
    await expect(canvas.getByRole('img', { name: '理解问题' })).toHaveStyle({ objectFit: 'cover' })
  },
}
