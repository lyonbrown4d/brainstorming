import type { Meta, StoryObj } from '@storybook/react-vite'
import { applyCommand, createDocument, createExampleDocument, createWorkbook } from '@core'
import { App } from '@renderer/App'
import { useEditor } from '@renderer/state/editor'
import {
  outlineSessionKey,
  updateOutlineSession,
  useOutlineWorkspaceState,
} from '@renderer/components/documents/OutlineWorkspaceState'

const openOutline = (): void => {
  const state = useEditor.getState()
  updateOutlineSession(outlineSessionKey(state.workbook.id, state.activeSheetId), { open: true })
}

const meta = {
  title: 'Brainstorming/大纲工作区',
  component: App,
  parameters: { layout: 'fullscreen' },
  beforeEach: () => {
    const workbook = createWorkbook(createExampleDocument())
    useEditor.getState().replace({
      ...workbook,
      sheets: [
        ...workbook.sheets,
        {
          id: 'outline-second-sheet',
          name: '第二张',
          document: createDocument('第二张画布', 'outline-second-document'),
        },
      ],
    })
    useEditor.setState({ recovery: null, outlineOpen: false, inspectorOpen: false })
    useOutlineWorkspaceState.setState({ sessions: {} })
  },
} satisfies Meta<typeof App>
export default meta
type Story = StoryObj<typeof meta>

export const Editing: Story = { beforeEach: openOutline }
export const CanvasSwitch: Story = {}
export const WithNavigation: Story = {
  beforeEach: () => {
    openOutline()
    useEditor.setState({ outlineOpen: true, inspectorOpen: true })
  },
}
export const FloatingIdeas: Story = {
  beforeEach: () => {
    useEditor.getState().replace(
      applyCommand(createExampleDocument(), {
        type: 'addFloatingTopic',
        id: 'floating',
        title: '游离想法',
        x: 480,
        y: 240,
      }),
    )
    openOutline()
  },
}
export const LargeOutline: Story = {
  beforeEach: () => {
    const document = applyCommand(createDocument('大量主题', 'outline-large'), {
      type: 'batch',
      commands: Array.from({ length: 1200 }, (_, index) => ({
        type: 'addTopic' as const,
        parentId: 'root',
        id: `large-${index}`,
        title: `主题 ${index + 1}`,
      })),
    })
    useEditor.getState().replace(document)
    openOutline()
  },
}
