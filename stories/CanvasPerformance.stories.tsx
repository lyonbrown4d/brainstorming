import type { Meta, StoryObj } from '@storybook/react-vite'
import { App } from '@renderer/App'
import { useEditor } from '@renderer/state/editor'
import { setInkMode } from '@renderer/state/canvasInk'
import { createFixtureDocument } from '@core'

const meta = {
  title: 'Brainstorming/Canvas Performance',
  component: App,
  parameters: { layout: 'fullscreen' },
  beforeEach: () => {
    setInkMode('select')
    useEditor.getState().replace(createFixtureDocument(1000))
    useEditor.setState({ outlineOpen: false, inspectorOpen: false, recovery: null })
  },
} satisfies Meta<typeof App>
export default meta
type Story = StoryObj<typeof meta>
export const ThousandTopics: Story = {}
