import '@renderer/styles/ui.css'
import '@renderer/styles/base.css'
import { useEffect, useState } from 'react'
import { MemoryRouter, useLocation } from 'react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, userEvent, waitFor, within } from 'storybook/test'
import { createDocument } from '@core'
import type { ContentSearchResult } from '@shared/contentSearch'
import { TopicEditor } from '@renderer/components/TopicEditor'
import { CommandPalette } from '@renderer/components/commands/CommandPalette'
import { CommandPaletteTrigger } from '@renderer/components/commands/CommandPaletteTrigger'
import { AppearanceProvider } from '@renderer/components/appearance/AppearanceProvider'
import { SettingsRoute } from '@renderer/routing/SettingsRoute'
import { useKeyboardShortcuts } from '@renderer/hooks/useKeyboardShortcuts'
import { initializeI18n } from '@renderer/i18n'
import { installPlatformAPI } from '@renderer/lib/desktop'
import { createStoryDesktop } from '@stories/desktopBridge'
import { openDocumentTab, useDocumentTabs } from '@renderer/state/documentTabs'
import { useEditor } from '@renderer/state/editor'
import { useWorkspace } from '@renderer/state/workspace'
import { usePresentation } from '@renderer/state/presentation'
import { usePasswordPrompt } from '@renderer/state/password'
import { useCommandPaletteState } from '@renderer/state/commandPalette'
import { startContentIndexSync } from '@renderer/state/contentIndex'

let result: ContentSearchResult
const nativeSearch = fn((): Promise<readonly ContentSearchResult[]> => Promise.resolve([]))
const PalettePreview = () => {
  const location = useLocation()
  useKeyboardShortcuts()
  useEffect(startContentIndexSync, [])
  return (
    <div className="h-dvh bg-canvas p-8 text-foreground">
      <div className="flex items-center justify-between rounded-lg border bg-background p-3">
        <span className="text-sm font-medium">Brainstorming</span>
        <CommandPaletteTrigger />
      </div>
      <output aria-label="当前路径" className="sr-only">
        {location.pathname}
      </output>
      <section className="mt-8 max-w-sm rounded-lg border bg-background p-4">
        <TopicEditor id="root" title="当前导图" surface="inspector" />
      </section>
      <CommandPalette />
      <SettingsRoute />
    </div>
  )
}
const Preview = () => {
  const [client] = useState(() => new QueryClient())
  return (
    <QueryClientProvider client={client}>
      <AppearanceProvider>
        <MemoryRouter initialEntries={['/home']}>
          <PalettePreview />
        </MemoryRouter>
      </AppearanceProvider>
    </QueryClientProvider>
  )
}
const meta = {
  title: 'Brainstorming/命令面板',
  component: Preview,
  parameters: { layout: 'fullscreen' },
  beforeEach: async () => {
    await initializeI18n('zh-CN')
    useCommandPaletteState.setState({ open: false, returnFocus: null })
    usePresentation.setState({ playing: false, workspaceMode: null })
    usePasswordPrompt.setState({ request: null })
    useWorkspace.setState(useWorkspace.getInitialState(), true)
    useDocumentTabs.setState({ tabs: [], activeId: null, recovery: [] })
    useEditor.setState({ busy: false, editingId: null })
    openDocumentTab(createDocument('当前导图'), null, false, true)
    useEditor.setState({ outlineOpen: false, inspectorOpen: false })
    const firstSheet = useEditor.getState().activeSheetId
    useEditor.getState().addDocumentSheet(createDocument('访谈结论', 'interviews'))
    const editor = useEditor.getState()
    result = {
      workbookId: editor.workbook.id,
      workbookTitle: '当前导图',
      sheetId: editor.activeSheetId,
      sheetName: '访谈结论',
      topicId: 'root',
      title: '访谈结论',
      snippet: '用户需要更快整理访谈内容',
    }
    editor.switchSheet(firstSheet)
    useWorkspace.setState({ screen: 'editor', hasDocument: true })
    nativeSearch.mockReset().mockResolvedValue([])
    return installPlatformAPI({ ...createStoryDesktop(), searchContent: nativeSearch })
  },
} satisfies Meta<typeof Preview>
export default meta
type Story = StoryObj<typeof meta>

export const SearchAndKeyboard: Story = {
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body)
    const trigger = page.getByRole('button', { name: '命令面板' })
    await userEvent.click(trigger)
    const dialog = await page.findByRole('dialog', { name: '命令面板' })
    const input = within(dialog).getByRole('combobox')
    await expect(input).toHaveFocus()
    await userEvent.type(input, '不存在的操作')
    await expect(await within(dialog).findByText('没有匹配的操作或内容')).toBeVisible()
    await userEvent.clear(input)
    await userEvent.type(input, 'outline')
    await expect(within(dialog).getByRole('option', { name: '显示或隐藏大纲' })).toBeVisible()
    await userEvent.keyboard('{Enter}')
    await waitFor(() => expect(useEditor.getState().outlineOpen).toBe(true))
    await expect(page.queryByRole('dialog')).not.toBeInTheDocument()
    await userEvent.keyboard('{Meta>}{Shift>}p{/Shift}{/Meta}')
    await expect(await page.findByRole('dialog', { name: '命令面板' })).toBeVisible()
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(page.queryByRole('dialog')).not.toBeInTheDocument())
    await expect(trigger).toHaveFocus()
    await expect(page.getByLabelText('当前路径')).toHaveTextContent('/home')
  },
}

export const CompositionAndInputHistory: Story = {
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body)
    const editor = page.getByRole('textbox', { name: '主题名称' })
    await userEvent.click(editor)
    editor.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true, data: '' }))
    await userEvent.click(page.getByRole('button', { name: '命令面板' }))
    await expect(page.queryByRole('dialog')).not.toBeInTheDocument()
    await expect(editor).toHaveFocus()
    editor.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: '' }))
    window.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'p',
        metaKey: true,
        shiftKey: true,
        isComposing: true,
        bubbles: true,
      }),
    )
    await expect(page.queryByRole('dialog')).not.toBeInTheDocument()
    await userEvent.click(page.getByRole('button', { name: '命令面板' }))
    const dialog = await page.findByRole('dialog', { name: '命令面板' })
    const input = within(dialog).getByRole('combobox')
    const history = useEditor.getState().history
    input.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', isComposing: true, bubbles: true }),
    )
    await expect(dialog).toBeVisible()
    await userEvent.type(input, '中文输入')
    await userEvent.keyboard('{Meta>}z{/Meta}')
    await expect(useEditor.getState().history).toBe(history)
    await expect(dialog).toBeVisible()
    await userEvent.keyboard('{Escape}')
  },
}

export const AvailabilityAndModalGuard: Story = {
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body)
    useWorkspace.setState({ screen: 'home', hasDocument: false })
    await userEvent.click(page.getByRole('button', { name: '命令面板' }))
    const dialog = await page.findByRole('dialog', { name: '命令面板' })
    await expect(within(dialog).getByRole('option', { name: /^保存导图/ })).toHaveAttribute(
      'aria-disabled',
      'true',
    )
    await expect(within(dialog).getByRole('option', { name: /^新建导图/ })).toHaveAttribute(
      'aria-disabled',
      'false',
    )
    useEditor.setState({ busy: true })
    await waitFor(() =>
      expect(within(dialog).getByRole('option', { name: /^新建导图/ })).toHaveAttribute(
        'aria-disabled',
        'true',
      ),
    )
    await userEvent.keyboard('{Escape}')
    useEditor.setState({ busy: false })
    usePasswordPrompt.setState({ request: { id: 1, title: '密码' } })
    await userEvent.keyboard('{Meta>}{Shift>}p{/Shift}{/Meta}')
    await expect(page.queryByRole('dialog')).not.toBeInTheDocument()
    usePasswordPrompt.setState({ request: null })
    usePresentation.setState({ playing: true })
    await userEvent.keyboard('{Meta>}{Shift>}p{/Shift}{/Meta}')
    await expect(page.queryByRole('dialog')).not.toBeInTheDocument()
    usePresentation.setState({ playing: false })
  },
}

export const SettingsNavigation: Story = {
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body)
    await userEvent.click(page.getByRole('button', { name: '命令面板' }))
    const dialog = await page.findByRole('dialog', { name: '命令面板' })
    await userEvent.type(within(dialog).getByRole('combobox'), 'settings')
    await userEvent.keyboard('{Enter}')
    await expect(
      await page.findByRole('dialog', { name: '应用设置' }, { timeout: 15_000 }),
    ).toBeVisible()
    await userEvent.keyboard('{Meta>}{Shift>}p{/Shift}{/Meta}')
    await expect(page.getAllByRole('dialog')).toHaveLength(1)
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(page.queryByRole('dialog')).not.toBeInTheDocument())
    await expect(page.getByLabelText('当前路径')).toHaveTextContent('/home')
  },
}

export const NativeContentResults: Story = {
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body)
    nativeSearch.mockResolvedValue([result])
    await userEvent.click(page.getByRole('button', { name: '命令面板' }))
    const dialog = await page.findByRole('dialog', { name: '命令面板' })
    await userEvent.type(within(dialog).getByRole('combobox'), '访谈')
    const hit = await within(dialog).findByRole('option', { name: /访谈结论.*用户需要/ })
    await expect(hit).toBeVisible()
    await expect(nativeSearch).toHaveBeenCalledWith({ query: '访谈', limit: 12 })
    await expect(within(dialog).queryByText('没有匹配的操作或内容')).not.toBeInTheDocument()
    await userEvent.keyboard('{ArrowDown}')
    await expect(hit).toHaveAttribute('aria-selected', 'true')
    await userEvent.keyboard('{Enter}')
    await waitFor(() => expect(useEditor.getState().activeSheetId).toBe(result.sheetId))
    await expect(useEditor.getState().selectedId).toBe('root')
    await expect(page.queryByRole('dialog')).not.toBeInTheDocument()
  },
}

export const NativeSearchFailure: Story = {
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body)
    nativeSearch.mockRejectedValue(new Error('Index unavailable'))
    await userEvent.click(page.getByRole('button', { name: '命令面板' }))
    const dialog = await page.findByRole('dialog', { name: '命令面板' })
    await userEvent.type(within(dialog).getByRole('combobox'), 'zoom')
    await expect(await within(dialog).findByText('导图内容暂时无法搜索，请稍后重试')).toBeVisible()
    await expect(within(dialog).getByRole('option', { name: '放大' })).toBeVisible()
    await userEvent.keyboard('{Escape}')
  },
}

export const DraftShortcutFromEditor: Story = {
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body)
    const editor = page.getByRole('textbox', { name: '主题名称' })
    await userEvent.click(editor)
    await userEvent.clear(editor)
    await userEvent.type(editor, '尚未结束的主题草稿')
    await waitFor(() => expect(useEditor.getState().draft).toBe('尚未结束的主题草稿'))
    await userEvent.keyboard('{Meta>}{Shift>}p{/Shift}{/Meta}')
    await expect(await page.findByRole('dialog', { name: '命令面板' })).toBeVisible()
    await expect(useEditor.getState().history.document.title).toBe('尚未结束的主题草稿')
    await expect(useEditor.getState().editingId).toBeNull()
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(editor).toHaveFocus())
    await expect(editor).toHaveTextContent('尚未结束的主题草稿')
  },
}
