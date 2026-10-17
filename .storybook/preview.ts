import type { Preview } from '@storybook/react-vite'
import { createStoryDesktop } from '@stories/desktopBridge'
import { initializeI18n } from '@renderer/i18n'
import { useDocumentTabs } from '@renderer/state/documentTabs'
await initializeI18n('zh-CN')
const preview: Preview = {
  parameters: { layout: 'fullscreen' },
  beforeEach: () => {
    useDocumentTabs.setState({ tabs: [], activeId: null, recovery: [] })
    const previous = window.trelyx
    window.trelyx = createStoryDesktop()
    return () => {
      if (previous) window.trelyx = previous
      else delete window.trelyx
    }
  },
}
export default preview
