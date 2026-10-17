import '@renderer/styles/ui.css'
import '@renderer/styles/base.css'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, userEvent, within } from 'storybook/test'
import { PaletteChooser } from '@renderer/components/appearance/PaletteChooser'
import { CustomPaletteEditor } from '@renderer/components/appearance/CustomPaletteEditor'
import { AppearanceProvider } from '@renderer/components/appearance/AppearanceProvider'
import { AppAppearance } from '@renderer/components/appearance/AppAppearance'
import { mapPalettes } from '@shared/palettes'

const meta = {
  title: 'Trelyx/外观与配色',
  component: PaletteChooser,
  parameters: { layout: 'centered' },
  args: { settings: { theme: 'trelyx' }, onSelect: fn() },
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
export const SystemAppearance: Story = {
  render: () => (
    <AppearanceProvider>
      <AppAppearance />
    </AppearanceProvider>
  ),
}
