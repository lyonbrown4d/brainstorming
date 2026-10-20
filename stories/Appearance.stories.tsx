import '@renderer/styles/ui.css'
import '@renderer/styles/base.scss'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, userEvent, waitFor, within } from 'storybook/test'
import { PaletteChooser } from '@renderer/components/appearance/PaletteChooser'
import { CustomPaletteEditor } from '@renderer/components/appearance/CustomPaletteEditor'
import { AppearanceProvider } from '@renderer/components/appearance/AppearanceProvider'
import { AppAppearance } from '@renderer/components/appearance/AppAppearance'
import { mapPalettes } from '@shared/palettes'
import { APPEARANCE_STORAGE_KEY } from '@shared/appAppearance'
import type { DesktopAPI } from '@shared/contracts'
import { installPlatformAPI } from '@renderer/lib/desktop'
import { createStoryDesktop } from '@stories/desktopBridge'

const meta = {
  title: 'Brainstorming/外观与配色',
  component: PaletteChooser,
  parameters: { layout: 'centered' },
  args: { settings: { theme: 'brainstorming' }, onSelect: fn() },
  decorators: [
    (Story) => (
      <div className="w-[408px] rounded-xl bg-background p-4 text-foreground">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof PaletteChooser>
export default meta
type Story = StoryObj<typeof meta>
export const Presets: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getAllByRole('button')).toHaveLength(8)
    await userEvent.click(canvas.getByRole('button', { name: '使用夜航配色' }))
    await expect(args.onSelect).toHaveBeenCalledWith('night')
  },
}
export const NightPalette: Story = { args: { settings: { theme: 'night' } } }
export const Custom: Story = {
  render: () => <CustomPaletteEditor initial={mapPalettes[0]} onSave={fn()} />,
}
const setNativeAppearance = fn<DesktopAPI['setAppearance']>(() => Promise.resolve())
let notifySystemTheme: (() => void) | undefined
export const SystemAppearance: Story = {
  beforeEach: () => {
    const previous = localStorage.getItem(APPEARANCE_STORAGE_KEY)
    localStorage.setItem(APPEARANCE_STORAGE_KEY, 'system')
    setNativeAppearance.mockClear()
    const restore = installPlatformAPI({
      ...createStoryDesktop(),
      setAppearance: setNativeAppearance,
      onSystemThemeChanged: (callback) => {
        notifySystemTheme = callback
        return () => {
          notifySystemTheme = undefined
        }
      },
    })
    return () => {
      restore()
      if (previous === null) localStorage.removeItem(APPEARANCE_STORAGE_KEY)
      else localStorage.setItem(APPEARANCE_STORAGE_KEY, previous)
    }
  },
  render: () => (
    <AppearanceProvider>
      <AppAppearance />
    </AppearanceProvider>
  ),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body)
    await waitFor(() => expect(setNativeAppearance).toHaveBeenLastCalledWith('system'))
    await expect(['light', 'dark']).toContain(document.documentElement.dataset.theme)
    await userEvent.click(page.getByRole('button', { name: '应用外观' }))
    await userEvent.click(page.getByRole('menuitemradio', { name: '深色' }))
    await waitFor(() => expect(setNativeAppearance).toHaveBeenLastCalledWith('dark'))
    await expect(localStorage.getItem(APPEARANCE_STORAGE_KEY)).toBe('dark')
    notifySystemTheme?.()
    await expect(localStorage.getItem(APPEARANCE_STORAGE_KEY)).toBe('dark')
    await expect(setNativeAppearance).toHaveBeenLastCalledWith('dark')
    await userEvent.click(page.getByRole('button', { name: '应用外观' }))
    await userEvent.click(page.getByRole('menuitemradio', { name: '跟随系统' }))
    await waitFor(() => expect(setNativeAppearance).toHaveBeenLastCalledWith('system'))
    await expect(localStorage.getItem(APPEARANCE_STORAGE_KEY)).toBe('system')
  },
}
