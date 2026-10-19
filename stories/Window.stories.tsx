import type { Meta, StoryObj } from '@storybook/react-vite'
import { createStoryDesktop } from '@stories/desktopBridge'
import { installPlatformAPI } from '@renderer/lib/desktop'
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
import '@renderer/styles/window.css'

const installRecentBridge = (getRecentFiles: DesktopAPI['getRecentFiles']) => {
  queryClient.removeQueries({ queryKey: ['recent-files'] })
  const restore = installPlatformAPI({
    ...createStoryDesktop(),
    getRecentFiles,
    openRecent: (path) =>
      Promise.resolve({
        path,
        contents: serializeWorkbook(createWorkbook(createDocument('最近规划'))),
      }),
  })
  return () => {
    queryClient.removeQueries({ queryKey: ['recent-files'] })
    restore()
  }
}

const openRecentMenu = async (canvasElement: HTMLElement) => {
  const page = within(canvasElement.ownerDocument.body)
  await userEvent.click(within(canvasElement).getByRole('button', { name: '文件菜单' }))
  await userEvent.hover(page.getByRole('menuitem', { name: '最近文件' }))
  return page
}

const meta = {
  title: 'Brainstorming/窗口标题栏',
  component: Toolbar,
  parameters: { layout: 'fullscreen' },
  beforeEach: () => {
    useEditor.getState().replace(createExampleDocument())
    useEditor.setState({ recovery: null, outlineOpen: false, inspectorOpen: false })
  },
  render: (_, { globals }) => (
    <TooltipProvider>
      <div
        className="app-shell group/shell flex h-full w-full min-w-0 flex-col"
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

// Native caption buttons are drawn by the native host and appear only in the desktop app.
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
      Promise.resolve([{ path: '/recent/产品规划.brainstorming', name: '产品规划.brainstorming' }]),
    ),
  play: async ({ canvasElement }) => {
    const page = await openRecentMenu(canvasElement)
    await userEvent.click(await page.findByRole('menuitem', { name: '产品规划.brainstorming' }))
    await expect(within(canvasElement).getByRole('heading', { level: 1 })).toHaveTextContent(
      '最近规划.brainstorming',
    )
    await expect(useEditor.getState().path).toBe('/recent/产品规划.brainstorming')
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
