import type { Meta, StoryObj } from '@storybook/react-vite'
import startupHtml from '@project/splash.html?raw'
import lightLogo from '@renderer/assets/brand/logo-light.png'
import darkLogo from '@renderer/assets/brand/logo-dark.png'
import themeStyles from '@renderer/styles/ui.css?inline'
import startupStyles from '@renderer/styles/startup.scss?inline'
import { showStartupIssue } from '@renderer/startupStatus'

// Preview the actual pre-React markup rather than maintaining a second React copy.
const preview = startupHtml
  .replaceAll('/src/assets/brand/logo-light.png', lightLogo)
  .replaceAll('/src/assets/brand/logo-dark.png', darkLogo)
  .replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, '')
  .replace(/<link\b[^>]*rel="stylesheet"[^>]*>/g, '')
  .replace('</head>', `<style>${themeStyles}${startupStyles}</style></head>`)

const meta = {
  title: 'Brainstorming/启动画面',
  parameters: { layout: 'fullscreen' },
  args: { failed: false },
  render: ({ failed }: { failed: boolean }) => (
    <iframe
      title="Brainstorming 启动画面预览"
      srcDoc={preview}
      className="h-screen w-full border-0"
      onLoad={(event) => {
        const document = event.currentTarget.contentDocument
        if (failed && document) showStartupIssue(document, '界面加载失败，请重新加载后重试。', true)
      }}
    />
  ),
} satisfies Meta<{ failed: boolean }>
export default meta
type Story = StoryObj<typeof meta>

export const Loading: Story = {}
export const Failed: Story = { args: { failed: true } }
