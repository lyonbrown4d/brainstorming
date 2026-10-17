import type { Meta, StoryObj } from '@storybook/react-vite'
import { inactiveMCP } from '@tests/fixtures/mcp'
import { expect, userEvent, within } from 'storybook/test'
import { queryClient } from '@renderer/lib/queryClient'
import type { DesktopAPI } from '@shared/contracts'
import { createDocument, createWorkbook, serializeWorkbook, createExampleDocument } from '@core'
import { useEditor } from '@renderer/state/editor'
import { useWorkspace } from '@renderer/state/workspace'
import { Toolbar } from '@renderer/components/Toolbar'
import { TooltipProvider } from '@renderer/components/ui/tooltip'
import '@renderer/styles/ui.css'
import '@renderer/styles/base.css'
import '@renderer/styles/chrome.css'
import '@renderer/styles/window.css'

const installRecentBridge = (getRecentFiles: DesktopAPI['getRecentFiles']) => {
  queryClient.removeQueries({ queryKey: ['recent-files'] })
  const previous = window.trelyx
  window.trelyx = {
    platform: 'macos',
    ...inactiveMCP,
    unlockDocument: () => Promise.reject(new Error('没有待解锁文件')),
    activateUnlockedDocument: () => Promise.resolve({ encrypted: false }),
    cancelUnlock: () => Promise.resolve(),
    getFileSecurity: () => Promise.resolve({ encrypted: false }),
    setFilePassword: () => Promise.resolve({ encrypted: false }),
    readLockedRecovery: () => Promise.resolve(null),
    listDocumentBackups: () => Promise.resolve([]),
    restoreDocumentBackup: () => Promise.reject(new Error('没有历史版本')),
    getAISettings: () => Promise.reject(new Error('尚未配置 AI')),
    saveAISettings: () => Promise.reject(new Error('尚未配置 AI')),
    generateMindMap: () => Promise.reject(new Error('尚未配置 AI')),
    cancelAIGeneration: () => Promise.resolve(),
    getRecentFiles,
    getWindowState: () => Promise.resolve({ focused: true, fullScreen: false }),
    onWindowStateChanged: () => () => undefined,
    selectAsset: () => Promise.resolve(null),
    exportFile: () => Promise.resolve(null),
    readTopicClipboard: () => Promise.resolve(''),
    writeTopicClipboard: () => Promise.resolve(),
    openExternal: () => Promise.resolve(),
    exportAsset: () => Promise.resolve(false),
    hasOpenFile: () => Promise.resolve(false),
    takeOpenFile: () => Promise.resolve(null),
    onOpenFile: () => () => undefined,
    openDocument: () => Promise.resolve(null),
    saveDocument: () => Promise.resolve(null),
    readRecovery: () => Promise.resolve(null),
    writeRecovery: () => Promise.resolve(),
    setDirty: () => undefined,
    openRecent: (path) =>
      Promise.resolve({
        path,
        contents: serializeWorkbook(createWorkbook(createDocument('最近规划'))),
      }),
    onMenuAction: () => () => undefined,
  }
  return () => {
    queryClient.removeQueries({ queryKey: ['recent-files'] })
    if (previous) window.trelyx = previous
    else delete window.trelyx
  }
}

const openRecentMenu = async (canvasElement: HTMLElement) => {
  const page = within(canvasElement.ownerDocument.body)
  await userEvent.click(within(canvasElement).getByRole('button', { name: '文件菜单' }))
  await userEvent.hover(page.getByRole('menuitem', { name: '最近文件' }))
  return page
}

const meta = {
  title: 'Trelyx/窗口标题栏',
  component: Toolbar,
  parameters: { layout: 'fullscreen' },
  beforeEach: () => {
    useEditor.getState().replace(createExampleDocument())
    useEditor.setState({ recovery: null, outlineOpen: false, inspectorOpen: false })
  },
  render: (_, { globals }) => (
    <TooltipProvider>
      <div
        className="app-shell flex h-full w-full min-w-0 flex-col"
        data-platform={globals.platform === 'macos' ? 'macos' : 'windows'}
        data-focused={globals.focused !== false}
        data-fullscreen={globals.fullscreen === true}
      >
        <Toolbar />
      </div>
    </TooltipProvider>
  ),
} satisfies Meta<typeof Toolbar>
export default meta
type Story = StoryObj<typeof meta>

// Native caption buttons are drawn by Electron and appear only in the desktop app.
export const MacOS: Story = { globals: { platform: 'macos' } }
export const WindowsLinux: Story = { globals: { platform: 'windows' } }
export const Inactive: Story = { globals: { platform: 'macos', focused: false } }
export const Fullscreen: Story = {
  globals: { platform: 'macos', fullscreen: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const page = within(canvasElement.ownerDocument.body)
    const button = canvas.getByRole('button', { name: '文件菜单' })
    button.focus()
    await expect(button).toHaveFocus()
    await userEvent.keyboard('{Enter}')
    await userEvent.click(page.getByRole('menuitem', { name: '新建导图' }))
    await expect(useWorkspace.getState().screen).toBe('create-document')
    await expect(canvas.getByRole('heading', { level: 1 })).toHaveTextContent('产品规划')
  },
}

export const RecentFiles: Story = {
  beforeEach: () =>
    installRecentBridge(() =>
      Promise.resolve([{ path: '/recent/产品规划.trelyx', name: '产品规划.trelyx' }]),
    ),
  play: async ({ canvasElement }) => {
    const page = await openRecentMenu(canvasElement)
    await userEvent.click(await page.findByRole('menuitem', { name: '产品规划.trelyx' }))
    await expect(within(canvasElement).getByRole('heading', { level: 1 })).toHaveTextContent(
      '最近规划.trelyx',
    )
    await expect(useEditor.getState().path).toBe('/recent/产品规划.trelyx')
  },
}
export const RecentFilesEmpty: Story = {
  beforeEach: () => installRecentBridge(() => Promise.resolve([])),
  play: async ({ canvasElement }) => {
    const page = await openRecentMenu(canvasElement)
    await expect(await page.findByText('还没有最近打开的文件。')).toBeVisible()
  },
}
export const RecentFilesUnavailable: Story = {
  beforeEach: () => installRecentBridge(() => Promise.reject(new Error('读取失败'))),
  play: async ({ canvasElement }) => {
    const original = useEditor.getState().workbook
    const page = await openRecentMenu(canvasElement)
    await expect(await page.findByText('无法读取最近文件，请重新打开此菜单。')).toBeVisible()
    await expect(useEditor.getState().workbook).toBe(original)
  },
}
export const RecentFilesLoading: Story = {
  beforeEach: () => installRecentBridge(() => new Promise<never>(() => undefined)),
  play: async ({ canvasElement }) => {
    const page = await openRecentMenu(canvasElement)
    await expect(await page.findByRole('menuitem', { name: '正在读取…' })).toHaveAttribute(
      'aria-disabled',
      'true',
    )
  },
}
