import '@renderer/styles/ui.css'
import '@renderer/styles/base.css'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, userEvent, waitFor, within } from 'storybook/test'
import { applyCommand, createDocument } from '@core'
import { initializeI18n } from '@renderer/i18n'
import { useEditor } from '@renderer/state/editor'
import { TaskQuickControls } from '@renderer/components/metadata/TaskQuickControls'
import { TopicMetadataBadges } from '@renderer/components/metadata/TopicMetadataBadges'
import { SelectionMarkers } from '@renderer/components/workbench/SelectionMarkers'

const PriorityPreview = ({ multiple = false }: { multiple?: boolean }) => {
  const metadata = useEditor((state) => state.history.document.topics.root?.metadata)
  return (
    <div className="min-h-screen bg-background p-6 text-foreground">
      <div className="w-64 space-y-4 rounded-xl border p-4">
        {multiple ? (
          <SelectionMarkers ids={['root', 'child']} />
        ) : (
          <TaskQuickControls topicId="root" task={metadata?.task} />
        )}
        <div className="rounded-md border p-3 text-center" data-testid="priority-preview">
          <span>计划 / Plan</span>
          <TopicMetadataBadges topicId="root" metadata={metadata} />
        </div>
      </div>
    </div>
  )
}
const meta = {
  title: 'Brainstorming/优先级标记',
  component: PriorityPreview,
  parameters: { layout: 'fullscreen' },
  beforeEach: () => {
    useEditor.getState().replace(
      applyCommand(createDocument('优先级'), {
        type: 'addTopic',
        parentId: 'root',
        id: 'child',
        title: '主题',
        side: 'right',
      }),
    )
    useEditor.setState({ busy: false })
  },
} satisfies Meta<typeof PriorityPreview>
export default meta
type Story = StoryObj<typeof meta>

export const ChooseReplaceClear: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const picker = within(canvas.getByRole('radiogroup', { name: '选择优先级' }))
    const nine = picker.getByRole('radio', { name: '优先级 9' })
    await userEvent.click(nine)
    await expect(nine).toHaveAttribute('aria-checked', 'true')
    await expect(useEditor.getState().history.document.topics.root?.metadata?.task).toEqual({
      priority: 9,
    })
    await userEvent.click(nine)
    await expect(nine).toHaveAttribute('aria-checked', 'false')
    await expect(useEditor.getState().history.document.topics.root?.metadata?.task).toBeUndefined()
    await userEvent.click(picker.getByRole('radio', { name: '优先级 6' }))
    await userEvent.click(canvas.getByRole('button', { name: '更改优先级 6' }))
    const popover = within(await within(document.body).findByRole('dialog', { name: '选择优先级' }))
    await userEvent.click(popover.getByRole('radio', { name: '优先级 8' }))
    await waitFor(async () => {
      await expect(useEditor.getState().history.document.topics.root?.metadata?.task).toEqual({
        priority: 8,
      })
    })
    await userEvent.click(popover.getByRole('button', { name: '清除优先级' }))
    await waitFor(async () => {
      await expect(
        useEditor.getState().history.document.topics.root?.metadata?.task,
      ).toBeUndefined()
    })
    useEditor.getState().undo()
    await waitFor(async () =>
      expect(canvas.getByRole('button', { name: '更改优先级 8' })).toBeVisible(),
    )
    useEditor.getState().redo()
    await waitFor(async () =>
      expect(canvas.queryByRole('button', { name: '更改优先级 8' })).not.toBeInTheDocument(),
    )
  },
}
export const KeyboardAndBatch: Story = {
  args: { multiple: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const picker = within(canvas.getByRole('radiogroup', { name: '选择优先级' }))
    await userEvent.click(picker.getByRole('radio', { name: '优先级 1' }))
    await userEvent.keyboard('{End}')
    await waitFor(async () => expect(picker.getByRole('radio', { name: '优先级 9' })).toHaveFocus())
    await userEvent.keyboard(' ')
    await expect(picker.getByRole('radio', { name: '优先级 9' })).toHaveAttribute(
      'aria-checked',
      'true',
    )
    for (const id of ['root', 'child'])
      await expect(useEditor.getState().history.document.topics[id]?.metadata?.task).toEqual({
        priority: 9,
      })
    useEditor.getState().undo()
    await waitFor(async () =>
      expect(picker.getByRole('radio', { name: '优先级 1' })).toHaveAttribute(
        'aria-checked',
        'true',
      ),
    )
    for (const id of ['root', 'child'])
      await expect(useEditor.getState().history.document.topics[id]?.metadata?.task).toEqual({
        priority: 1,
      })
  },
}
export const DarkPriority: Story = {
  beforeEach: () => {
    document.documentElement.setAttribute('data-theme', 'dark')
    useEditor
      .getState()
      .command({ type: 'setTopicMetadata', topicId: 'root', metadata: { task: { priority: 9 } } })
    return () => {
      document.documentElement.removeAttribute('data-theme')
    }
  },
}
export const EnglishPriority: Story = {
  beforeEach: async () => {
    await initializeI18n('en')
    return () => initializeI18n('zh-CN')
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('radio', { name: 'Priority 9' }))
    await expect(canvas.getByRole('button', { name: 'Change priority 9' })).toBeVisible()
    await userEvent.click(canvas.getByRole('button', { name: 'Clear priority' }))
    await expect(useEditor.getState().history.document.topics.root?.metadata?.task).toBeUndefined()
  },
}
