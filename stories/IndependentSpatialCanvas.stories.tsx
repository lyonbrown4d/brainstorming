import { IndependentSpatialPreview } from '@stories/IndependentSpatialEvidence'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, waitFor } from 'storybook/test'
import { applyCommand, createDocument } from '@core'
import { setInkMode } from '@renderer/state/canvasInk'
import { useEditor } from '@renderer/state/editor'
import { useSelection } from '@renderer/state/selection'
import { useSpatialView } from '@renderer/state/spatialView'
import { useSpatialLens } from '@renderer/state/spatialLens'

const Preview = IndependentSpatialPreview

const meta = {
  title: 'Brainstorming/Independent Spatial Canvas',
  component: Preview,
  parameters: { layout: 'fullscreen' },
  beforeEach: () => {
    setInkMode('select')
    useSelection.setState({ sheets: {}, drawings: {} })
    useSpatialView.setState({ views: {} })
    useSpatialLens.setState({ distances: {} })
    useEditor.getState().replace(
      applyCommand(createDocument('独立三维画布'), {
        type: 'batch',
        commands: [
          {
            type: 'setDocumentSettings',
            settings: { spatial: { mode: '3d', yaw: 0, pitch: 0, spacing: 80 } },
          },
          { type: 'addTopic', parentId: 'root', id: 'branch-a', title: '产品方向', side: 'right' },
          { type: 'addTopic', parentId: 'root', id: 'branch-b', title: '发布计划', side: 'left' },
          { type: 'addTopic', parentId: 'branch-a', id: 'detail', title: '用户访谈' },
        ],
      }),
    )
    useEditor.setState({ outlineOpen: false, inspectorOpen: false, recovery: null })
  },
} satisfies Meta<typeof Preview>
export default meta
type Story = StoryObj<typeof meta>

export const Interactive: Story = {
  play: async ({ canvasElement }) => {
    await waitFor(
      async () => {
        await expect(canvasElement.querySelector('[data-spatial-independent]')).toBeVisible()
        await expect(canvasElement.querySelector('[data-canvas-loading]')).toBeNull()
        await expect(
          canvasElement.querySelector('canvas[data-spatial-canvas="three"]'),
        ).toBeVisible()
      },
      { timeout: 20000 },
    )
    await expect(canvasElement.querySelector('.react-flow')).toBeNull()
    await expect(canvasElement.querySelector('.react-flow__node')).toBeNull()
  },
}
