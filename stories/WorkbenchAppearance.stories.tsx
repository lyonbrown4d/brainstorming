import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, userEvent, within, waitFor } from 'storybook/test'
import { App } from '@renderer/App'
import { AppearanceProvider } from '@renderer/components/appearance/AppearanceProvider'
import { installPlatformAPI } from '@renderer/lib/desktop'
import { createStoryDesktop } from '@stories/desktopBridge'
import { createWorkbenchDocument } from '@stories/workbenchFixture'
import { useEditor } from '@renderer/state/editor'
import { openDocumentTab } from '@renderer/state/documentTabs'
import { APPEARANCE_STORAGE_KEY, type AppearanceMode } from '@shared/appAppearance'
import type { DesktopPlatform, WindowState } from '@shared/window'

const windowStateListeners = new Set<(state: WindowState) => void>()
const emitWindowState = (state: WindowState): void => {
  windowStateListeners.forEach((listener) => {
    listener(state)
  })
}
const windowActions = {
  minimizeWindow: fn(() => Promise.resolve()),
  toggleMaximizeWindow: fn(() => Promise.resolve()),
  closeWindow: fn(() => Promise.resolve()),
}

interface PreviewProps {
  platform: DesktopPlatform
  appearance: AppearanceMode
}
const WorkbenchPreview = ({ platform, appearance }: PreviewProps) => (
  <div className="h-dvh w-full overflow-hidden">
    <AppearanceProvider key={`${platform}:${appearance}`}>
      <App />
    </AppearanceProvider>
  </div>
)

const meta = {
  id: 'workbench-appearance',
  title: 'Brainstorming/暖白与石墨',
  component: WorkbenchPreview,
  parameters: { layout: 'fullscreen' },
  args: { platform: 'windows', appearance: 'light' },
  beforeEach: ({ args }) => {
    windowStateListeners.clear()
    Object.values(windowActions).forEach((action) => action.mockClear())
    const previous = localStorage.getItem(APPEARANCE_STORAGE_KEY)
    localStorage.setItem(APPEARANCE_STORAGE_KEY, args.appearance)
    const restore = installPlatformAPI({
      ...createStoryDesktop(),
      platform: args.platform,
      ...windowActions,
      onWindowStateChanged: (listener) => {
        windowStateListeners.add(listener)
        return () => {
          windowStateListeners.delete(listener)
        }
      },
    })
    openDocumentTab(createWorkbenchDocument(), null, false, true)
    useEditor.setState({ selectedId: 'design', outlineOpen: false, inspectorOpen: true })
    return () => {
      restore()
      if (previous === null) localStorage.removeItem(APPEARANCE_STORAGE_KEY)
      else localStorage.setItem(APPEARANCE_STORAGE_KEY, previous)
    }
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await waitFor(() => expect(document.documentElement.dataset.theme).toBe(args.appearance))
    const header = canvasElement.querySelector('header.toolbar')
    if (!(header instanceof HTMLElement)) throw new Error('Missing desktop titlebar')
    const bounds = header.getBoundingClientRect()
    await expect(bounds.height).toBe(44)
    await expect(header).toHaveAttribute('data-tauri-drag-region')
    await expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth)
    const menu = canvas.getByRole('button', { name: '文件菜单' })
    await expect(menu).toBeVisible()
    await expect(menu.getBoundingClientRect().height).toBe(32)
    await userEvent.click(menu)
    await expect(within(document.body).getByRole('menu', { name: '文件菜单' })).toBeVisible()
    await userEvent.keyboard('{Escape}')
    await expect(menu).toHaveFocus()
    const outline = canvas.getByRole('button', { name: '文档大纲' })
    await userEvent.click(outline)
    await expect(outline).toHaveAttribute('aria-pressed', 'true')
    await userEvent.click(outline)
    await expect(outline).toHaveAttribute('aria-pressed', 'false')
    await expect(canvas.getByRole('complementary', { name: '属性面板' })).toBeVisible()
    await expect(canvas.getByRole('button', { name: '图标与任务标记' })).toHaveAttribute(
      'aria-expanded',
      'false',
    )
    if (args.platform === 'macos') {
      await expect(canvas.queryByRole('button', { name: '关闭窗口' })).not.toBeInTheDocument()
      await expect(header.firstElementChild?.getBoundingClientRect().left).toBeGreaterThanOrEqual(
        112,
      )
      emitWindowState({ focused: true, fullScreen: true })
      await waitFor(() => expect(header.firstElementChild?.getBoundingClientRect().left).toBe(20))
      await expect(header.getBoundingClientRect().height).toBe(44)
      emitWindowState({ focused: true, fullScreen: false })
      await waitFor(() =>
        expect(header.firstElementChild?.getBoundingClientRect().left).toBeGreaterThanOrEqual(112),
      )
    } else {
      for (const [name, action] of [
        ['最小化窗口', windowActions.minimizeWindow],
        ['最大化或还原窗口', windowActions.toggleMaximizeWindow],
        ['关闭窗口', windowActions.closeWindow],
      ] as const) {
        const control = canvas.getByRole('button', { name })
        const controlBounds = control.getBoundingClientRect()
        await expect(controlBounds.height).toBe(44)
        await expect(controlBounds.width).toBe(40)
        await expect(controlBounds.top).toBe(bounds.top)
        await userEvent.click(control)
        await expect(action).toHaveBeenCalledOnce()
      }
      // The actions wrapper reserves controls with padding; compare the actual clickable edges.
      const action = canvas.getByRole('button', { name: '属性面板' }).getBoundingClientRect()
      const controls = canvas.getByRole('button', { name: '最小化窗口' }).getBoundingClientRect()
      await expect(action.right).toBeLessThanOrEqual(controls.left)
    }
    const node = canvas.getByTestId('topic-design')
    await expect(node).toBeVisible()
    const surface = canvas.getByRole('tabpanel', { name: '当前画布' })
    await expect(surface.getBoundingClientRect().height).toBeGreaterThan(400)
    await waitFor(() =>
      expect(getComputedStyle(surface).backgroundColor).toBe(
        args.appearance === 'dark' ? 'rgb(28, 30, 34)' : 'rgb(247, 247, 242)',
      ),
    )
    await userEvent.click(canvas.getByRole('button', { name: '展开浮动工具栏' }))
  },
} satisfies Meta<typeof WorkbenchPreview>
export default meta
type Story = StoryObj<typeof meta>
export const WindowsLight: Story = {}
export const WindowsDark: Story = { args: { appearance: 'dark' } }
export const MacLight: Story = { args: { platform: 'macos' } }
export const MacDark: Story = { args: { platform: 'macos', appearance: 'dark' } }
export const LinuxLight: Story = { args: { platform: 'linux' } }
export const LinuxDark: Story = { args: { platform: 'linux', appearance: 'dark' } }
