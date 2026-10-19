import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, userEvent, waitFor, within } from 'storybook/test'
import { MemoryRouter, useLocation, useNavigate } from 'react-router'
import { applyWorkbookCommand, createDocument, createWorkbook } from '@core'
import { App } from '@renderer/App'
import { AppearanceProvider } from '@renderer/components/appearance/AppearanceProvider'
import { useEditor } from '@renderer/state/editor'
import { closePresentationWorkspace } from '@renderer/state/presentation'
import { useWorkspace } from '@renderer/state/workspace'
import { openDocumentTab, switchDocumentTab, useDocumentTabs } from '@renderer/state/documentTabs'
import { canonicalWorkspacePath, sheetPath } from '@renderer/routing/workspacePaths'
import { initializeI18n, translate } from '@renderer/i18n'

let firstTabId = ''
let otherTabId = ''
const RouteProbe = () => {
  const location = useLocation()
  const navigate = useNavigate()
  return (
    <div className="fixed right-4 bottom-14 z-[60] flex gap-2 rounded border bg-background p-2 text-xs">
      <button
        onClick={() => {
          void navigate(-1)
        }}
      >
        历史后退
      </button>
      <button
        onClick={() => {
          void navigate(1)
        }}
      >
        历史前进
      </button>
      <button
        onClick={() => {
          void navigate('/create/document/structure')
        }}
      >
        前往创建引导
      </button>
      <button
        onClick={() => {
          void navigate(sheetPath(otherTabId, 'other'))
        }}
      >
        前往另一导图
      </button>
      <output aria-label="当前路径">{location.pathname}</output>
    </div>
  )
}
const WorkspaceRoutePreview = () => (
  <div className="h-dvh">
    <AppearanceProvider>
      <MemoryRouter initialEntries={[canonicalWorkspacePath()]}>
        <App />
        <RouteProbe />
      </MemoryRouter>
    </AppearanceProvider>
  </div>
)
const meta = {
  title: 'Brainstorming/路由工作区',
  component: WorkspaceRoutePreview,
  parameters: { layout: 'fullscreen' },
  beforeEach: async () => {
    await initializeI18n('zh-CN')
    closePresentationWorkspace()
    useEditor.setState({ busy: false, editingId: null })
    useWorkspace.setState(useWorkspace.getInitialState(), true)
    useDocumentTabs.setState({ tabs: [], activeId: null, recovery: [] })
    const workbook = applyWorkbookCommand(createWorkbook(createDocument('路由导图', 'first')), {
      type: 'addSheet',
      sheet: { id: 'second', name: '第二张', document: createDocument('第二张', 'second') },
    })
    openDocumentTab(workbook, null, false, true)
    firstTabId = useDocumentTabs.getState().activeId ?? ''
    openDocumentTab(createDocument('另一导图', 'other'), null, false, true)
    otherTabId = useDocumentTabs.getState().activeId ?? ''
    switchDocumentTab(firstTabId)
    useEditor.setState({ outlineOpen: false, inspectorOpen: false })
  },
} satisfies Meta<typeof WorkspaceRoutePreview>
export default meta
type Story = StoryObj<typeof meta>

export const PreserveCanvasAndHistory: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const page = within(canvasElement.ownerDocument.body)
    const node = await canvas.findByTestId('topic-root')
    const history = useEditor.getState().history
    const currentPath = sheetPath(firstTabId, 'first')
    await expect(page.getByLabelText('当前路径')).toHaveTextContent(currentPath)
    await userEvent.click(canvas.getByRole('button', { name: '应用设置' }))
    await expect(
      await page.findByRole('dialog', { name: '应用设置' }, { timeout: 15_000 }),
    ).toBeVisible()
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(page.queryByRole('dialog')).not.toBeInTheDocument())
    await expect(canvas.getByTestId('topic-root')).toBe(node)
    await expect(useEditor.getState().history).toBe(history)
    await userEvent.click(canvas.getByRole('button', { name: translate('presentationComposer') }))
    await waitFor(() =>
      expect(page.getByLabelText('当前路径')).toHaveTextContent(`${currentPath}/presentation`),
    )
    await userEvent.click(canvas.getByRole('button', { name: translate('presentationBackToMap') }))
    await waitFor(() => expect(page.getByLabelText('当前路径')).toHaveTextContent(currentPath))
    await expect(canvas.getByTestId('topic-root')).toBe(node)
    await expect(useEditor.getState().history).toBe(history)
    await userEvent.click(page.getByRole('button', { name: '前往另一导图' }))
    await waitFor(() => expect(useEditor.getState().history.document.title).toBe('另一导图'))
    await userEvent.click(page.getByRole('button', { name: '历史后退' }))
    await waitFor(() => expect(useEditor.getState().history.document.title).toBe('路由导图'))
    await expect(page.getByLabelText('当前路径')).toHaveTextContent(currentPath)
    await expect(useDocumentTabs.getState().tabs).toHaveLength(2)
  },
}

export const CreationStepHistory: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const page = within(canvasElement.ownerDocument.body)
    await userEvent.click(page.getByRole('button', { name: '前往创建引导' }))
    await userEvent.click(await canvas.findByRole('tab', { name: '分析归纳' }))
    const structure = await canvas.findByRole('button', { name: '选择向右括号图' })
    await userEvent.click(structure)
    await userEvent.click(canvas.getByRole('button', { name: '下一步' }))
    await waitFor(() =>
      expect(page.getByLabelText('当前路径')).toHaveTextContent('/create/document/configuration'),
    )
    await userEvent.type(canvas.getByRole('textbox', { name: '文档名称' }), '未提交的发布计划')
    await userEvent.click(canvas.getByRole('button', { name: '选择项目计划模板' }))
    await userEvent.click(page.getByRole('button', { name: '历史后退' }))
    await waitFor(() =>
      expect(page.getByLabelText('当前路径')).toHaveTextContent('/create/document/structure'),
    )
    await expect(canvas.getByRole('button', { name: '选择向右括号图' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await userEvent.click(page.getByRole('button', { name: '历史前进' }))
    await expect(await canvas.findByRole('textbox', { name: '文档名称' })).toHaveValue(
      '未提交的发布计划',
    )
    await expect(canvas.getByRole('button', { name: '选择项目计划模板' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await userEvent.click(canvas.getByRole('button', { name: '应用设置' }))
    await expect(
      await page.findByRole('dialog', { name: '应用设置' }, { timeout: 15_000 }),
    ).toBeVisible()
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(page.queryByRole('dialog')).not.toBeInTheDocument())
    await expect(canvas.getByRole('textbox', { name: '文档名称' })).toHaveValue('未提交的发布计划')
    await userEvent.click(page.getByRole('button', { name: '历史后退' }))
    await userEvent.click(page.getByRole('button', { name: '历史后退' }))
    await expect(await canvas.findByTestId('topic-root')).toBeVisible()
    await userEvent.click(page.getByRole('button', { name: '历史前进' }))
    await userEvent.click(page.getByRole('button', { name: '历史前进' }))
    await expect(await canvas.findByRole('textbox', { name: '文档名称' })).toHaveValue(
      '未提交的发布计划',
    )
    await expect(useDocumentTabs.getState().tabs).toHaveLength(2)
  },
}

export const InspectorViewHistory: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const page = within(canvasElement.ownerDocument.body)
    const node = await canvas.findByTestId('topic-root')
    const history = useEditor.getState().history
    const base = sheetPath(firstTabId, 'first')
    await userEvent.click(canvas.getByRole('button', { name: translate('propertiesPanel') }))
    const inspector = within(
      await canvas.findByRole('complementary', { name: translate('propertiesPanel') }),
    )
    await waitFor(() =>
      expect(page.getByLabelText('当前路径')).toHaveTextContent(`${base}/style/topic`),
    )
    await userEvent.click(inspector.getByRole('tab', { name: translate('sheet') }))
    await waitFor(() =>
      expect(page.getByLabelText('当前路径')).toHaveTextContent(`${base}/style/canvas/structure`),
    )
    await userEvent.click(inspector.getByRole('tab', { name: translate('colors') }))
    await waitFor(() =>
      expect(page.getByLabelText('当前路径')).toHaveTextContent(`${base}/style/canvas/appearance`),
    )
    await userEvent.click(page.getByRole('button', { name: '历史后退' }))
    await waitFor(() =>
      expect(inspector.getByRole('tab', { name: translate('structureLabel735') })).toHaveAttribute(
        'aria-selected',
        'true',
      ),
    )
    await userEvent.click(page.getByRole('button', { name: '历史前进' }))
    await waitFor(() =>
      expect(inspector.getByRole('tab', { name: translate('colors') })).toHaveAttribute(
        'aria-selected',
        'true',
      ),
    )
    await userEvent.click(canvas.getByRole('button', { name: '应用设置' }))
    await expect(
      await page.findByRole('dialog', { name: '应用设置' }, { timeout: 15_000 }),
    ).toBeVisible()
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(page.queryByRole('dialog')).not.toBeInTheDocument())
    await expect(page.getByLabelText('当前路径')).toHaveTextContent(
      `${base}/style/canvas/appearance`,
    )
    await userEvent.click(
      inspector.getByRole('button', { name: translate('closePropertiesPanel') }),
    )
    await waitFor(() => expect(page.getByLabelText('当前路径')).toHaveTextContent(base))
    await expect(canvas.getByTestId('topic-root')).toBe(node)
    await expect(useEditor.getState().history).toBe(history)
  },
}
