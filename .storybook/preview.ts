import type { Preview } from '@storybook/react-vite'
import { installPlatformAPI } from '@renderer/lib/desktop'
import { createStoryDesktop } from '@stories/desktopBridge'
import { initializeI18n } from '@renderer/i18n'
import { useDocumentTabs } from '@renderer/state/documentTabs'
await initializeI18n('zh-CN')
const preview: Preview = {
  parameters: { layout: 'fullscreen' },
  beforeEach: () => {
    useDocumentTabs.setState({ tabs: [], activeId: null, recovery: [] })
    return installPlatformAPI(createStoryDesktop())
  },
}
export default preview
