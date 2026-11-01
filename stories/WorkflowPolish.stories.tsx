import { storyShortcut } from '@stories/keyboard'
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClient } from '@renderer/lib/queryClient'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, userEvent, waitFor, within } from 'storybook/test'
import { applyCommand, createDocument } from '@core'
import { DockToolbar } from '@renderer/components/DockToolbar'
import { DocumentTabs } from '@renderer/components/DocumentTabs'
import { MemoryRouter } from 'react-router'
import { App } from '@renderer/App'
import { AppearanceProvider } from '@renderer/components/appearance/AppearanceProvider'
import { setInkMode } from '@renderer/state/canvasInk'
import { TopicStyleActions } from '@renderer/components/metadata/TopicStyleActions'
import { Button } from '@renderer/components/ui/button'
import { useCanvasPreferences } from '@renderer/state/canvasPreferences'
import { useEditor } from '@renderer/state/editor'
import { setSelectedTopics } from '@renderer/state/selection'
import { useCopiedTopicStyle } from '@renderer/state/topicStyleActions'
import { openDocumentTab } from '@renderer/state/documentTabs'
import { useWorkspace } from '@renderer/state/workspace'

const FullWorkspace = ({ home = false }: { home?: boolean }) => (
  <div className="h-screen">
    <AppearanceProvider>
      <MemoryRouter {...(home ? { initialEntries: ['/home'] } : {})}>
        <App />
      </MemoryRouter>
    </AppearanceProvider>
  </div>
)

const WorkflowPreview = () => (
  <QueryClientProvider client={queryClient}>
    <div className="relative h-screen bg-canvas p-12">
      <DocumentTabs />
      <div className="w-64 pt-12">
        <TopicStyleActions />
      </div>
      <Button
        onClick={() => {
          setSelectedTopics(['b'])
        }}
      >
        选择目标主题
      </Button>
      <Button
        onClick={() => {
          useEditor.getState().undo()
        }}
      >
        撤销样式
      </Button>
      <DockToolbar>
        <Button>底部操作</Button>
      </DockToolbar>
    </div>
  </QueryClientProvider>
)

const meta = {
  title: 'Brainstorming/连续工作流程',
  component: WorkflowPreview,
  parameters: { layout: 'fullscreen' },
  beforeEach: () => {
    setInkMode('select')
    useEditor.setState({ busy: false, editingId: null, outlineOpen: false, inspectorOpen: false })
    useCanvasPreferences.setState({ topDockPinned: false, bottomDockPinned: false })
    useCopiedTopicStyle.setState({ style: null })
    let document = createDocument('工作流程')
    for (const id of ['a', 'b'])
      document = applyCommand(document, { type: 'addTopic', parentId: 'root', id, title: id })
    document = applyCommand(document, {
      type: 'setTopicStyle',
      topicId: 'a',
      style: { fill: '#123456', shape: 'ellipse' },
    })
    openDocumentTab(document, null, false, true)
    setSelectedTopics(['a'])
  },
} satisfies Meta<typeof WorkflowPreview>
export default meta
type Story = StoryObj<typeof meta>

export const IndependentPins: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const top = canvas.getByRole('button', { name: '展开导图标签栏' })
    const bottom = canvas.getByRole('button', { name: '展开浮动工具栏' })
    await expect(top).toHaveTextContent('工作流程')
    await expect(top).toHaveTextContent('1 份导图')
    await userEvent.click(top)
    await userEvent.click(canvas.getByRole('button', { name: '固定文档标签' }))
    await userEvent.unhover(top)
    await userEvent.keyboard('{Escape}')
    await expect(top).toHaveAttribute('aria-expanded', 'true')
    await expect(bottom).toHaveAttribute('aria-expanded', 'false')
    await userEvent.click(bottom)
    await userEvent.click(canvas.getByRole('button', { name: '固定画布工具栏' }))
    await userEvent.click(canvas.getByRole('button', { name: '自动收起文档标签' }))
    await userEvent.keyboard('{Escape}')
    await expect(top).toHaveAttribute('aria-expanded', 'false')
    await expect(bottom).toHaveAttribute('aria-expanded', 'true')
    await userEvent.click(canvas.getByRole('button', { name: '自动收起画布工具栏' }))
    await userEvent.keyboard('{Escape}')
    await expect(bottom).toHaveAttribute('aria-expanded', 'false')
  },
}

export const SharedStyleAndUndo: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('button', { name: '粘贴样式到选中主题（1）' })).toBeDisabled()
    await userEvent.click(canvas.getByRole('button', { name: '复制主题样式' }))
    await userEvent.click(canvas.getByRole('button', { name: '选择目标主题' }))
    const before = useEditor.getState().history.document
    await userEvent.click(canvas.getByRole('button', { name: '粘贴样式到选中主题（1）' }))
    await expect(useEditor.getState().history.document.topics.b?.style?.fill).toBe('#123456')
    await userEvent.click(canvas.getByRole('button', { name: '撤销样式' }))
    await expect(useEditor.getState().history.document).toEqual(before)
  },
}

export const QuickBlankMap: Story = {
  render: () => <FullWorkspace home />,
  beforeEach: () => {
    useWorkspace.setState({ screen: 'home', hasDocument: false })
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: '空白导图' }))
    await waitFor(() => expect(useWorkspace.getState().screen).toBe('editor'))
    await expect(Object.keys(useEditor.getState().history.document.topics)).toEqual(['root'])
    await waitFor(() => expect(useEditor.getState().editingId).toBe('root'))
    await expect(useEditor.getState().editSelection).toBe('all')
    const title = await canvas.findByRole('textbox', { name: '编辑主题标题' }, { timeout: 15_000 })
    await expect(title).toHaveFocus()
    useEditor.getState().cancelEdit()
  },
}

export const CanvasStyleMenu: Story = {
  render: () => <FullWorkspace />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const page = within(canvasElement.ownerDocument.body)
    const source = await canvas.findByTestId('topic-a', {}, { timeout: 15_000 })
    await waitFor(() => expect(canvasElement.querySelector('[aria-busy="true"]')).toBeNull(), {
      timeout: 15_000,
    })
    await userEvent.pointer({ target: source, keys: '[MouseRight]' })
    await userEvent.hover(await page.findByText('复制与应用样式'))
    await userEvent.click(await page.findByRole('menuitem', { name: '复制主题样式' }))
    const target = canvas.getByTestId('topic-b')
    await userEvent.pointer({ target, keys: '[MouseRight]' })
    await userEvent.hover(await page.findByText('复制与应用样式'))
    const before = useEditor.getState().history.document
    await userEvent.click(await page.findByRole('menuitem', { name: '粘贴样式到选中主题（1）' }))
    await expect(useEditor.getState().history.document.topics.b?.style?.fill).toBe('#123456')
    await userEvent.keyboard(storyShortcut('{Meta>}z{/Meta}'))
    await waitFor(() => expect(useEditor.getState().history.document).toEqual(before))
  },
}
