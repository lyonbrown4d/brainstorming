import '@renderer/styles/ui.css'
import '@renderer/styles/base.scss'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, userEvent, within, waitFor } from 'storybook/test'
import { applyCommand, createDocument } from '@core'
import { PresentationWorkspace } from '@renderer/components/presentation/PresentationWorkspace'
import {
  closePresentationWorkspace,
  openPresentationComposer,
  setPresentationMode,
  showPresentationStep,
  usePresentation,
} from '@renderer/state/presentation'
import { useEditor } from '@renderer/state/editor'
import { initializeI18n } from '@renderer/i18n'
import { serializedDocumentSnapshot } from '@renderer/state/documentSnapshot'
import { deserializeWorkbook } from '@core'

const meta = {
  title: 'Brainstorming/演示页面',
  component: PresentationWorkspace,
  parameters: { layout: 'fullscreen' },
  decorators: [
    (Story) => (
      <div className="h-screen">
        <Story />
      </div>
    ),
  ],
  beforeEach: async () => {
    await initializeI18n('zh-CN')
    closePresentationWorkspace()
    useEditor.getState().replace(
      applyCommand(createDocument('周末出行'), {
        type: 'batch',
        commands: [
          { type: 'addTopic', id: 'plan', parentId: 'root', title: '行程安排' },
          { type: 'addTopic', id: 'morning', parentId: 'plan', title: '周六上午 · 海边散步' },
          { type: 'addTopic', id: 'evening', parentId: 'plan', title: '周六傍晚 · 日落拍照' },
          { type: 'addTopic', id: 'hotel', parentId: 'root', title: '住宿信息' },
          { type: 'setTopicStyle', topicId: 'morning', style: { shape: 'card', fill: '#e3f4f2' } },
          {
            type: 'setTopicStyle',
            topicId: 'evening',
            style: { shape: 'sticky', fill: '#fff1cc' },
          },
          { type: 'setTopicNotes', topicId: 'plan', notes: '按时间介绍安排，住宿放在后续页面。' },
          {
            type: 'setPresentation',
            steps: [
              { topicId: 'root' },
              { topicId: 'plan', layout: 'structure', reveal: 'items' },
              { topicId: 'hotel' },
            ],
          },
        ],
      }),
    )
    openPresentationComposer()
    return closePresentationWorkspace
  },
} satisfies Meta<typeof PresentationWorkspace>
export default meta
type Story = StoryObj<typeof meta>

export const Composer: Story = {}
export const Audience: Story = {
  beforeEach: () => {
    showPresentationStep(1)
  },
}
export const EnglishAudience: Story = {
  beforeEach: async () => {
    await initializeI18n('en')
    showPresentationStep(0)
  },
}
export const Presenter: Story = {
  beforeEach: () => {
    showPresentationStep(1)
    setPresentationMode('presenter')
  },
}
export const ArrangeAndPlay: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(await canvas.findByRole('button', { name: '2. 行程安排' }))
    await userEvent.click(canvas.getByRole('button', { name: '列表' }))
    await expect(useEditor.getState().history.document.presentation?.[1]?.layout).toBe('list')
    const notes = canvas.getByRole('textbox', { name: '演讲备注' })
    const originalNotes = notes.textContent
    await userEvent.type(notes, '先介绍交通。')
    const history = useEditor.getState().history
    await expect(
      deserializeWorkbook(serializedDocumentSnapshot(useEditor.getState())).sheets[0]?.document
        .presentation?.[1]?.notes,
    ).toBe(`${originalNotes}先介绍交通。`)
    await expect(useEditor.getState().history).toBe(history)
    useEditor.getState().commitDraft()
    await expect(canvas.getByRole('textbox', { name: '演讲备注' })).toBe(notes)
    await expect(notes).toHaveFocus()
    await userEvent.type(notes, '再介绍住宿。')
    // Native menu / embedded HTML clicks do not necessarily move focus or dispatch blur.
    canvas.getByRole('button', { name: '预览当前页' }).click()
    await expect(await canvas.findByRole('region', { name: '观众画面' })).toBeVisible()
    await expect(useEditor.getState().history.document.presentation?.[1]?.notes).toBe(
      `${originalNotes}先介绍交通。再介绍住宿。`,
    )
    await userEvent.keyboard(' ')
    await waitFor(() => expect(usePresentation.getState().itemIndex).toBe(1))
    const firstItem = canvas.getByRole('region', { name: '观众画面' }).querySelector('article')
    if (!firstItem) throw new Error('The first revealed item is missing')
    const firstHeight = firstItem.getBoundingClientRect().height
    await userEvent.keyboard(' ')
    await expect(usePresentation.getState().itemIndex).toBe(2)
    await expect(canvas.getByRole('region', { name: '观众画面' }).querySelector('article')).toBe(
      firstItem,
    )
    await expect(Math.abs(firstItem.getBoundingClientRect().height - firstHeight)).toBeLessThan(2)
    await userEvent.keyboard('{ArrowRight}')
    await expect(usePresentation.getState().index).toBe(2)
    await userEvent.keyboard('{Escape}')
    await expect(canvas.getByRole('region', { name: '演示编排' })).toBeVisible()
  },
}

export const StyleAndPlay: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const topics = useEditor.getState().history.document.topics
    await userEvent.click(canvas.getByRole('tab', { name: '标题' }))
    await userEvent.click(canvas.getByRole('combobox', { name: '字号比例' }))
    await userEvent.click(within(document.body).getByRole('option', { name: '125%' }))
    await userEvent.click(canvas.getByRole('combobox', { name: '对齐' }))
    await userEvent.click(within(document.body).getByRole('option', { name: '居中' }))
    await expect(
      useEditor.getState().history.document.presentation?.[0]?.appearance?.title,
    ).toEqual({ scale: 1.25, align: 'center' })
    await expect(useEditor.getState().history.document.topics).toBe(topics)
    await userEvent.click(canvas.getByRole('button', { name: '预览当前页' }))
    const audience = await canvas.findByRole('region', { name: '观众画面' })
    await expect(within(audience).getByRole('heading', { name: '周末出行' })).toHaveStyle({
      textAlign: 'center',
    })
    await userEvent.keyboard('{Escape}')
    await userEvent.click(canvas.getByRole('button', { name: '恢复本页默认样式' }))
    await expect(
      useEditor.getState().history.document.presentation?.[0]?.appearance,
    ).toBeUndefined()
    useEditor.getState().undo()
    await waitFor(() =>
      expect(
        useEditor.getState().history.document.presentation?.[0]?.appearance?.title?.scale,
      ).toBe(1.25),
    )
  },
}
