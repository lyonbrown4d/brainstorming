import '@renderer/styles/ui.css'
import '@renderer/styles/base.css'
import type { DesktopAPI } from '@shared/contracts'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, userEvent, waitFor, within } from 'storybook/test'
import { MemoryRouter, useLocation, useNavigate } from 'react-router'
import { AppearanceProvider } from '@renderer/components/appearance/AppearanceProvider'
import { SettingsButton } from '@renderer/components/settings/SettingsButton'
import { SettingsRoute } from '@renderer/routing/SettingsRoute'
import { WorkspaceRoutes } from '@renderer/routing/WorkspaceRouter'
import { initializeI18n, translate } from '@renderer/i18n'
import { installPlatformAPI } from '@renderer/lib/desktop'
import { useWorkspace } from '@renderer/state/workspace'
import { useEditor } from '@renderer/state/editor'
import { useCanvasPreferences } from '@renderer/state/canvasPreferences'
import { APPEARANCE_STORAGE_KEY } from '@shared/appAppearance'
import { createStoryDesktop } from '@stories/desktopBridge'

const persistLanguage = fn<DesktopAPI['setLanguage']>((language) => Promise.resolve(language))
const NavigationPreview = () => {
  const location = useLocation()
  const navigate = useNavigate()
  return (
    <div className="h-dvh bg-canvas p-8 text-foreground">
      <h1>工作区内容</h1>
      <SettingsButton />
      <button
        onClick={() => {
          void navigate(-1)
        }}
      >
        历史后退
      </button>
      <output aria-label="当前路径">{location.pathname}</output>
      <SettingsRoute />
    </div>
  )
}
const SettingsPreview = ({ initialPath = '/home' }: { initialPath?: string }) => (
  <AppearanceProvider>
    <MemoryRouter initialEntries={[initialPath]}>
      <WorkspaceRoutes>
        <NavigationPreview />
      </WorkspaceRoutes>
    </MemoryRouter>
  </AppearanceProvider>
)
const meta = {
  title: 'Brainstorming/应用设置与导航',
  component: SettingsPreview,
  parameters: { layout: 'fullscreen' },
  beforeEach: async () => {
    await initializeI18n('zh-CN')
    useWorkspace.setState(useWorkspace.getInitialState(), true)
    useEditor.setState({ busy: false, editingId: null })
    const previousTheme = localStorage.getItem(APPEARANCE_STORAGE_KEY)
    const previousMinimap = useCanvasPreferences.getState().minimap
    const previousStorage = localStorage.getItem('brainstorming-canvas-preferences')
    localStorage.setItem(APPEARANCE_STORAGE_KEY, 'system')
    useCanvasPreferences.getState().setMinimap(true)
    persistLanguage.mockReset().mockImplementation((language) => Promise.resolve(language))
    const restore = installPlatformAPI({ ...createStoryDesktop(), setLanguage: persistLanguage })
    return async () => {
      restore()
      useCanvasPreferences.getState().setMinimap(previousMinimap)
      if (previousTheme === null) localStorage.removeItem(APPEARANCE_STORAGE_KEY)
      else localStorage.setItem(APPEARANCE_STORAGE_KEY, previousTheme)
      if (previousStorage === null) localStorage.removeItem('brainstorming-canvas-preferences')
      else localStorage.setItem('brainstorming-canvas-preferences', previousStorage)
      await initializeI18n('zh-CN')
    }
  },
} satisfies Meta<typeof SettingsPreview>
export default meta
type Story = StoryObj<typeof meta>

const findSettingsDialog = (canvasElement: HTMLElement, name = '应用设置') =>
  within(canvasElement.ownerDocument.body).findByRole(
    'dialog',
    { name },
    {
      timeout: 15_000,
      onTimeout: (error) =>
        new Error(
          `${error.name}: settings dialog did not mount. Route: ${canvasElement.querySelector('output')?.textContent}; canvas: ${canvasElement.innerHTML.slice(-2500)}; dialogs: ${Array.from(
            canvasElement.ownerDocument.querySelectorAll('[role="dialog"]'),
          )
            .map((dialog) => dialog.outerHTML.slice(0, 1500))
            .join('\n')}`,
        ),
    },
  )

export const PersistPreferencesAndReturn: Story = {
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body)
    const hash = window.location.hash
    await userEvent.click(page.getByRole('button', { name: '应用设置' }))
    const dialog = within(await findSettingsDialog(canvasElement))
    await userEvent.click(dialog.getByRole('combobox', { name: '界面语言' }))
    await userEvent.click(page.getByRole('option', { name: 'English' }))
    await waitFor(() => expect(persistLanguage).toHaveBeenLastCalledWith('en'))
    await waitFor(() => expect(page.getByRole('dialog', { name: 'Settings' })).toBeVisible())
    await userEvent.click(dialog.getByRole('combobox', { name: translate('appAppearance') }))
    await userEvent.click(page.getByRole('option', { name: translate('dark') }))
    await waitFor(() => expect(localStorage.getItem(APPEARANCE_STORAGE_KEY)).toBe('dark'))
    await userEvent.click(dialog.getByRole('tab', { name: translate('settingsCanvas') }))
    await userEvent.click(dialog.getByRole('checkbox', { name: translate('canvasMinimap') }))
    await waitFor(() => expect(useCanvasPreferences.getState().minimap).toBe(false))
    await expect(localStorage.getItem('brainstorming-canvas-preferences')).toContain(
      '"minimap":false',
    )
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(page.queryByRole('dialog')).not.toBeInTheDocument())
    await expect(page.getByLabelText('当前路径')).toHaveTextContent('/home')
    await expect(page.getByRole('heading', { name: '工作区内容' })).toBeVisible()
    await expect(window.location.hash).toBe(hash)
    await userEvent.click(page.getByRole('button', { name: 'Settings' }))
    const reopened = within(await findSettingsDialog(canvasElement, 'Settings'))
    await expect(
      reopened.getByRole('combobox', { name: translate('interfaceLanguage') }),
    ).toHaveTextContent('English')
    await expect(
      reopened.getByRole('combobox', { name: translate('appAppearance') }),
    ).toHaveTextContent(translate('dark'))
    await userEvent.keyboard('{Escape}')
  },
}

export const PersistenceFailure: Story = {
  beforeEach: () => {
    persistLanguage.mockRejectedValue(new Error('Native settings write failed'))
  },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body)
    await userEvent.click(page.getByRole('button', { name: '应用设置' }))
    const dialog = within(await findSettingsDialog(canvasElement))
    await userEvent.click(dialog.getByRole('combobox', { name: '界面语言' }))
    await userEvent.click(page.getByRole('option', { name: 'English' }))
    await expect(await dialog.findByRole('alert')).toHaveTextContent(
      translate('languageSaveFailed'),
    )
    await expect(dialog.getByRole('combobox', { name: '界面语言' })).toHaveTextContent('简体中文')
    await expect(persistLanguage).toHaveBeenCalledTimes(1)
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(page.queryByRole('dialog')).not.toBeInTheDocument())
    await expect(page.getByLabelText('当前路径')).toHaveTextContent('/home')
  },
}

export const DirectSettingsURL: Story = {
  args: { initialPath: '/settings' },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body)
    await expect(await findSettingsDialog(canvasElement)).toBeVisible()
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(page.getByLabelText('当前路径')).toHaveTextContent('/home'))
    await userEvent.click(page.getByRole('button', { name: '历史后退' }))
    await expect(page.getByLabelText('当前路径')).toHaveTextContent('/home')
  },
}

export const SettingsOverview: Story = {
  args: { initialPath: '/settings' },
}

export const DarkSettings: Story = {
  args: { initialPath: '/settings' },
  beforeEach: () => {
    localStorage.setItem(APPEARANCE_STORAGE_KEY, 'dark')
  },
}

export const EnglishSettings: Story = {
  args: { initialPath: '/settings' },
  beforeEach: async () => {
    await initializeI18n('en')
  },
}
