import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, userEvent, waitFor, within } from 'storybook/test'
import { createExampleDocument } from '@core'
import { ToolbarFileMenu } from '@renderer/components/ToolbarFileMenu'
import { installPlatformAPI } from '@renderer/lib/desktop'
import { queryClient } from '@renderer/lib/queryClient'
import { useEditor } from '@renderer/state/editor'
import type { DesktopWindowsAPI } from '@shared/windows'
import { createStoryDesktop } from '@stories/desktopBridge'
import '@renderer/styles/ui.css'
import '@renderer/styles/base.scss'

const focusWindow = fn<DesktopWindowsAPI['focusWindow']>(() => Promise.resolve())
const newWindow = fn<DesktopWindowsAPI['newWindow']>(() => Promise.resolve('new'))
const openDocumentInNewWindow = fn<DesktopWindowsAPI['openDocumentInNewWindow']>(() =>
  Promise.resolve(),
)
const windowAPI: DesktopWindowsAPI = {
  focusWindow,
  newWindow,
  openDocumentInNewWindow,
  listWindows: () =>
    Promise.resolve([
      { id: 'current', title: '产品规划', current: true },
      { id: 'research', title: '研究笔记', current: false },
    ]),
  moveDocument: () => Promise.resolve({ windowId: 'new' }),
  takeTransferredDocument: () => Promise.resolve(null),
  acknowledgeTransfer: () => Promise.resolve(),
  onDocumentTransfer: () => () => undefined,
  onFocusDocument: () => () => undefined,
  syncMenuState: () => Promise.resolve(),
}
const installWindows = (overrides: Partial<DesktopWindowsAPI> = {}) => {
  queryClient.removeQueries({ queryKey: ['editor-windows'] })
  const restore = installPlatformAPI({
    ...createStoryDesktop(),
    windows: { ...windowAPI, ...overrides },
  })
  return () => {
    queryClient.removeQueries({ queryKey: ['editor-windows'] })
    restore()
  }
}
const openFileMenu = async (canvasElement: HTMLElement) => {
  await userEvent.click(within(canvasElement).getByRole('button', { name: '文件菜单' }))
  return within(canvasElement.ownerDocument.body)
}
const meta = {
  title: 'Brainstorming/窗口切换',
  component: ToolbarFileMenu,
  beforeEach: () => {
    focusWindow.mockClear()
    newWindow.mockClear()
    openDocumentInNewWindow.mockClear()
    useEditor.getState().replace(createExampleDocument())
    useEditor.getState().setError(null)
    return installWindows()
  },
  render: () => (
    <div className="flex h-screen items-start bg-background p-4 text-foreground">
      <ToolbarFileMenu />
    </div>
  ),
} satisfies Meta<typeof ToolbarFileMenu>
export default meta
type Story = StoryObj<typeof meta>

export const SwitchWindow: Story = {
  play: async ({ canvasElement }) => {
    const page = await openFileMenu(canvasElement)
    await expect(
      await page.findByRole('menuitem', { name: '产品规划（当前窗口）' }),
    ).toHaveAttribute('aria-disabled', 'true')
    await expect(page.getByRole('menuitem', { name: '最近文件' })).toBeVisible()
    await userEvent.click(await page.findByRole('menuitem', { name: '研究笔记' }))
    await expect(focusWindow).toHaveBeenCalledWith('research')
    await expect(useEditor.getState().workbook.title).toBe('产品规划')
  },
}
export const CreateAndOpenWindow: Story = {
  play: async ({ canvasElement }) => {
    const page = await openFileMenu(canvasElement)
    await userEvent.click(page.getByRole('menuitem', { name: '新建窗口' }))
    await expect(newWindow).toHaveBeenCalled()
    await openFileMenu(canvasElement)
    await userEvent.click(page.getByRole('menuitem', { name: '在新窗口打开…' }))
    await expect(openDocumentInNewWindow).toHaveBeenCalled()
  },
}
export const WindowListUnavailable: Story = {
  beforeEach: () => installWindows({ listWindows: () => Promise.reject(new Error('读取失败')) }),
  play: async ({ canvasElement }) => {
    const page = await openFileMenu(canvasElement)
    await expect(await page.findByText('无法读取窗口列表，请重新打开菜单')).toBeVisible()
    await expect(page.getByRole('menuitem', { name: '新建窗口' })).toBeEnabled()
  },
}
export const SwitchFailed: Story = {
  beforeEach: () => installWindows({ focusWindow: () => Promise.reject(new Error('窗口已关闭')) }),
  play: async ({ canvasElement }) => {
    const page = await openFileMenu(canvasElement)
    await userEvent.click(await page.findByRole('menuitem', { name: '研究笔记' }))
    await waitFor(async () => {
      await expect(useEditor.getState().error).toBe('窗口已关闭')
    })
    await expect(useEditor.getState().workbook.title).toBe('产品规划')
  },
}
export const Loading: Story = {
  beforeEach: () => installWindows({ listWindows: () => new Promise<never>(() => undefined) }),
  play: async ({ canvasElement }) => {
    const page = await openFileMenu(canvasElement)
    await expect(await page.findByRole('menuitem', { name: '正在读取…' })).toHaveAttribute(
      'aria-disabled',
      'true',
    )
  },
}
export const Empty: Story = {
  beforeEach: () => installWindows({ listWindows: () => Promise.resolve([]) }),
  play: async ({ canvasElement }) => {
    const page = await openFileMenu(canvasElement)
    await expect(await page.findByText('没有打开的窗口')).toBeVisible()
  },
}
