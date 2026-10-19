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
  beforeEach: () => {
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
  },
  afterEach: closePresentationWorkspace,
} satisfies Meta<typeof PresentationWorkspace>
export default meta
type Story = StoryObj<typeof meta>

export const Composer: Story = {}
export const Audience: Story = {
  beforeEach: () => {
    showPresentationStep(1)
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
    await userEvent.clear(notes)
    await userEvent.type(notes, '先介绍交通。')
    const history = useEditor.getState().history
    await expect(
      deserializeWorkbook(serializedDocumentSnapshot(useEditor.getState())).sheets[0]?.document
        .presentation?.[1]?.notes,
    ).toBe('先介绍交通。')
    await expect(useEditor.getState().history).toBe(history)
    useEditor.getState().commitDraft()
    await expect(canvas.getByRole('textbox', { name: '演讲备注' })).toBe(notes)
    await expect(notes).toHaveFocus()
    await userEvent.type(notes, '再介绍住宿。')
    // Native menu / embedded HTML clicks do not necessarily move focus or dispatch blur.
    canvas.getByRole('button', { name: '预览当前页' }).click()
    await expect(await canvas.findByRole('region', { name: '观众画面' })).toBeVisible()
    await expect(useEditor.getState().history.document.presentation?.[1]?.notes).toBe(
      '先介绍交通。再介绍住宿。',
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
