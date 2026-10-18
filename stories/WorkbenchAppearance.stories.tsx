import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, userEvent, within, waitFor } from 'storybook/test'
import { App } from '@renderer/App'
import { AppearanceProvider } from '@renderer/components/appearance/AppearanceProvider'
import { installPlatformAPI } from '@renderer/lib/desktop'
import { createStoryDesktop } from '@stories/desktopBridge'
import { createWorkbenchDocument } from '@stories/workbenchFixture'
import { useEditor } from '@renderer/state/editor'
import { openDocumentTab } from '@renderer/state/documentTabs'
import { useSpatialView } from '@renderer/state/spatial'
import { APPEARANCE_STORAGE_KEY, type AppearanceMode } from '@shared/appAppearance'
import type { DesktopPlatform } from '@shared/window'

interface PreviewProps {
  platform: DesktopPlatform
  appearance: AppearanceMode
  spatial?: boolean
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
  args: { platform: 'windows', appearance: 'light', spatial: false },
  beforeEach: ({ args }) => {
    const previous = localStorage.getItem(APPEARANCE_STORAGE_KEY)
    localStorage.setItem(APPEARANCE_STORAGE_KEY, args.appearance)
    const restore = installPlatformAPI({
      ...createStoryDesktop(),
      platform: args.platform,
      minimizeWindow: fn(() => Promise.resolve()),
      toggleMaximizeWindow: fn(() => Promise.resolve()),
      closeWindow: fn(() => Promise.resolve()),
    })
    openDocumentTab(createWorkbenchDocument(), null, false, true)
    useEditor.setState({ selectedId: 'design', outlineOpen: false, inspectorOpen: true })
    useSpatialView
      .getState()
      .setMode(useEditor.getState().activeSheetId, args.spatial ? '3d' : '2d')
    return () => {
      restore()
      if (previous === null) localStorage.removeItem(APPEARANCE_STORAGE_KEY)
      else localStorage.setItem(APPEARANCE_STORAGE_KEY, previous)
    }
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await waitFor(() => expect(document.documentElement.dataset.theme).toBe(args.appearance))
    await expect(canvas.getByRole('button', { name: '文件菜单' })).toBeVisible()
    await expect(canvas.getByRole('complementary', { name: '属性面板' })).toBeVisible()
    await expect(canvas.getByRole('button', { name: '图标与任务标记' })).toHaveAttribute(
      'aria-expanded',
      'false',
    )
    if (args.platform === 'macos')
      await expect(canvas.queryByRole('button', { name: '关闭窗口' })).not.toBeInTheDocument()
    else await expect(canvas.getByRole('button', { name: '关闭窗口' })).toBeVisible()
    if (!args.spatial) {
      const node = canvas.getByTestId('topic-design')
      await expect(node).toBeVisible()
      const surface = canvas.getByRole('tabpanel', { name: '当前画布' })
      await expect(surface.getBoundingClientRect().height).toBeGreaterThan(400)
      await waitFor(() =>
        expect(getComputedStyle(surface).backgroundColor).toBe(
          args.appearance === 'dark' ? 'rgb(28, 30, 34)' : 'rgb(247, 247, 242)',
        ),
      )
    } else
      await expect(
        await canvas.findByRole('button', { name: '选择主题 视觉设计' }, { timeout: 10000 }),
      ).toBeVisible()
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
export const SpatialLight: Story = { args: { spatial: true } }
export const SpatialDark: Story = { args: { spatial: true, appearance: 'dark' } }
