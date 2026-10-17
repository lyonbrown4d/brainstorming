import type { Preview } from '@storybook/react-vite'
import { createStoryDesktop } from '@stories/desktopBridge'
import { initializeI18n } from '@renderer/i18n'
import { useDocumentTabs } from '@renderer/state/documentTabs'
await initializeI18n('zh-CN')
const preview: Preview = {
  parameters: { layout: 'fullscreen' },
  beforeEach: () => {
    useDocumentTabs.setState({ tabs: [], activeId: null, recovery: [] })
    const previous = window.brainstorming
    window.brainstorming = createStoryDesktop()
    return () => {
      if (previous) window.brainstorming = previous
      else delete window.brainstorming
    }
  },
}
export default preview
